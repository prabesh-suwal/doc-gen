/**
 * Render History Routes
 * View render history (all users can see their own, admins can see all)
 */

import { Router, Request, Response } from 'express';
import renderHistoryService from '../../services/RenderHistoryService.js';
import { authenticate, requireRole } from '../../auth/middleware.js';
import auditService from '../../services/AuditService.js';
import logger from '../../utils/Logger.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/render-history
 * Get current user's render history
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await renderHistoryService.getUserRenderHistory(req.user!.userId, {
            limit,
            offset,
        });

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'render_history_viewed',
            resourceType: 'render',
            details: {
                count: result.total,
                limit,
                offset
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({
            renders: result.renders,
            total: result.total,
            limit,
            offset,
        });
    } catch (error) {
        logger.error('Get render history error:', error);
        res.status(500).json({
            error: 'Failed to get render history',
            code: 'GET_RENDER_HISTORY_ERROR',
        });
    }
});

/**
 * GET /api/render-history/all
 * Get all render history (superadmin and manager only)
 */
router.get('/all', requireRole('superadmin', 'manager'), async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;
        const status = req.query.status as any;

        const result = await renderHistoryService.getAllRenderHistory({
            limit,
            offset,
            status,
        });

        res.json({
            renders: result.renders,
            total: result.total,
            limit,
            offset,
        });
    } catch (error) {
        logger.error('Get all render history error:', error);
        res.status(500).json({
            error: 'Failed to get render history',
            code: 'GET_ALL_RENDER_HISTORY_ERROR',
        });
    }
});

/**
 * GET /api/render-history/:id
 * Get specific render details
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const render = await renderHistoryService.getRenderById(id);

        if (!render) {
            res.status(404).json({
                error: 'Render not found',
                code: 'RENDER_NOT_FOUND',
            });
            return;
        }

        // Check if user owns this render or is admin
        if (render.user_id !== req.user!.userId && req.user!.role !== 'superadmin' && req.user!.role !== 'manager') {
            res.status(403).json({
                error: 'Access denied',
                code: 'FORBIDDEN',
            });
            return;
        }

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'render_detail_viewed',
            resourceType: 'render',
            resourceId: id,
            details: {
                templateId: render.template_id,
                status: render.status
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({ render });
    } catch (error) {
        logger.error('Get render details error:', error);
        res.status(500).json({
            error: 'Failed to get render details',
            code: 'GET_RENDER_DETAILS_ERROR',
        });
    }
});

/**
 * GET /api/render-history/stats/me
 * Get current user's render statistics
 */
router.get('/stats/me', async (req: Request, res: Response) => {
    try {
        const stats = await renderHistoryService.getUserRenderStatistics(req.user!.userId);
        res.json({ statistics: stats });
    } catch (error) {
        logger.error('Get render stats error:', error);
        res.status(500).json({
            error: 'Failed to get render statistics',
            code: 'GET_RENDER_STATS_ERROR',
        });
    }
});

export default router;
