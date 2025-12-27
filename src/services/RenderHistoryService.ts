/**
 * Render History Service
 * Track all document rendering requests
 */

import database from '../database/connection.js';
import logger from '../utils/Logger.js';
import crypto from 'crypto';

export type RenderStatus = 'success' | 'failure' | 'pending';
export type OutputFormat = 'docx' | 'pdf' | 'html';

export interface CreateRenderRecordData {
    userId: string;
    templateId?: string;
    templateName?: string;
    data: any;
    outputFormat: OutputFormat;
    operations?: Record<string, any>;
}

export interface UpdateRenderStatusData {
    id: string;
    status: RenderStatus;
    fileSize?: number;
    durationMs?: number;
    errorMessage?: string;
    errorStack?: string;
}

class RenderHistoryService {
    /**
     * Create MD5 hash of data for deduplication
     */
    private hashData(data: any): string {
        const dataString = JSON.stringify(data);
        return crypto.createHash('md5').update(dataString).digest('hex');
    }

    /**
     * Create a render history record
     */
    async createRenderRecord(data: CreateRenderRecordData): Promise<string> {
        try {
            const dataHash = this.hashData(data.data);

            const query = `
                INSERT INTO render_history (user_id, template_id, template_name, data_hash, output_format, status, operations)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `;

            const result = await database.query(query, [
                data.userId,
                data.templateId || null,
                data.templateName || 'unnamed',
                dataHash,
                data.outputFormat,
                'pending',
                data.operations ? JSON.stringify(data.operations) : null,
            ]);

            const recordId = result.rows[0].id;
            logger.debug(`Render history record created: ${recordId}`);
            return recordId;
        } catch (error) {
            logger.error('Failed to create render history record:', error);
            throw error;
        }
    }

    /**
     * Update render status after completion
     */
    async updateRenderStatus(
        id: string,
        data: {
            status: RenderStatus;
            fileSize?: number;
            durationMs?: number;
            errorMessage?: string;
            errorStack?: string;
        }
    ): Promise<void> {
        try {
            const query = `
                UPDATE render_history
                SET status = $1,
                    file_size = $2,
                    duration_ms = $3,
                    error_message = $4,
                    error_stack = $5
                WHERE id = $6
            `;

            await database.query(query, [
                data.status,
                data.fileSize || null,
                data.durationMs || null,
                data.errorMessage || null,
                data.errorStack || null,
                id,
            ]);

            logger.debug(`Render history updated: ${id} - ${data.status}`);
        } catch (error) {
            logger.error('Failed to update render history:', error);
            // Don't throw - this shouldn't break the render process
        }
    }

    /**
     * Get user's render history
     */
    async getUserRenderHistory(
        userId: string,
        options: { limit?: number; offset?: number } = {}
    ): Promise<{ renders: any[]; total: number }> {
        const { limit = 50, offset = 0 } = options;

        // Get total count
        const countQuery = `SELECT COUNT(*) as count FROM render_history WHERE user_id = $1`;
        const countResult = await database.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].count);

        // Get renders
        const query = `
            SELECT id, template_id, template_name, output_format, status, file_size, duration_ms, error_message, created_at
            FROM render_history
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await database.query(query, [userId, limit, offset]);

        return {
            renders: result.rows,
            total,
        };
    }

    /**
     * Get render details by ID
     */
    async getRenderById(id: string): Promise<any | null> {
        const query = `
            SELECT id, user_id, template_id, template_name, data_hash, output_format, status, 
                   file_size, duration_ms, error_message, operations, created_at
            FROM render_history
            WHERE id = $1
        `;

        const result = await database.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Get render statistics for a user
     */
    async getUserRenderStatistics(userId: string): Promise<any> {
        const query = `
            SELECT 
                COUNT(*) as total_renders,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_renders,
                COUNT(CASE WHEN status = 'failure' THEN 1 END) as failed_renders,
                AVG(CASE WHEN status = 'success' THEN duration_ms END) as avg_duration_ms,
                SUM(CASE WHEN status = 'success' THEN file_size END) as total_file_size
            FROM render_history
            WHERE user_id = $1
        `;

        const result = await database.query(query, [userId]);
        return result.rows[0];
    }

    /**
     * Get all render history (admin only)
     */
    async getAllRenderHistory(options: {
        status?: RenderStatus;
        limit?: number;
        offset?: number;
    } = {}): Promise<{ renders: any[]; total: number }> {
        const { limit = 100, offset = 0, status } = options;

        const conditions: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (status) {
            conditions.push(`status = $${paramCount++}`);
            values.push(status);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) as count FROM render_history ${whereClause}`;
        const countResult = await database.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Get renders
        values.push(limit, offset);
        const query = `
            SELECT id, user_id, template_name, output_format, status, file_size, duration_ms, created_at
            FROM render_history
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount++}
        `;

        const result = await database.query(query, values);

        return {
            renders: result.rows,
            total,
        };
    }
}

// Export singleton instance
const renderHistoryService = new RenderHistoryService();
export default renderHistoryService;
