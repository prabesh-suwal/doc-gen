import express, { Express } from 'express';
import path from 'path';
import templatesRouter from './api/routes/templates.js';
import renderRouter from './api/routes/render.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import logger from './utils/Logger.js';

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
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API routes
    app.use('/api/templates', templatesRouter);
    app.use('/api/render', renderRouter);

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
