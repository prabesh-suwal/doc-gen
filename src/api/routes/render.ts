import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../../auth/middleware.js';
import auditService from '../../services/AuditService.js';
import renderHistoryService from '../../services/RenderHistoryService.js';
import config from '../../config/index.js';
import TemplateStore from '../../storage/TemplateStore.js';
import TemplateLoader from '../../core/TemplateLoader.js';
import SourceDetector from '../../core/SourceDetector.js';
import Normalizer from '../../core/Normalizer.js';
import TemplateEngine from '../../core/TemplateEngine.js';
import OperationsProcessor from '../../operations/OperationsProcessor.js';
import PdfConverter from '../../conversion/PdfConverter.js';
import HtmlConverter from '../../conversion/HtmlConverter.js';
import DocxOutput from '../../conversion/DocxOutput.js';
import { RenderRequestSchema, RenderByIdRequestSchema } from '../middleware/validation.js';
import logger from '../../utils/Logger.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.maxFileSize,
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.originalname.endsWith('.docx')) {
            cb(null, true);
        } else {
            cb(new Error('Only DOCX files are allowed'));
        }
    },
});

// Initialize services
const templateStore = new TemplateStore();
const templateLoader = new TemplateLoader();
const sourceDetector = new SourceDetector();
const normalizer = new Normalizer();
const templateEngine = new TemplateEngine();
const operationsProcessor = new OperationsProcessor();
const pdfConverter = new PdfConverter();
const htmlConverter = new HtmlConverter();
const docxOutput = new DocxOutput();

// Initialize storage
templateStore.initialize().catch((err) => {
    logger.error('Failed to initialize template storage:', err);
});

/**
 * Get content type and file extension for output format
 */
function getOutputInfo(format: string): { contentType: string; extension: string } {
    switch (format) {
        case 'pdf':
            return { contentType: 'application/pdf', extension: 'pdf' };
        case 'html':
            return { contentType: 'text/html; charset=utf-8', extension: 'html' };
        default:
            return {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                extension: 'docx'
            };
    }
}

/**
 * POST /api/render - One-time render (template + data in single request)
 */
router.post('/', authenticate, upload.single('template'), async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    let renderHistoryId: string | null = null;
    let requestData: any = {};
    let originalName = '';

    try {
        if (!req.file) {
            res.status(400).json({ error: 'No template file provided', code: 'MISSING_FILE' });
            return;
        }

        originalName = req.file.originalname;

        // Parse request body
        if (typeof req.body.data === 'string') {
            requestData = {
                data: JSON.parse(req.body.data),
                result: req.body.result || 'docx',
                operation: req.body.operations ? JSON.parse(req.body.operations) : undefined,
            };
        } else {
            requestData = RenderRequestSchema.parse({
                data: req.body.data || {},
                result: req.body.result || 'docx',
                operation: req.body.operations,
            });
        }

        // Create render history record immediately
        if (req.user) {
            renderHistoryId = await renderHistoryService.createRenderRecord({
                userId: req.user.userId,
                templateName: originalName,
                data: requestData.data,
                outputFormat: requestData.result,
                operations: requestData.operation,
            });
        }

        const buffer = req.file.buffer;

        // Load and validate template
        const loaded = await templateLoader.loadFromBuffer(buffer, originalName);

        // Detect source and normalize if needed
        const sourceInfo = sourceDetector.detect(loaded.zip);
        const normResult = await normalizer.normalizeIfNeeded(buffer, sourceInfo);

        // If normalized, reload
        let templateZip = loaded.zip;
        if (normResult.normalized) {
            const reloaded = await templateLoader.loadFromBuffer(normResult.buffer, originalName);
            templateZip = reloaded.zip;
        }

        // Process operations
        const processed = operationsProcessor.process(requestData.data, requestData.operation);

        // Render template
        const renderResult = await templateEngine.render(templateZip, {
            data: processed.data,
            operations: processed.operations as Record<string, unknown>,
        });

        // Convert to requested format
        let outputBuffer: Buffer;
        let outputInfo = getOutputInfo(requestData.result);
        const outputDocx = renderResult.buffer;

        if (requestData.result === 'pdf') {
            outputBuffer = (await pdfConverter.convert(outputDocx, originalName)).buffer;
        } else if (requestData.result === 'html') {
            outputBuffer = (await htmlConverter.convert(outputDocx, originalName)).buffer;
        } else {
            outputBuffer = docxOutput.output(outputDocx, originalName).buffer;
        }

        const durationMs = Date.now() - startTime;

        // Update success status
        if (renderHistoryId) {
            await renderHistoryService.updateRenderStatus(renderHistoryId, {
                status: 'success',
                fileSize: outputBuffer.length,
                durationMs,
            });

            // Audit log success
            await auditService.logAction({
                userId: req.user!.userId,
                username: req.user!.username,
                action: 'render_success',
                resourceType: 'render',
                resourceId: renderHistoryId,
                details: {
                    render_type: 'one_time',
                    source: req.user!.role === 'api' ? 'api' : 'web',
                    template: originalName,
                    format: requestData.result,
                    size: outputBuffer.length,
                    duration: durationMs,
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });
        }

        // Set response headers
        const { contentType, extension } = outputInfo;
        const outputFilename = originalName.replace(/\.docx$/i, `.${extension}`);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

        if (renderResult.warnings.length > 0) {
            res.setHeader('X-Render-Warnings', JSON.stringify(renderResult.warnings));
        }

        res.send(outputBuffer);

    } catch (error: any) {
        // Log failure if history record exists
        if (req.user && renderHistoryId) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await renderHistoryService.updateRenderStatus(renderHistoryId, {
                status: 'failure',
                durationMs,
                errorMessage,
                errorStack: error instanceof Error ? error.stack : undefined,
            });

            await auditService.logAction({
                userId: req.user.userId,
                username: req.user.username,
                action: 'render_failure',
                resourceType: 'render',
                resourceId: renderHistoryId,
                details: {
                    render_type: 'one_time',
                    source: req.user.role === 'api' ? 'api' : 'web',
                    template: originalName,
                    format: requestData.result || 'unknown',
                    error: errorMessage,
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });
        }
        next(error);
    }
});

