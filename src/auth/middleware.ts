/**
 * Authentication and Authorization Middleware
 * Protect routes with JWT authentication and role-based access control
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, DecodedToken } from './jwt.js';
import logger from '../utils/Logger.js';

// Extend Express Request to include user info
declare global {
    namespace Express {
        interface Request {
            user?: DecodedToken;
        }
    }
}

/**
 * Authenticate middleware
 * Verify JWT token from Authorization header and attach user to request
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            res.status(401).json({
                error: 'No authorization header provided',
                code: 'NO_TOKEN',
            });
            return;
        }

        // Expected format: "Bearer <token>"
        const parts = authHeader.split(' ');

        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            res.status(401).json({
                error: 'Invalid authorization header format. Expected: Bearer <token>',
                code: 'INVALID_TOKEN_FORMAT',
            });
            return;
        }

        const token = parts[1];

        try {
            // Verify and decode token
            const decoded = verifyAccessToken(token);

            // Attach user to request
            req.user = decoded;

            // Log authentication (for audit trail)
            logger.debug(`User authenticated: ${decoded.username} (${decoded.role})`);

            next();
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === 'Token expired') {
                    res.status(401).json({
                        error: 'Access token expired',
                        code: 'TOKEN_EXPIRED',
                    });
                } else if (error.message === 'Invalid token') {
                    res.status(401).json({
                        error: 'Invalid access token',
                        code: 'INVALID_TOKEN',
                    });
                } else {
                    res.status(401).json({
                        error: 'Token verification failed',
                        code: 'TOKEN_VERIFICATION_FAILED',
                    });
                }
            } else {
                res.status(401).json({
                    error: 'Authentication failed',
                    code: 'AUTH_FAILED',
                });
            }
            return;
        }
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        res.status(500).json({
            error: 'Internal server error during authentication',
            code: 'AUTH_ERROR',
        });
    }
}

/**
 * Require specific roles
 * Usage: requireRole('superadmin', 'manager')
 */
export function requireRole(...allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // User should be attached by authenticate middleware
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
                code: 'NOT_AUTHENTICATED',
            });
            return;
        }

        const userRole = req.user.role;

        if (!allowedRoles.includes(userRole)) {
            logger.warn(
                `Access denied for user ${req.user.username} (${userRole}). Required roles: ${allowedRoles.join(', ')}`
            );

            res.status(403).json({
                error: 'Insufficient permissions',
                code: 'FORBIDDEN',
                required: allowedRoles,
                current: userRole,
            });
            return;
        }

        logger.debug(`Role check passed: ${userRole} in [${allowedRoles.join(', ')}]`);
        next();
    };
}

/**
 * Block web UI access for API users
 * API users should only use API endpoints, not the web interface
 */
export function blockWebUI(req: Request, res: Response, next: NextFunction): void {
    if (req.user && req.user.role === 'api') {
        logger.warn(`API user ${req.user.username} attempted to access web UI: ${req.path}`);

        res.status(403).json({
            error: 'API users cannot access web interface',
            code: 'WEB_UI_FORBIDDEN',
            message: 'Please use the API endpoints for API keys',
        });
        return;
    }

    next();
}

/**
 * Optional authentication
 * Attach user if token is present, but don't require it
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            // No token provided, continue without user
            next();
            return;
        }

        const parts = authHeader.split(' ');

        if (parts.length === 2 && parts[0] === 'Bearer') {
            const token = parts[1];

            try {
                const decoded = verifyAccessToken(token);
                req.user = decoded;
                logger.debug(`Optional auth: User authenticated: ${decoded.username}`);
            } catch (error) {
                // Token present but invalid - just log and continue without user
                logger.debug('Optional auth: Invalid token ignored');
            }
        }

        next();
    } catch (error) {
        logger.error('Optional auth middleware error:', error);
        next(); // Continue even if error
    }
}

/**
 * Check if user is  owner or has admin role
 * Usage: requireOwnerOrAdmin((req) => req.params.userId)
 */
export function requireOwnerOrAdmin(getUserId: (req: Request) => string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                error: 'Authentication required',
                code: 'NOT_AUTHENTICATED',
            });
            return;
        }

        const targetUserId = getUserId(req);
        const currentUserId = req.user.userId;
        const userRole = req.user.role;

        // Allow if user is accessing their own resource or is admin
        if (currentUserId === targetUserId || userRole === 'superadmin') {
            next();
            return;
        }

        logger.warn(
            `Access denied: User ${req.user.username} attempted to access resource of user ${targetUserId}`
        );

        res.status(403).json({
            error: 'Access denied. You can only access your own resources or you must be an admin.',
            code: 'FORBIDDEN',
        });
    };
}
