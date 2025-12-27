/**
 * Database Connection Pool
 * PostgreSQL connection management with health checks
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import logger from '../utils/Logger.js';
import config from '../config/index.js';

class Database {
    private pool: Pool;
    private isConnected: boolean = false;

    constructor() {
        this.pool = new Pool({
            host: config.database.host,
            port: config.database.port,
            database: config.database.database,
            user: config.database.user,
            password: config.database.password,
            max: config.database.max,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        // Handle pool errors
        this.pool.on('error', (err) => {
            logger.error('Unexpected database pool error:', err);
        });

        // Handle successful connections
        this.pool.on('connect', () => {
            if (!this.isConnected) {
                logger.info('✅ Database connected successfully');
                this.isConnected = true;
            }
        });
    }

    /**
     * Initialize database connection and verify it works
     */
    async initialize(): Promise<void> {
        try {
            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            this.isConnected = true;
            logger.info('🗄️  Database initialization successful');
            logger.info(`📊 Connected to: ${config.database.database}@${config.database.host}:${config.database.port}`);
        } catch (error) {
            logger.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Execute a query
     */
    async query(text: string, params?: any[]): Promise<QueryResult> {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;

            if (duration > 1000) {
                logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
            }

            return result;
        } catch (error) {
            logger.error('Database query error:', error);
            logger.error('Query:', text);
            logger.error('Params:', params);
            throw error;
        }
    }

    /**
     * Get a client from the pool for transactions
     */
    async getClient(): Promise<PoolClient> {
        return await this.pool.connect();
    }

    /**
     * Execute a transaction
     */
    async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.getClient();

        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            const result = await this.query('SELECT 1 as health');
            return result.rows[0]?.health === 1;
        } catch (error) {
            logger.error('Database health check failed:', error);
            return false;
        }
    }

    /**
     * Get connection pool stats
     */
    getStats() {
        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount,
        };
    }

    /**
     * Close all connections
     */
    async close(): Promise<void> {
        try {
            await this.pool.end();
            this.isConnected = false;
            logger.info('Database connections closed');
        } catch (error) {
            logger.error('Error closing database connections:', error);
            throw error;
        }
    }
}

// Export singleton instance
const database = new Database();
export default database;
