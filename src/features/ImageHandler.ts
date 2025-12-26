import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
import logger from '../utils/Logger.js';

export interface ImageData {
    data: Buffer;
    extension: string;
    width?: number;
    height?: number;
}

export interface ImageOptions {
    maxWidth?: number;
    maxHeight?: number;
    centered?: boolean;
}

/**
 * ImageHandler - Handles dynamic image loading for templates
 */
export class ImageHandler {
    /**
     * Get image data from various sources
     */
    async getImage(source: unknown): Promise<ImageData | null> {
        if (!source) return null;

        const sourceStr = String(source);

        // Base64 encoded image
        if (sourceStr.startsWith('data:image/')) {
            return this.parseBase64Image(sourceStr);
        }

        // URL (http/https)
        if (sourceStr.startsWith('http://') || sourceStr.startsWith('https://')) {
            return this.fetchImageFromUrl(sourceStr);
        }

        // File path
        if (sourceStr.startsWith('/') || sourceStr.startsWith('./')) {
            return this.loadImageFromFile(sourceStr);
        }

        // Assume it's base64 without data URI prefix
        if (this.isBase64(sourceStr)) {
            return this.parseRawBase64(sourceStr);
        }

        logger.warn(`Unknown image source format: ${sourceStr.substring(0, 50)}...`);
        return null;
    }

    /**
     * Parse a data URI base64 image
     */
    private parseBase64Image(dataUri: string): ImageData | null {
        const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) {
            logger.warn('Invalid data URI format');
            return null;
        }

        const [, extension, base64Data] = match;
        const buffer = Buffer.from(base64Data, 'base64');

        return {
            data: buffer,
            extension: extension.toLowerCase(),
        };
    }

    /**
     * Parse raw base64 data (no data URI prefix)
     */
    private parseRawBase64(base64Data: string): ImageData | null {
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            const extension = this.detectImageFormat(buffer) || 'png';

            return {
                data: buffer,
                extension,
            };
        } catch (error) {
            logger.warn(`Failed to parse base64 image: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Fetch an image from a URL
     */
    private fetchImageFromUrl(url: string): Promise<ImageData | null> {
        return new Promise((resolve) => {
            const protocol = url.startsWith('https') ? https : http;

            const request = protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    logger.warn(`Failed to fetch image from ${url}: HTTP ${response.statusCode}`);
                    resolve(null);
                    return;
                }

                const chunks: Buffer[] = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const extension = this.getExtensionFromUrl(url) || this.detectImageFormat(buffer) || 'png';

                    resolve({
                        data: buffer,
                        extension,
                    });
                });
                response.on('error', (error) => {
                    logger.warn(`Error fetching image from ${url}: ${error.message}`);
                    resolve(null);
                });
            });

            request.on('error', (error) => {
                logger.warn(`Request error for ${url}: ${error.message}`);
                resolve(null);
            });

            // Timeout after 30 seconds
            request.setTimeout(30000, () => {
                request.destroy();
                logger.warn(`Timeout fetching image from ${url}`);
                resolve(null);
            });
        });
    }

    /**
     * Load an image from a file path
     */
    private async loadImageFromFile(filePath: string): Promise<ImageData | null> {
        try {
            const absolutePath = path.resolve(filePath);
            const buffer = await fs.readFile(absolutePath);
            const extension = path.extname(filePath).slice(1).toLowerCase() || 'png';

            return {
                data: buffer,
                extension,
            };
        } catch (error) {
            logger.warn(`Failed to load image from ${filePath}: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Check if a string is valid base64
     */
    private isBase64(str: string): boolean {
        if (str.length < 100) return false; // Too short to be an image
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        return base64Regex.test(str);
    }

    /**
     * Detect image format from buffer magic bytes
     */
    private detectImageFormat(buffer: Buffer): string | null {
        if (buffer.length < 4) return null;

        // PNG: 89 50 4E 47
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
            return 'png';
        }

        // JPEG: FF D8 FF
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
            return 'jpeg';
        }

        // GIF: 47 49 46 38
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
            return 'gif';
        }

        // WebP: 52 49 46 46 ... 57 45 42 50
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
            if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
                return 'webp';
            }
        }

        // BMP: 42 4D
        if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
            return 'bmp';
        }

        return null;
    }

    /**
     * Get file extension from URL
     */
    private getExtensionFromUrl(url: string): string | null {
        try {
            const urlPath = new URL(url).pathname;
            const ext = path.extname(urlPath).slice(1).toLowerCase();
            if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
                return ext === 'jpg' ? 'jpeg' : ext;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get image size configuration for docxtemplater
     */
    getImageSize(
        imageData: ImageData,
        options: ImageOptions = {}
    ): [number, number] {
        // Default size if dimensions not detected
        let width = imageData.width || 200;
        let height = imageData.height || 200;

        // Apply max constraints
        if (options.maxWidth && width > options.maxWidth) {
            const ratio = options.maxWidth / width;
            width = options.maxWidth;
            height = Math.round(height * ratio);
        }

        if (options.maxHeight && height > options.maxHeight) {
            const ratio = options.maxHeight / height;
            height = options.maxHeight;
            width = Math.round(width * ratio);
        }

        return [width, height];
    }
}

export default ImageHandler;
