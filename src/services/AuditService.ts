/**
 * Audit Logging Service
 * Track all user actions for security and compliance
 */

import database from '../database/connection.js';
import logger from '../utils/Logger.js';

export type AuditAction =
    // Authentication
    | 'login'
    | 'logout'
    | 'token_refresh'
    | 'failed_login'
    // Users
    | 'user_created'
    | 'user_updated'
    | 'user_deleted'
    | 'user_listed'
    | 'user_viewed'
    | 'password_changed'
    // Templates
    | 'template_uploaded'
    | 'template_deleted'
    | 'template_updated'
    | 'template_listed'
    | 'template_viewed'
    | 'template_downloaded'
    // Renders
    | 'render_success'
    | 'render_failure'
    // Groups
    | 'group_created'
    | 'group_updated'
    | 'group_deleted'
    | 'group_listed'
    | 'group_viewed'
    | 'group_toggled'
    ;

export interface AuditLogEntry {
    userId?: string;
    username?: string;
    action: AuditAction;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}

class AuditService {
    /**
     * Log an action
     */
    async logAction(entry: AuditLogEntry): Promise<void> {
        try {
            const query = `
                INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, details, ip_address, user_agent)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;

            await database.query(query, [
                entry.userId || null,
                entry.username || null,
                entry.action,
                entry.resourceType || null,
                entry.resourceId || null,
                entry.details ? JSON.stringify(entry.details) : null,
                entry.ipAddress || null,
                entry.userAgent || null,
            ]);

            logger.debug(`Audit log: ${entry.action} by ${entry.username || 'anonymous'}`);
        } catch (error) {
            // Don't throw - audit failures shouldn't break the app
            logger.error('Failed to create audit log:', error);
        }
    }

    /**
     * Get audit logs with filters
     */
    async getAuditLogs(options: {
        userId?: string;
        action?: AuditAction;
        resourceType?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    } = {}): Promise<{ logs: any[]; total: number }> {
        const { limit = 100, offset = 0 } = options;

        const conditions: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (options.userId) {
            conditions.push(`user_id = $${paramCount++}`);
            values.push(options.userId);
        }

        if (options.action) {
            conditions.push(`action = $${paramCount++}`);
            values.push(options.action);
        }

        if (options.resourceType) {
            conditions.push(`resource_type = $${paramCount++}`);
            values.push(options.resourceType);
        }

        if (options.startDate) {
            conditions.push(`created_at >= $${paramCount++}`);
            values.push(options.startDate);
        }

        if (options.endDate) {
            conditions.push(`created_at <= $${paramCount++}`);
            values.push(options.endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`;
        const countResult = await database.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Get logs
        values.push(limit, offset);
        const query = `
            SELECT id, user_id, username, action, resource_type, resource_id, details, ip_address, user_agent, created_at
            FROM audit_logs
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount++}
        `;

        const result = await database.query(query, values);

        return {
            logs: result.rows,
            total,
        };
    }

    /**
     * Get user activity history
     */
    async getUserActivity(userId: string, limit: number = 50): Promise<any[]> {
        const query = `
            SELECT action, resource_type, resource_id, details, ip_address, created_at
            FROM audit_logs
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `;

        const result = await database.query(query, [userId, limit]);
        return result.rows;
    }

    /**
     * Get action statistics
     */
    async getActionStatistics(startDate?: Date, endDate?: Date): Promise<any[]> {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (startDate) {
            conditions.push(`created_at >= $${paramCount++}`);
            values.push(startDate);
        }

        if (endDate) {
            conditions.push(`created_at <= $${paramCount++}`);
            values.push(endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT action, COUNT(*) as count
            FROM audit_logs
            ${whereClause}
            GROUP BY action
            ORDER BY count DESC
        `;

        const result = await database.query(query, values);
        return result.rows;
    }
}

// Export singleton instance
const auditService = new AuditService();
export default auditService;
