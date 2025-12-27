import { createApp } from './app.js';
import config from './config/index.js';
import logger from './utils/Logger.js';
import database from './database/connection.js';
import fs from 'fs/promises';

async function main(): Promise<void> {
    // Ensure required directories exist
    await fs.mkdir(config.storagePath, { recursive: true });
    await fs.mkdir(config.outputPath, { recursive: true });
    await fs.mkdir(config.tempPath, { recursive: true });

    // Initialize database connection
    try {
        await database.initialize();
    } catch (error) {
        logger.error('Failed to initialize database. App will continue without DB features.');
        logger.error('To enable database features, ensure PostgreSQL is running and configured correctly.');
        logger.error('See DATABASE_SETUP.md for setup instructions.');
    }

    const app = createApp();

    app.listen(config.port, config.host, () => {
        logger.info(`🚀 DOCX Template Engine running at http://${config.host}:${config.port}`);
        logger.info(`📁 Template storage: ${config.storagePath}`);
        logger.info(`📄 Output directory: ${config.outputPath}`);
        logger.info(`🔷 LibreOffice path: ${config.libreOfficePath}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, closing database connections...');
        await database.close();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        logger.info('SIGINT received, closing database connections...');
        await database.close();
        process.exit(0);
    });
}

main().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
});
