import express, { Express } from 'express';
import path from 'path';
import authRouter from './api/routes/auth.js';
import usersRouter from './api/routes/users.js';
import auditRouter from './api/routes/audit.js';
import renderHistoryRouter from './api/routes/renderHistory.js';
import editorRouter from './api/routes/editor.js';
import templatesRouter from './api/routes/templates.js';
import renderRouter from './api/routes/render.js';
import groupsRouter from './api/routes/groups.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import logger from './utils/Logger.js';
import database from './database/connection.js';

// Get the public directory path
const publicPath = path.join(process.cwd(), 'public');

/**
 * Create and configure Express application
 */
export function createApp(): Express {
    const app = express();

    // Middleware
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.debug(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        });
        next();
    });

    // Serve static files from public directory
    app.use(express.static(publicPath));

    // Health check
    app.get('/health', async (_req, res) => {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'unknown' as string,
        };

        try {
            const dbHealthy = await database.healthCheck();
            health.database = dbHealthy ? 'connected' : 'disconnected';

            if (!dbHealthy) {
                health.status = 'degraded';
            }
        } catch (error) {
            health.database = 'error';
            health.status = 'degraded';
        }

        res.json(health);
    });

    // API routes
    app.use('/api/auth', authRouter);
    app.use('/api/users', usersRouter);
    app.use('/api/audit-logs', auditRouter);
    app.use('/api/render-history', renderHistoryRouter);
    app.use('/api/editor', editorRouter);
    app.use('/api/templates', templatesRouter);
    app.use('/api/render', renderRouter);
    app.use('/api/groups', groupsRouter);

    // Serve index.html for root path
    app.get('/', (_req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });

    // Error handling for API routes
    app.use('/api', notFoundHandler);
    app.use(errorHandler);

    return app;
}

export default createApp;
