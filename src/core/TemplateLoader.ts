import fs from 'fs/promises';
import path from 'path';
import PizZip from 'pizzip';
import logger from '../utils/Logger.js';
import { TemplateLoadError } from '../utils/errors.js';

export interface TemplateMetadata {
    filename: string;
    size: number;
    loadedFrom: 'file' | 'buffer';
    loadedAt: Date;
}

export interface LoadedTemplate {
    zip: PizZip;
    buffer: Buffer;
    metadata: TemplateMetadata;
}

/**
 * TemplateLoader - Responsible for loading DOCX templates from various sources
 */
export class TemplateLoader {
    /**
     * Load a template from a file path
     */
    async loadFromFile(filePath: string): Promise<LoadedTemplate> {
        logger.debug(`Loading template from file: ${filePath}`);

        try {
            const absolutePath = path.resolve(filePath);
            const buffer = await fs.readFile(absolutePath);
            const filename = path.basename(filePath);

            return this.loadFromBuffer(buffer, filename, 'file');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new TemplateLoadError(`Template file not found: ${filePath}`, {
                    filePath,
                });
            }
            throw new TemplateLoadError(`Failed to load template from file: ${filePath}`, {
                filePath,
                originalError: (error as Error).message,
            });
        }
    }

    /**
     * Load a template from a buffer
     */
    async loadFromBuffer(
        buffer: Buffer,
        filename: string = 'template.docx',
        source: 'file' | 'buffer' = 'buffer'
    ): Promise<LoadedTemplate> {
        logger.debug(`Loading template from buffer: ${filename} (${buffer.length} bytes)`);

        this.validateDocxBuffer(buffer, filename);

        try {
            const zip = new PizZip(buffer);
            this.validateDocxStructure(zip, filename);

            return {
                zip,
                buffer,
                metadata: {
                    filename,
                    size: buffer.length,
                    loadedFrom: source,
                    loadedAt: new Date(),
                },
            };
        } catch (error) {
            if (error instanceof TemplateLoadError) {
                throw error;
            }
            throw new TemplateLoadError(`Failed to parse template: ${filename}`, {
                filename,
                originalError: (error as Error).message,
            });
        }
    }

    /**
     * Validate that the buffer contains a valid DOCX file (ZIP with correct magic bytes)
     */
    private validateDocxBuffer(buffer: Buffer, filename: string): void {
        // Check minimum size
        if (buffer.length < 4) {
            throw new TemplateLoadError(`Invalid template file: ${filename} - file too small`, {
                filename,
                size: buffer.length,
            });
        }

        // Check ZIP magic bytes (PK..)
        const magic = buffer.slice(0, 4);
        if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
            throw new TemplateLoadError(
                `Invalid template file: ${filename} - not a valid DOCX/ZIP file`,
                { filename }
            );
        }
    }

    /**
     * Validate DOCX structure (must contain [Content_Types].xml and word/document.xml)
     */
    private validateDocxStructure(zip: PizZip, filename: string): void {
        const requiredFiles = ['[Content_Types].xml', 'word/document.xml'];

        for (const required of requiredFiles) {
            if (!zip.file(required)) {
                throw new TemplateLoadError(
                    `Invalid DOCX structure: ${filename} - missing ${required}`,
                    { filename, missingFile: required }
                );
            }
        }
    }

    /**
     * Get list of files in the DOCX archive
     */
    getFileList(zip: PizZip): string[] {
        return Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    }

    /**
     * Read a specific file from the DOCX archive
     */
    readFile(zip: PizZip, filename: string): string | null {
        const file = zip.file(filename);
        if (!file) {
            return null;
        }
        return file.asText();
    }
}

export default TemplateLoader;
