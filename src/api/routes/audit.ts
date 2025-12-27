/**
 * Audit Log Routes
 * View audit logs (superadmin only)
 */

import { Router, Request, Response } from 'express';
import auditService from '../../services/AuditService.js';
import { authenticate, requireRole } from '../../auth/middleware.js';
import logger from '../../utils/Logger.js';

const router = Router();

// All routes require superadmin
router.use(authenticate);
router.use(requireRole('superadmin'));

/**
 * GET /api/audit-logs
 * Get audit logs with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;
        const action = req.query.action as any;
        const userId = req.query.userId as string;

        const result = await auditService.getAuditLogs({
            limit,
            offset,
            action,
            userId,
        });

        res.json({
            logs: result.logs,
            total: result.total,
            limit,
            offset,
        });
    } catch (error) {
        logger.error('Get audit logs error:', error);
        res.status(500).json({
            error: 'Failed to get audit logs',
            code: 'GET_AUDIT_LOGS_ERROR',
        });
    }
});

/**
 * GET /api/audit-logs/stats
 * Get audit log statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
    try {
        const stats = await auditService.getActionStatistics();

        res.json({
            statistics: stats,
        });
    } catch (error) {
        logger.error('Get audit stats error:', error);
        res.status(500).json({
            error: 'Failed to get audit statistics',
            code: 'GET_AUDIT_STATS_ERROR',
        });
    }
});

export default router;
