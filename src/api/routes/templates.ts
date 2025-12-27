import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import config from '../../config/index.js';
import TemplateStore from '../../storage/TemplateStore.js';
import TemplateLoader from '../../core/TemplateLoader.js';
import SourceDetector from '../../core/SourceDetector.js';
import { TemplateUpdateSchema } from '../middleware/validation.js';
import { authenticate, requireRole } from '../../auth/middleware.js';
import auditService from '../../services/AuditService.js';
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

const templateStore = new TemplateStore();
const templateLoader = new TemplateLoader();
const sourceDetector = new SourceDetector();

// Initialize storage
templateStore.initialize().catch((err) => {
    logger.error('Failed to initialize template storage:', err);
});

/**
 * POST /api/templates - Upload a new template (superadmin, manager)
 */
router.post('/', authenticate, requireRole('superadmin', 'manager'), upload.single('template'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No template file provided', code: 'MISSING_FILE' });
            return;
        }

        const buffer = req.file.buffer;
        const originalName = req.file.originalname;

        // Validate the template
        const loaded = await templateLoader.loadFromBuffer(buffer, originalName);

        // Detect source
        const sourceInfo = sourceDetector.detect(loaded.zip);

        // Store the template (file + database)
        const metadata = await templateStore.store(buffer, originalName, sourceInfo.source, req.user!.userId);

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'template_uploaded',
            resourceType: 'template',
            resourceId: metadata.id,
            details: { filename: originalName, size: metadata.size },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.status(201).json({
            success: true,
            template: {
                id: metadata.id,
                filename: metadata.originalName,
                size: metadata.size,
                source: sourceInfo.source,
                createdAt: metadata.createdAt,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/templates - List all templates (all authenticated users)
 */
router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const templates = await templateStore.list();

        // Audit log
        await auditService.logAction({
            userId: _req.user!.userId,
            username: _req.user!.username,
            action: 'template_listed',
            resourceType: 'template',
            details: { count: templates.length },
            ipAddress: _req.ip,
            userAgent: _req.get('user-agent'),
        });

        res.json({
            success: true,
            templates: templates.map((t) => ({
                id: t.id,
                filename: t.originalName,
                size: t.size,
                source: t.source,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
            })),
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/templates/:id - Get template info (all authenticated users)
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const metadata = await templateStore.getMetadata(id);

        if (!metadata) {
            res.status(404).json({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
            return;
        }

        // Get additional info by loading the template
        const { buffer } = await templateStore.get(id);
        const loaded = await templateLoader.loadFromBuffer(buffer, metadata.originalName);
        const sourceInfo = sourceDetector.detect(loaded.zip);
        const markerCheck = sourceDetector.checkTemplateMarkers(loaded.zip);

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'template_viewed',
            resourceType: 'template',
            resourceId: id,
            details: { filename: metadata.originalName },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({
            success: true,
            template: {
                id: metadata.id,
                filename: metadata.originalName,
                size: metadata.size,
                source: sourceInfo.source,
                application: sourceInfo.application,
                version: sourceInfo.version,
                needsNormalization: sourceInfo.needsNormalization,
                markersValid: markerCheck.valid,
                markerIssues: markerCheck.issues,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
                tags: metadata.tags,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/templates/:id - Update template metadata (superadmin, manager)
 */
router.patch('/:id', authenticate, requireRole('superadmin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const updates = TemplateUpdateSchema.parse(req.body);

        const metadata = await templateStore.updateMetadata(id, updates);

        if (!metadata) {
            res.status(404).json({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
            return;
        }

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'template_updated',
            resourceType: 'template',
            resourceId: id,
            details: { filename: metadata.originalName, updates },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({
            success: true,
            template: {
                id: metadata.id,
                filename: metadata.originalName,
                tags: metadata.tags,
                updatedAt: metadata.updatedAt,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/templates/:id - Delete a template (superadmin, manager)
 */
router.delete('/:id', authenticate, requireRole('superadmin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const deleted = await templateStore.delete(id);

        if (!deleted) {
            res.status(404).json({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
            return;
        }

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'template_deleted',
            resourceType: 'template',
            resourceId: id,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/templates/:id/download - Download template file (all authenticated users)
 */
router.get('/:id/download', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { buffer, metadata } = await templateStore.get(id);

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'template_downloaded',
            resourceType: 'template',
            resourceId: id,
            details: { filename: metadata.originalName },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
        res.send(buffer);
    } catch (error) {
        next(error);
    }
});

export default router;
