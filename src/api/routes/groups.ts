import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../auth/middleware.js';
import groupService from '../../services/GroupService.js';
import auditService from '../../services/AuditService.js';


const router = Router();

/**
 * POST /api/groups - Create a new group (superadmin only)
 */
router.post('/', authenticate, requireRole('superadmin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, description } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({ error: 'Group name is required' });
            return;
        }

        const group = await groupService.create(name.trim(), description, req.user!.userId);

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'group_created',
            resourceType: 'group',
            resourceId: group.id,
            details: { name: group.name },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.status(201).json({ success: true, group });
    } catch (error: any) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Group name already exists' });
            return;
        }
        next(error);
    }
});

/**
 * GET /api/groups - List all groups
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const includeInactive = req.query.includeInactive !== 'false';

        // Log access
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'group_listed',
            resourceType: 'group',
            resourceId: undefined, // Fix: 'all_groups' is not a valid UUID
            details: { includeInactive },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        const groups = await groupService.list(includeInactive);

        // Add template count to each group
        const groupsWithCounts = await Promise.all(
            groups.map(async (group) => ({
                ...group,
                templateCount: await groupService.getTemplateCount(group.id),
            }))
        );

        res.json(groupsWithCounts);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/groups/active - List active groups only
 */
router.get('/active', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const groups = await groupService.list(false);
        res.json(groups);
    } catch (error) {
        next(error);
    }
});

// Get single group
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const group = await groupService.get(id);
        const templateCount = await groupService.getTemplateCount(id);

        res.json({ ...group, templateCount });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/groups/:id - Update group (superadmin only)
 */
router.put('/:id', authenticate, requireRole('superadmin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const updates: any = {};
        if (name !== undefined) updates.name = name.trim();
        if (description !== undefined) updates.description = description;

        const group = await groupService.update(id, updates);

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'group_updated',
            resourceType: 'group',
            resourceId: id,
            details: updates,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({ success: true, group });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/groups/:id/toggle - Toggle group active status (superadmin only)
 */
router.patch('/:id/toggle', authenticate, requireRole('superadmin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const group = await groupService.toggleActive(id);

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'group_toggled',
            resourceType: 'group',
            resourceId: id,
            details: { isActive: group.isActive },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({ success: true, group });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/groups/:id - Delete group (superadmin only)
 */
router.delete('/:id', authenticate, requireRole('superadmin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        await groupService.delete(id);

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'group_deleted',
            resourceType: 'group',
            resourceId: id,
            details: {},
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
