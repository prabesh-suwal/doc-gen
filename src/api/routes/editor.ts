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
 * POST /api/editor/edit/:templateId
 * Load existing template into editor for editing
 */
router.post('/edit/:templateId', authenticate, requireRole('superadmin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { templateId } = req.params;

        // Get template metadata
        const template = await templateStore.getMetadata(templateId);

        if (!template) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }

        // Load template file
        const { buffer } = await templateStore.get(templateId);

        // Create OnlyOffice editing session with template content
        const { documentId, filePath } = await onlyOfficeService.createBlankDocument();

        // Write template content to the document file
        const fs = await import('fs');
        fs.writeFileSync(filePath, buffer);

        // Extract sample data if exists (from metadata details)
        const sampleData = (template as any).sampleData || null;
        const tags = template.tags || [];

        // Get groups assigned to this template
        let groups: { id: string; name: string }[] = [];
        try {
            groups = await groupService.getTemplateGroups(templateId);
        } catch (err) {
            logger.warn(`Could not fetch groups for template ${templateId}:`, err);
        }

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'editor_accessed',
            resourceType: 'template',
            resourceId: templateId,
            details: {
                templateName: template.originalName,
                hasSampleData: !!sampleData,
                documentId
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        logger.info(`Template loaded into editor: ${templateId} -> ${documentId} by ${req.user!.username}`);

        res.json({
            success: true,
            documentId,
            originalTemplateId: templateId, // Pass original template ID for update
            editorUrl: `/editor?id=${documentId}`,
            templateName: template.originalName,
            sampleData,
            tags,
            groups
        });
    } catch (error) {
        logger.error('Edit template error:', error);
        next(error);
    }
});

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

        // Force save to get the latest content from OnlyOffice
        await onlyOfficeService.forceSave(documentId);

        // Get the editing document (now with latest content)
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
 * If originalTemplateId is provided, updates existing template; otherwise creates new
 */
router.post('/save/:documentId', authenticate, requireRole('superadmin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentId } = req.params;
        const { name, groupIds, tags, sampleData, originalTemplateId } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({ error: 'Template name is required' });
            return;
        }

        // Check if document exists
        if (!await onlyOfficeService.documentExists(documentId)) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        // Force save to get the latest content from OnlyOffice
        // This triggers a callback from OnlyOffice with the current document state
        await onlyOfficeService.forceSave(documentId);

        // Get the edited document (now with latest content from OnlyOffice)
        const buffer = await onlyOfficeService.getDocument(documentId);

        const templateName = name.trim().endsWith('.docx') ? name.trim() : `${name.trim()}.docx`;
        let metadata;
        let isUpdate = false;

        // Check if we're updating an existing template
        if (originalTemplateId) {
            // Update existing template
            metadata = await templateStore.update(originalTemplateId, buffer, req.user!.userId, {
                name: templateName,
                tags,
                sampleData
            });

            if (!metadata) {
                res.status(404).json({ error: 'Original template not found for update' });
                return;
            }

            isUpdate = true;
            logger.info(`Template updated from editor: ${metadata.id} (${templateName})`);
        } else {
            // Create new template
            metadata = await templateStore.store(buffer, templateName, 'onlyoffice-editor', req.user!.userId, {
                tags,
                sampleData
            });
            logger.info(`Template created from editor: ${metadata.id} (${templateName})`);
        }

        // Handle group assignments
        if (groupIds && Array.isArray(groupIds) && groupIds.length > 0) {
            // For updates, we might want to replace groups; for now, just assign
            await groupService.assignToTemplate(metadata.id, groupIds, req.user!.userId);
            logger.info(`Assigned ${groupIds.length} groups to template ${metadata.id}`);
        }

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: isUpdate ? 'template_updated' : 'template_uploaded',
            resourceType: 'template',
            resourceId: metadata.id,
            details: {
                filename: templateName,
                size: buffer.length,
                source: 'onlyoffice-editor',
                originalEditId: documentId,
                originalTemplateId: originalTemplateId || null,
                isUpdate,
                groupIds,
                tags,
                hasSampleData: !!sampleData
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        // Clean up editing document
        await onlyOfficeService.deleteDocument(documentId);

        res.json({
            success: true,
            template: metadata,
            isUpdate
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
