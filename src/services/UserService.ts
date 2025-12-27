/**
 * User Service
 * Database operations for user management
 */

import database from '../database/connection.js';
import { hashPassword, comparePassword } from '../auth/password.js';
import logger from '../utils/Logger.js';

export type UserRole = 'superadmin' | 'manager' | 'normal' | 'api';

export interface User {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    active: boolean;
    created_at: Date;
    updated_at: Date;
    created_by: string | null;
    last_login: Date | null;
}

export interface CreateUserData {
    username: string;
    email: string;
    password: string;
    role: UserRole;
    createdBy?: string;
}

export interface UpdateUserData {
    email?: string;
    role?: UserRole;
    active?: boolean;
}

class UserService {
    /**
     * Create a new user
     */
    async createUser(data: CreateUserData): Promise<User> {
        try {
            // Hash password
            const passwordHash = await hashPassword(data.password);

            const query = `
                INSERT INTO users (username, email, password_hash, role, created_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, username, email, role, active, created_at, updated_at, created_by, last_login
            `;

            const result = await database.query(query, [
                data.username,
                data.email,
                passwordHash,
                data.role,
                data.createdBy || null,
            ]);

            logger.info(`User created: ${data.username} (${data.role})`);
            return result.rows[0];
        } catch (error: any) {
            if (error.code === '23505') {
                // Unique violation
                if (error.constraint === 'users_username_key') {
                    throw new Error('Username already exists');
                } else if (error.constraint === 'users_email_key') {
                    throw new Error('Email already exists');
                }
            }
            logger.error('Error creating user:', error);
            throw error;
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(id: string): Promise<User | null> {
        const query = `
            SELECT id, username, email, role, active, created_at, updated_at, created_by, last_login
            FROM users
            WHERE id = $1
        `;

        const result = await database.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Get user by username
     */
    async getUserByUsername(username: string): Promise<User | null> {
        const query = `
            SELECT id, username, email, role, active, created_at, updated_at, created_by, last_login
            FROM users
            WHERE username = $1
        `;

        const result = await database.query(query, [username]);
        return result.rows[0] || null;
    }

    /**
     * Get user by username with password hash (for authentication)
     */
    async getUserByUsernameWithPassword(username: string): Promise<(User & { password_hash: string }) | null> {
        const query = `
            SELECT id, username, email, password_hash, role, active, created_at, updated_at, created_by, last_login
            FROM users
            WHERE username = $1
        `;

        const result = await database.query(query, [username]);
        return result.rows[0] || null;
    }

    /**
     * Verify user credentials
     */
    async verifyCredentials(username: string, password: string): Promise<User | null> {
        const user = await this.getUserByUsernameWithPassword(username);

        if (!user) {
            return null;
        }

        if (!user.active) {
            throw new Error('User account is disabled');
        }

        const isValid = await comparePassword(password, user.password_hash);

        if (!isValid) {
            return null;
        }

        // Return user without password hash
        const { password_hash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Update user last login timestamp
     */
    async updateLastLogin(userId: string): Promise<void> {
        const query = `
            UPDATE users
            SET last_login = CURRENT_TIMESTAMP
            WHERE id = $1
        `;

        await database.query(query, [userId]);
    }

    /**
     * Update user
     */
    async updateUser(id: string, data: UpdateUserData): Promise<User> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.email !== undefined) {
            updates.push(`email = $${paramCount++}`);
            values.push(data.email);
        }

        if (data.role !== undefined) {
            updates.push(`role = $${paramCount++}`);
            values.push(data.role);
        }

        if (data.active !== undefined) {
            updates.push(`active = $${paramCount++}`);
            values.push(data.active);
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(id);

        const query = `
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, username, email, role, active, created_at, updated_at, created_by, last_login
        `;

        const result = await database.query(query, values);

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        logger.info(`User updated: ${result.rows[0].username}`);
        return result.rows[0];
    }

    /**
     * Change user password
     */
    async changePassword(userId: string, newPassword: string): Promise<void> {
        const passwordHash = await hashPassword(newPassword);

        const query = `
            UPDATE users
            SET password_hash = $1
            WHERE id = $2
        `;

        await database.query(query, [passwordHash, userId]);
        logger.info(`Password changed for user ID: ${userId}`);
    }

    /**
     * Delete user (soft delete by setting active = false)
     */
    async deleteUser(id: string): Promise<void> {
        const query = `
            UPDATE users
            SET active = false
            WHERE id = $1
        `;

        const result = await database.query(query, [id]);

        if (result.rowCount === 0) {
            throw new Error('User not found');
        }

        logger.info(`User deleted (deactivated): ID ${id}`);
    }

    /**
     * List users with pagination
     */
    async listUsers(options: {
        limit?: number;
        offset?: number;
        role?: UserRole;
        active?: boolean;
    } = {}): Promise<{ users: User[]; total: number }> {
        const { limit = 50, offset = 0, role, active } = options;

        const conditions: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (role !== undefined) {
            conditions.push(`role = $${paramCount++}`);
            values.push(role);
        }

        if (active !== undefined) {
            conditions.push(`active = $${paramCount++}`);
            values.push(active);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as count FROM users ${whereClause}`;
        const countResult = await database.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Get users
        values.push(limit, offset);
        const query = `
            SELECT id, username, email, role, active, created_at, updated_at, created_by, last_login
            FROM users
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount++}
        `;

        const result = await database.query(query, values);

        return {
            users: result.rows,
            total,
        };
    }

    /**
     * Store refresh token
     */
    async storeRefreshToken(
        userId: string,
        token: string,
        expiresAt: Date,
        ipAddress?: string,
        userAgent?: string
    ): Promise<void> {
        const query = `
            INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5)
        `;

        await database.query(query, [userId, token, expiresAt, ipAddress || null, userAgent || null]);
    }

    /**
     * Verify refresh token
     */
    async verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
        const query = `
            SELECT user_id
            FROM refresh_tokens
            WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP
        `;

        const result = await database.query(query, [token]);

        if (result.rows.length === 0) {
            return null;
        }

        return { userId: result.rows[0].user_id };
    }

    /**
     * Revoke refresh token (logout)
     */
    async revokeRefreshToken(token: string): Promise<void> {
        const query = `
            DELETE FROM refresh_tokens
            WHERE token = $1
        `;

        await database.query(query, [token]);
    }

    /**
     * Revoke all refresh tokens for a user
     */
    async revokeAllUserTokens(userId: string): Promise<void> {
        const query = `
            DELETE FROM refresh_tokens
            WHERE user_id = $1
        `;

        await database.query(query, [userId]);
        logger.info(`All tokens revoked for user ID: ${userId}`);
    }

    /**
     * Clean up expired refresh tokens
     */
    async cleanupExpiredTokens(): Promise<number> {
        const query = `
            DELETE FROM refresh_tokens
            WHERE expires_at < CURRENT_TIMESTAMP
        `;

        const result = await database.query(query);
        const deleted = result.rowCount || 0;

        if (deleted > 0) {
            logger.info(`Cleaned up ${deleted} expired refresh tokens`);
        }

        return deleted;
    }
}

// Export singleton instance
const userService = new UserService();
export default userService;
