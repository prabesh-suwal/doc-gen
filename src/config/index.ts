import path from 'path';
import os from 'os';

export interface Config {
    port: number;
    host: string;
    storagePath: string;
    outputPath: string;
    tempPath: string;
    libreOfficePath: string;
    maxFileSize: number; // in bytes
    enableNormalization: boolean;
    logLevel: string;
}

const config: Config = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    storagePath: process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'templates'),
    outputPath: process.env.OUTPUT_PATH || path.join(process.cwd(), 'output'),
    tempPath: process.env.TEMP_PATH || path.join(os.tmpdir(), 'doc-gen'),
    libreOfficePath: process.env.LIBREOFFICE_PATH || 'soffice',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
    enableNormalization: process.env.ENABLE_NORMALIZATION !== 'false',
    logLevel: process.env.LOG_LEVEL || 'info',
};

export default config;
