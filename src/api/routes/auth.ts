/**
 * Authentication Routes
 * Login, refresh token, and logout endpoints
 */

import { Router, Request, Response } from 'express';
import userService from '../../services/UserService.js';
import auditService from '../../services/AuditService.js';
import { generateTokenPair, verifyRefreshToken } from '../../auth/jwt.js';
import { authenticate } from '../../auth/middleware.js';
import logger from '../../utils/Logger.js';

const router = Router();

/**
 * POST /api/auth/login
 * Login with username and password (web users and managers/superadmins)
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            res.status(400).json({
                error: 'Username and password are required',
                code: 'MISSING_CREDENTIALS',
            });
            return;
        }

        // Verify credentials
        const user = await userService.verifyCredentials(username, password);

        if (!user) {
            res.status(401).json({
                error: 'Invalid username or password',
                code: 'INVALID_CREDENTIALS',
            });
            return;
        }

        // Block API users from web login
        if (user.role === 'api') {
            res.status(403).json({
                error: 'API users must use /api/auth/api-login endpoint',
                code: 'API_USER_WEB_LOGIN_FORBIDDEN',
            });
            return;
        }

        // Generate tokens
        const tokens = generateTokenPair({
            userId: user.id,
            username: user.username,
            role: user.role,
        });

        // Store refresh token
        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await userService.storeRefreshToken(
            user.id,
            tokens.refreshToken,
            refreshTokenExpiry,
            req.ip,
            req.get('user-agent')
        );

        // Update last login
        await userService.updateLastLogin(user.id);

        // Log successful login
        await auditService.logAction({
            userId: user.id,
            username: user.username,
            action: 'login',
            details: { role: user.role },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        logger.info(`User logged in: ${user.username} (${user.role}) from ${req.ip}`);

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        logger.error('Login error:', error);

        if (error instanceof Error && error.message === 'User account is disabled') {
            res.status(403).json({
                error: 'User account is disabled',
                code: 'ACCOUNT_DISABLED',
            });
            return;
        }

        res.status(500).json({
            error: 'Login failed',
            code: 'LOGIN_ERROR',
        });
    }
});

/**
 * POST /api/auth/api-login
 * Login for API users only
 */
router.post('/api-login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            res.status(400).json({
                error: 'Username and password are required',
                code: 'MISSING_CREDENTIALS',
            });
            return;
        }

        // Verify credentials
        const user = await userService.verifyCredentials(username, password);

        if (!user) {
            res.status(401).json({
                error: 'Invalid username or password',
                code: 'INVALID_CREDENTIALS',
            });
            return;
        }

        // Only allow API users
        if (user.role !== 'api') {
            res.status(403).json({
                error: 'This endpoint is only for API users. Please use /api/auth/login',
                code: 'NOT_API_USER',
            });
            return;
        }

        // Generate tokens
        const tokens = generateTokenPair({
            userId: user.id,
            username: user.username,
            role: user.role,
        });

        // Store refresh token
        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await userService.storeRefreshToken(
            user.id,
            tokens.refreshToken,
            refreshTokenExpiry,
            req.ip,
            req.get('user-agent')
        );

        // Update last login
        await userService.updateLastLogin(user.id);

        logger.info(`API user logged in: ${user.username} from ${req.ip}`);

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
            },
        });
    } catch (error) {
        logger.error('API login error:', error);

        if (error instanceof Error && error.message === 'User account is disabled') {
            res.status(403).json({
                error: 'User account is disabled',
                code: 'ACCOUNT_DISABLED',
            });
            return;
        }

        res.status(500).json({
            error: 'Login failed',
            code: 'LOGIN_ERROR',
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            res.status(400).json({
                error: 'Refresh token is required',
                code: 'MISSING_REFRESH_TOKEN',
            });
            return;
        }

        // Verify refresh token in database
        const tokenData = await userService.verifyRefreshToken(refreshToken);

        if (!tokenData) {
            res.status(401).json({
                error: 'Invalid or expired refresh token',
                code: 'INVALID_REFRESH_TOKEN',
            });
            return;
        }

        // Verify JWT signature
        try {
            verifyRefreshToken(refreshToken);
        } catch (error) {
            // Token invalid, revoke it
            await userService.revokeRefreshToken(refreshToken);

            res.status(401).json({
                error: 'Invalid refresh token',
                code: 'INVALID_TOKEN',
            });
            return;
        }

        // Get user
        const user = await userService.getUserById(tokenData.userId);

        if (!user || !user.active) {
            res.status(403).json({
                error: 'User account is disabled or not found',
                code: 'ACCOUNT_DISABLED',
            });
            return;
        }

        // Generate new access token
        const tokens = generateTokenPair({
            userId: user.id,
            username: user.username,
            role: user.role,
        });

        // Store new refresh token and revoke old one
        await userService.revokeRefreshToken(refreshToken);

        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await userService.storeRefreshToken(
            user.id,
            tokens.refreshToken,
            refreshTokenExpiry,
            req.ip,
            req.get('user-agent')
        );

        logger.debug(`Token refreshed for user: ${user.username}`);

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        });
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Token refresh failed',
            code: 'REFRESH_ERROR',
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout and revoke refresh token
 */
router.post('/logout', async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            await userService.revokeRefreshToken(refreshToken);

            // Log logout (try to get user from token for audit)
            try {
                const decoded = verifyRefreshToken(refreshToken);
                await auditService.logAction({
                    userId: decoded.userId,
                    username: decoded.username,
                    action: 'logout',
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                });
            } catch (error) {
                // Token already invalid, skip audit log
            }

            logger.debug('User logged out, refresh token revoked');
        }

        res.json({
            message: 'Logged out successfully',
        });
    } catch (error) {
        logger.error('Logout error:', error);
        // Return success even if there's an error
        // Client should clear tokens regardless
        res.json({
            message: 'Logged out successfully',
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            res.status(401).json({
                error: 'Not authenticated',
                code: 'NOT_AUTHENTICATED',
            });
            return;
        }

        const user = await userService.getUserById(req.user.userId);

        if (!user) {
            res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND',
            });
            return;
        }

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            active: user.active,
            created_at: user.created_at,
            last_login: user.last_login,
        });
    } catch (error) {
        logger.error('Get current user error:', error);
        res.status(500).json({
            error: 'Failed to get user info',
            code: 'GET_USER_ERROR',
        });
    }
});

export default router;
