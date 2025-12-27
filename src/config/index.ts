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
    database: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        max: number;
    };
    jwt: {
        accessTokenSecret: string;
        refreshTokenSecret: string;
        accessTokenExpiry: string;
        refreshTokenExpiry: string;
    };
    bcrypt: {
        saltRounds: number;
    };
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
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'docgen',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
    },
    jwt: {
        accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-token-key-change-in-production',
        refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-token-key-change-in-production',
        accessTokenExpiry: '1h',
        refreshTokenExpiry: '7d',
    },
    bcrypt: {
        saltRounds: 12,
    },
};

export default config;
