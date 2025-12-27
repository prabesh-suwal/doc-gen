/**
 * User Management Routes
 * CRUD operations for users (superadmin and manager access)
 */

import { Router, Request, Response } from 'express';
import userService from '../../services/UserService.js';
import auditService from '../../services/AuditService.js';
import { authenticate, requireRole, requireOwnerOrAdmin } from '../../auth/middleware.js';
import { validatePasswordStrength } from '../../auth/password.js';
import logger from '../../utils/Logger.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/users
 * Create a new user (superadmin only)
 */
router.post('/', requireRole('superadmin'), async (req: Request, res: Response) => {
    try {
        const { username, email, password, role } = req.body;

        // Validate input
        if (!username || !email || !password || !role) {
            res.status(400).json({
                error: 'Missing required fields: username, email, password, role',
                code: 'MISSING_FIELDS',
            });
            return;
        }

        // Validate role
        const validRoles = ['superadmin', 'manager', 'normal', 'api'];
        if (!validRoles.includes(role)) {
            res.status(400).json({
                error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
                code: 'INVALID_ROLE',
            });
            return;
        }

        // Validate password strength
        const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
            res.status(400).json({
                error: 'Password does not meet requirements',
                code: 'WEAK_PASSWORD',
                details: passwordValidation.errors,
            });
            return;
        }

        // Create user
        const user = await userService.createUser({
            username,
            email,
            password,
            role,
            createdBy: req.user!.userId,
        });

        logger.info(`User created by ${req.user!.username}: ${username} (${role})`);

        res.status(201).json({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            active: user.active,
            created_at: user.created_at,
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === 'Username already exists') {
                res.status(409).json({
                    error: 'Username already exists',
                    code: 'USERNAME_EXISTS',
                });
                return;
            } else if (error.message === 'Email already exists') {
                res.status(409).json({
                    error: 'Email already exists',
                    code: 'EMAIL_EXISTS',
                });
                return;
            }
        }

        logger.error('Create user error:', error);
        res.status(500).json({
            error: 'Failed to create user',
            code: 'CREATE_USER_ERROR',
        });
    }
});

/**
 * GET /api/users
 * List users (superadmin and manager)
 */
router.get('/', requireRole('superadmin', 'manager'), async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const role = req.query.role as string | undefined;
        const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;

        const result = await userService.listUsers({
            limit,
            offset,
            role: role as any,
            active,
        });

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'user_listed',
            resourceType: 'user',
            details: { count: result.total, filters: { role, active } },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({
            users: result.users,
            total: result.total,
            limit,
            offset,
        });
    } catch (error) {
        logger.error('List users error:', error);
        res.status(500).json({
            error: 'Failed to list users',
            code: 'LIST_USERS_ERROR',
        });
    }
});

/**
 * GET /api/users/:id
 * Get user by ID (superadmin, manager, or self)
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const currentUser = req.user!;

        // Check if user can access this resource
        const canAccess =
            currentUser.role === 'superadmin' ||
            currentUser.role === 'manager' ||
            currentUser.userId === id;

        if (!canAccess) {
            res.status(403).json({
                error: 'Access denied',
                code: 'FORBIDDEN',
            });
            return;
        }

        const user = await userService.getUserById(id);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND',
            });
            return;
        }

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'user_viewed',
            resourceType: 'user',
            resourceId: id,
            details: { viewed_user: user.username },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            active: user.active,
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_login: user.last_login,
        });
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to get user',
            code: 'GET_USER_ERROR',
        });
    }
});

/**
 * PUT /api/users/:id
 * Update user (superadmin only)
 */
router.put('/:id', requireRole('superadmin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { email, role, active } = req.body;

        if (!email && !role && active === undefined) {
            res.status(400).json({
                error: 'At least one field must be provided: email, role, or active',
                code: 'NO_UPDATE_FIELDS',
            });
            return;
        }

        // Validate role if provided
        if (role) {
            const validRoles = ['superadmin', 'manager', 'normal', 'api'];
            if (!validRoles.includes(role)) {
                res.status(400).json({
                    error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
                    code: 'INVALID_ROLE',
                });
                return;
            }
        }

        const user = await userService.updateUser(id, { email, role, active });

        // Audit log
        await auditService.logAction({
            userId: req.user!.userId,
            username: req.user!.username,
            action: 'user_updated',
            resourceType: 'user',
            resourceId: id,
            details: { updated_fields: { email, role, active }, updated_user: user.username },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        logger.info(`User updated by ${req.user!.username}: ${user.username}`);

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            active: user.active,
            updated_at: user.updated_at,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'User not found') {
            res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND',
            });
            return;
        }

        logger.error('Update user error:', error);
        res.status(500).json({
            error: 'Failed to update user',
            code: 'UPDATE_USER_ERROR',
        });
    }
});

/**
 * DELETE /api/users/:id
 * Delete user (superadmin only)
 */
router.delete('/:id', requireRole('superadmin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.user!.userId) {
            res.status(400).json({
                error: 'Cannot delete your own account',
                code: 'SELF_DELETE_FORBIDDEN',
            });
            return;
        }

        await userService.deleteUser(id);

        logger.info(`User deleted by ${req.user!.username}: ID ${id}`);

        res.json({
            message: 'User deleted successfully',
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'User not found') {
            res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND',
            });
            return;
        }

        logger.error('Delete user error:', error);
        res.status(500).json({
            error: 'Failed to delete user',
            code: 'DELETE_USER_ERROR',
        });
    }
});

/**
 * PUT /api/users/:id/password
 * Change user password (self or superadmin)
 */
router.put(
    '/:id/password',
    requireOwnerOrAdmin((req) => req.params.id),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { currentPassword, newPassword } = req.body;

            if (!newPassword) {
                res.status(400).json({
                    error: 'New password is required',
                    code: 'MISSING_NEW_PASSWORD',
                });
                return;
            }

            // If changing own password, verify current password
            if (id === req.user!.userId) {
                if (!currentPassword) {
                    res.status(400).json({
                        error: 'Current password is required when changing your own password',
                        code: 'MISSING_CURRENT_PASSWORD',
                    });
                    return;
                }

                // Verify current password
                const user = await userService.getUserById(id);
                if (user) {
                    const valid = await userService.verifyCredentials(user.username, currentPassword);
                    if (!valid) {
                        res.status(401).json({
                            error: 'Current password is incorrect',
                            code: 'INVALID_CURRENT_PASSWORD',
                        });
                        return;
                    }
                }
            }

            // Validate new password strength
            const passwordValidation = validatePasswordStrength(newPassword);
            if (!passwordValidation.isValid) {
                res.status(400).json({
                    error: 'New password does not meet requirements',
                    code: 'WEAK_PASSWORD',
                    details: passwordValidation.errors,
                });
                return;
            }

            await userService.changePassword(id, newPassword);

            // Audit log
            await auditService.logAction({
                userId: req.user!.userId,
                username: req.user!.username,
                action: 'password_changed',
                resourceType: 'user',
                resourceId: id,
                details: { target_user: id, changed_own: id === req.user!.userId },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
            });

            logger.info(`Password changed for user ID: ${id} by ${req.user!.username}`);

            res.json({
                message: 'Password changed successfully',
            });
        } catch (error) {
            logger.error('Change password error:', error);
            res.status(500).json({
                error: 'Failed to change password',
                code: 'CHANGE_PASSWORD_ERROR',
            });
        }
    }
);

export default router;