/**
 * POST /api/render/:templateId - Render from stored template
 */

router.post('/:templateId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    let renderHistoryId: string | null = null;
    let requestData: any = {};
    let originalName = '';
    const { templateId } = req.params;

    try {
        // Parse and validate request
        requestData = RenderByIdRequestSchema.parse(req.body);

        // Create render history record immediately with placeholder name
        if (req.user) {
            renderHistoryId = await renderHistoryService.createRenderRecord({
                userId: req.user.userId,
                templateId: templateId,
                templateName: `Template ${templateId}`, // Placeholder until loaded
                data: requestData.data,
                outputFormat: requestData.result || 'docx',
                operations: requestData.operation,
            });
        }

        // Get template from storage
        const { buffer, metadata } = await templateStore.get(templateId);
        originalName = metadata.originalName;

        // Load template
        const loaded = await templateLoader.loadFromBuffer(buffer, originalName);

        // Detect source and normalize if needed
        const sourceInfo = sourceDetector.detect(loaded.zip);
        const normResult = await normalizer.normalizeIfNeeded(buffer, sourceInfo);

        // If normalized, reload
        let templateZip = loaded.zip;
        if (normResult.normalized) {
            const reloaded = await templateLoader.loadFromBuffer(normResult.buffer, originalName);
            templateZip = reloaded.zip;
        }

        // Process operations
        const processed = operationsProcessor.process(requestData.data, requestData.operation);

        // Render template
        const renderResult = await templateEngine.render(templateZip, {
            data: processed.data,
            operations: processed.operations as Record<string, unknown>,
        });

        // Convert to requested format and track
        let output;
        const outputFormat = requestData.result || 'docx';

        if (outputFormat === 'pdf') {
            output = await pdfConverter.convert(renderResult.buffer, originalName);
        } else if (outputFormat === 'html') {
            output = await htmlConverter.convert(renderResult.buffer, originalName);
        } else {
            output = docxOutput.output(renderResult.buffer, originalName);
        }

        const durationMs = Date.now() - startTime;

        // Update success status AND name
        if (renderHistoryId) {
            await renderHistoryService.updateRenderStatus(renderHistoryId, {
                status: 'success',
                fileSize: output.buffer.length,
                durationMs,
                templateName: originalName, // Update with real name
            });

            // Audit log success
            await auditService.logAction({
                userId: req.user!.userId,
                username: req.user!.username,
                action: 'render_success',
                resourceType: 'render',
                resourceId: renderHistoryId,
                details: {
                    render_type: 'stored_template',
                    source: req.user!.role === 'api' ? 'api' : 'web',
                    template_id: templateId,
                    template: originalName,
                    format: outputFormat,
                    size: output.buffer.length,
                    duration: durationMs,
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });
        }

        // Set response headers
        const { contentType, extension } = getOutputInfo(outputFormat);
        const outputFilename = originalName.replace(/\.docx$/i, `.${extension}`);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

        if (renderResult.warnings.length > 0) {
            res.setHeader('X-Render-Warnings', JSON.stringify(renderResult.warnings));
        }

        res.send(output.buffer);

    } catch (error: any) {
        // Log failure if history record exists
        if (req.user && renderHistoryId) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await renderHistoryService.updateRenderStatus(renderHistoryId, {
                status: 'failure',
                durationMs,
                errorMessage,
                errorStack: error instanceof Error ? error.stack : undefined,
                // We don't update name here because we might not know it
            });

            await auditService.logAction({
                userId: req.user.userId,
                username: req.user.username,
                action: 'render_failure',
                resourceType: 'render',
                resourceId: renderHistoryId,
                details: {
                    render_type: 'stored_template',
                    source: req.user.role === 'api' ? 'api' : 'web',
                    template_id: req.params.templateId, // Safe to access here
                    template: originalName || `Template ${req.params.templateId}`,
                    format: requestData.result || 'unknown',
                    error: errorMessage,
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });
        }
        next(error);
    }
});

export default router;
