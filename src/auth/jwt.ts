/**
 * JWT Token Utilities
 * Generate and verify JWT access and refresh tokens
 */

import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/Logger.js';

export interface TokenPayload {
    userId: string;
    username: string;
    role: 'superadmin' | 'manager' | 'normal' | 'api';
}

export interface DecodedToken extends TokenPayload {
    iat: number;
    exp: number;
}

/**
 * Generate JWT access token (1 hour expiry)
 */
export function generateAccessToken(payload: TokenPayload): string {
    try {
        return jwt.sign(
            payload,
            config.jwt.accessTokenSecret,
            {
                expiresIn: config.jwt.accessTokenExpiry,
            } as any
        );
    } catch (error) {
        logger.error('Error generating access token:', error);
        throw new Error('Failed to generate access token');
    }
}

/**
 * Generate JWT refresh token (7 days expiry)
 */
export function generateRefreshToken(payload: TokenPayload): string {
    try {
        return jwt.sign(
            payload,
            config.jwt.refreshTokenSecret,
            {
                expiresIn: config.jwt.refreshTokenExpiry,
            } as any
        );
    } catch (error) {
        logger.error('Error generating refresh token:', error);
        throw new Error('Failed to generate refresh token');
    }
}

/**
 * Verify and decode JWT access token
 */
export function verifyAccessToken(token: string): DecodedToken {
    try {
        const decoded = jwt.verify(token, config.jwt.accessTokenSecret, {
            algorithms: ['HS256'],
        }) as DecodedToken;

        return decoded;
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            logger.debug('Access token expired');
            throw new Error('Token expired');
        } else if (error instanceof jwt.JsonWebTokenError) {
            logger.warn('Invalid access token:', error.message);
            throw new Error('Invalid token');
        } else {
            logger.error('Error verifying access token:', error);
            throw new Error('Token verification failed');
        }
    }
}

/**
 * Verify and decode JWT refresh token
 */
export function verifyRefreshToken(token: string): DecodedToken {
    try {
        const decoded = jwt.verify(token, config.jwt.refreshTokenSecret, {
            algorithms: ['HS256'],
        }) as DecodedToken;

        return decoded;
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            logger.debug('Refresh token expired');
            throw new Error('Token expired');
        } else if (error instanceof jwt.JsonWebTokenError) {
            logger.warn('Invalid refresh token:', error.message);
            throw new Error('Invalid token');
        } else {
            logger.error('Error verifying refresh token:', error);
            throw new Error('Token verification failed');
        }
    }
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(payload: TokenPayload): {
    accessToken: string;
    refreshToken: string;
} {
    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): DecodedToken | null {
    try {
        return jwt.decode(token) as DecodedToken;
    } catch (error) {
        logger.error('Error decoding token:', error);
        return null;
    }
}
