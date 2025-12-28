import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../auth/middleware.js';
import onlyOfficeService from '../../services/OnlyOfficeService.js';
import { TemplateStore } from '../../storage/TemplateStore.js';
import auditService from '../../services/AuditService.js';
import logger from '../../utils/Logger.js';
import TemplateLoader from '../../core/TemplateLoader.js';
import TemplateEngine from '../../core/TemplateEngine.js';
import DocxOutput from '../../conversion/DocxOutput.js';
import groupService from '../../services/GroupService.js';


const router = Router();
const templateStore = new TemplateStore();
const templateLoader = new TemplateLoader();
const templateEngine = new TemplateEngine();
const docxOutput = new DocxOutput();

/**
 * POST /api/editor/create
 * Create a new blank document for editing
 * Admin and Manager only
 */
router.post('/create', authenticate, requireRole('superadmin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId, filePath } = await onlyOfficeService.createBlankDocument();

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'template_uploaded',
            resourceType: 'template',
            resourceId: documentId,
            details: { filePath, source: 'editor_session_started' },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        logger.info(`Editor session created: ${documentId} by ${req.user!.username}`);
        res.json({ documentId });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/editor/config/:documentId
 * Get OnlyOffice editor configuration
 */
router.get('/config/:documentId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;

        // Check if document exists
        if (!await onlyOfficeService.documentExists(documentId)) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        const config = onlyOfficeService.getEditorConfig(documentId, {
            id: req.user!.userId,
            name: req.user!.username,
        });

        res.json(config);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/editor/download/:documentId
 * Download document for OnlyOffice
 */
router.get('/download/:documentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;

        if (!await onlyOfficeService.documentExists(documentId)) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        const buffer = await onlyOfficeService.getDocument(documentId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="template.docx"`);
        res.send(buffer);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/editor/callback/:documentId
 * OnlyOffice callback for document save events
 */
router.post('/callback/:documentId', async (req: Request, res: Response) => {
    try {
        const { documentId } = req.params;
        const { status, url } = req.body;

        logger.debug(`OnlyOffice callback for ${documentId}:`, { status });

        // Status codes:
        // 0 - Document is being edited
        // 1 - Document is being edited but all users have disconnected
        // 2 - Document is ready for saving
        // 3 - Document saving error has occurred
        // 4 - Document is closed with no changes
        // 6 - Document is being edited, but the current document state is saved
        // 7 - Error has occurred while force saving the document

        if (status === 2 || status === 6) {
            // Save the document
            if (url) {
                await onlyOfficeService.saveDocumentFromUrl(documentId, url);
                logger.info(`Document auto-saved: ${documentId}`);
            }
        }

        // OnlyOffice expects { error: 0 } response
        res.json({ error: 0 });
    } catch (error) {
        logger.error('OnlyOffice callback error:', error);
        res.json({ error: 1 });
    }
});

/**
 * POST /api/editor/test/:documentId
 * Test render the current template with JSON data
 */
router.post('/test/:documentId', authenticate, requireRole('superadmin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;
        const { data } = req.body;

        if (!data) {
            res.status(400).json({ error: 'JSON data is required' });
            return;
        }

        // Check if document exists
        if (!await onlyOfficeService.documentExists(documentId)) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        // Get the editing document
        const buffer = await onlyOfficeService.getDocument(documentId);

        // Load and render template
        const loaded = await templateLoader.loadFromBuffer(buffer, 'template.docx');
        const renderResult = await templateEngine.render(loaded.zip, { data });
        const output = docxOutput.output(renderResult.buffer, 'test_output.docx');

        // Send as download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename="test_output.docx"');
        res.send(output.buffer);

        logger.info(`Test render completed for document: ${documentId}`);
    } catch (error) {
        logger.error('Test render error:', error);
        next(error);
    }
});

/**
 * POST /api/editor/save/:documentId
 * Finalize and save the edited document as a template
 */
router.post('/save/:documentId', authenticate, requireRole('superadmin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;
        const { name, groupIds, tags, sampleData } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({ error: 'Template name is required' });
            return;
        }

        // Check if document exists
        if (!await onlyOfficeService.documentExists(documentId)) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        // Get the edited document
        const buffer = await onlyOfficeService.getDocument(documentId);

        // Save as a template
        const templateName = name.trim().endsWith('.docx') ? name.trim() : `${name.trim()}.docx`;
        const metadata = await templateStore.store(buffer, templateName, 'onlyoffice-editor', req.user!.userId, {
            tags,
            sampleData
        });


        // Assign groups using GroupService
        if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
            await groupService.assignToTemplate(metadata.id, groupIds, req.user!.userId);
            logger.info(`Assigned ${groupIds.length} groups to template ${metadata.id}`);

        }

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'template_uploaded',
            resourceType: 'template',
            resourceId: metadata.id,
            details: {
                filename: templateName,
                size: buffer.length,
                source: 'onlyoffice-editor',
                originalEditId: documentId,
                groupIds,
                tags,
                hasSampleData: !!sampleData
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        // Clean up editing document
        await onlyOfficeService.deleteDocument(documentId);

        logger.info(`Template created from editor: ${metadata.id} (${templateName})`);
        res.json({
            success: true,
            template: metadata
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/editor/:documentId
 * Cancel editing and delete the document
 */
router.delete('/:documentId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;

        await onlyOfficeService.deleteDocument(documentId);

        logger.info(`Editor session cancelled: ${documentId}`);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
