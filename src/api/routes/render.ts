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
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No template file provided', code: 'MISSING_FILE' });
            return;
        }

        // Parse request body (may be JSON string or form field)

        logger.info(`req.body.operation ${req.body.operations} `);

        let requestData;
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

        const buffer = req.file.buffer;
        const originalName = req.file.originalname;

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

        const startTime = Date.now();
        let renderHistoryId: string | null = null;
        let errorMessage: string | undefined;

        try {
            if (requestData.result === 'pdf') {
                outputBuffer = (await pdfConverter.convert(outputDocx, originalName)).buffer;
            } else if (requestData.result === 'html') {
                outputBuffer = (await htmlConverter.convert(outputDocx, originalName)).buffer;
            } else {
                outputBuffer = docxOutput.output(outputDocx, originalName).buffer;
            }

            const durationMs = Date.now() - startTime;

            // Track render history (if authenticated)
            if (req.user) {
                const recordId = await renderHistoryService.createRenderRecord({
                    userId: req.user.userId,
                    // No templateId for one-time renders (template not stored)
                    templateName: originalName,
                    data: requestData.data,
                    outputFormat: requestData.result,
                });
                renderHistoryId = recordId;

                await renderHistoryService.updateRenderStatus(recordId, {
                    status: 'success',
                    fileSize: outputBuffer.length,
                    durationMs,
                });

                // Audit log
                await auditService.logAction({
                    userId: req.user.userId,
                    username: req.user.username,
                    action: 'render_success',
                    resourceType: 'render',
                    resourceId: recordId,
                    details: {
                        render_type: 'one_time',
                        source: req.user.role === 'api' ? 'api' : 'web',
                        template: originalName,
                        format: requestData.result,
                        size: outputBuffer.length,
                        duration: durationMs,
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                });
            }
        } catch (conversionError) {
            const durationMs = Date.now() - startTime;
            errorMessage = conversionError instanceof Error ? conversionError.message : 'Unknown error';

            // Track failed render
            if (req.user && renderHistoryId) {
                await renderHistoryService.updateRenderStatus(renderHistoryId, {
                    status: 'failure',
                    durationMs,
                    errorMessage,
                    errorStack: conversionError instanceof Error ? conversionError.stack : undefined,
                });

                // Audit log failure
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
                        format: requestData.result,
                        error: errorMessage,
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                });
            }
            throw conversionError;
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
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/render/:templateId - Render from stored template
 */
router.post('/:templateId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { templateId } = req.params;

        // Parse and validate request
        const requestData = RenderByIdRequestSchema.parse(req.body);

        // Get template from storage
        const { buffer, metadata } = await templateStore.get(templateId);

        // Load template
        const loaded = await templateLoader.loadFromBuffer(buffer, metadata.originalName);

        // Detect source and normalize if needed
        const sourceInfo = sourceDetector.detect(loaded.zip);
        const normResult = await normalizer.normalizeIfNeeded(buffer, sourceInfo);

        // If normalized, reload
        let templateZip = loaded.zip;
        if (normResult.normalized) {
            const reloaded = await templateLoader.loadFromBuffer(normResult.buffer, metadata.originalName);
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
        const startTime = Date.now();
        let renderHistoryId: string | null = null;
        let errorMessage: string | undefined;

        try {
            switch (outputFormat) {
                case 'pdf':
                    output = await pdfConverter.convert(renderResult.buffer, metadata.originalName);
                    break;
                case 'html':
                    output = await htmlConverter.convert(renderResult.buffer, metadata.originalName);
                    break;
                default:
                    output = docxOutput.output(renderResult.buffer, metadata.originalName);
            }

            const durationMs = Date.now() - startTime;

            // Track render history (if authenticated)
            if (req.user) {
                const recordId = await renderHistoryService.createRenderRecord({
                    userId: req.user.userId,
                    templateId: templateId,
                    templateName: metadata.originalName,
                    data: requestData.data,
                    outputFormat: outputFormat as 'docx' | 'pdf' | 'html',
                });
                renderHistoryId = recordId;

                await renderHistoryService.updateRenderStatus(recordId, {
                    status: 'success',
                    fileSize: output.buffer.length,
                    durationMs,
                });

                // Audit log
                await auditService.logAction({
                    userId: req.user.userId,
                    username: req.user.username,
                    action: 'render_success',
                    resourceType: 'render',
                    resourceId: recordId,
                    details: {
                        render_type: 'stored_template',
                        source: req.user.role === 'api' ? 'api' : 'web',
                        template_id: templateId,
                        template: metadata.originalName,
                        format: outputFormat,
                        size: output.buffer.length,
                        duration: durationMs,
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                });
            }
        } catch (conversionError) {
            const durationMs = Date.now() - startTime;
            errorMessage = conversionError instanceof Error ? conversionError.message : 'Unknown error';

            // Track failed render
            if (req.user && renderHistoryId) {
                await renderHistoryService.updateRenderStatus(renderHistoryId, {
                    status: 'failure',
                    durationMs,
                    errorMessage,
                    errorStack: conversionError instanceof Error ? conversionError.stack : undefined,
                });

                // Audit log failure
                await auditService.logAction({
                    userId: req.user.userId,
                    username: req.user.username,
                    action: 'render_failure',
                    resourceType: 'render',
                    resourceId: renderHistoryId,
                    details: {
                        render_type: 'stored_template',
                        source: req.user.role === 'api' ? 'api' : 'web',
                        template_id: templateId,
                        template: metadata.originalName,
                        format: outputFormat,
                        error: errorMessage,
                    },
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                });
            }
            throw conversionError;
        }

        // Set response headers
        const { contentType, extension } = getOutputInfo(outputFormat);
        const outputFilename = metadata.originalName.replace(/\.docx$/i, `.${extension}`);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

        if (renderResult.warnings.length > 0) {
            res.setHeader('X-Render-Warnings', JSON.stringify(renderResult.warnings));
        }

        res.send(output.buffer);
    } catch (error) {
        next(error);
    }
});

export default router;
