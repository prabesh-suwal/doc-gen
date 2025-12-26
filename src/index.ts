import { createApp } from './app.js';
import config from './config/index.js';
import logger from './utils/Logger.js';
import fs from 'fs/promises';

async function main(): Promise<void> {
    // Ensure required directories exist
    await fs.mkdir(config.storagePath, { recursive: true });
    await fs.mkdir(config.outputPath, { recursive: true });
    await fs.mkdir(config.tempPath, { recursive: true });

    const app = createApp();

    app.listen(config.port, config.host, () => {
        logger.info(`🚀 DOCX Template Engine running at http://${config.host}:${config.port}`);
        logger.info(`📁 Template storage: ${config.storagePath}`);
        logger.info(`📄 Output directory: ${config.outputPath}`);
        logger.info(`🔷 LibreOffice path: ${config.libreOfficePath}`);
    });
}

main().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
});
