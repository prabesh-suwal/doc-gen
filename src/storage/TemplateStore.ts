import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import logger from '../utils/Logger.js';
import { TemplateNotFoundError, TemplateLoadError } from '../utils/errors.js';
import database from '../database/connection.js';

export interface TemplateMetadata {
    id: string;
    filename: string;
    originalName: string;
    size: number;
    createdAt: string;
    updatedAt: string;
    source?: string;
    tags?: string[];
}

interface TemplateIndex {
    templates: Record<string, TemplateMetadata>;
}

/**
 * TemplateStore - File-based template storage
 */
export class TemplateStore {
    private storagePath: string;
    private indexPath: string;
    private index: TemplateIndex | null = null;

    constructor() {
        this.storagePath = config.storagePath;
        this.indexPath = path.join(this.storagePath, 'index.json');
    }

    /**
     * Initialize storage directory
     */
    async initialize(): Promise<void> {
        await fs.mkdir(this.storagePath, { recursive: true });
        await this.loadIndex();
        logger.info(`Template storage initialized at: ${this.storagePath}`);
    }

    /**
     * Load the template index
     */
    private async loadIndex(): Promise<void> {
        try {
            const data = await fs.readFile(this.indexPath, 'utf-8');
            this.index = JSON.parse(data);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                this.index = { templates: {} };
                await this.saveIndex();
            } else {
                throw error;
            }
        }
    }

    /**
     * Save the template index
     */
    private async saveIndex(): Promise<void> {
        if (!this.index) return;
        await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
    }

    /**
     * Store a template (both file and database)
     */
    async store(buffer: Buffer, originalName: string, source?: string, uploadedBy?: string): Promise<TemplateMetadata> {
        if (!this.index) await this.loadIndex();

        const id = uuidv4();
        const filename = `${id}.docx`;
        const filePath = path.join(this.storagePath, filename);

        // Save to file system
        await fs.writeFile(filePath, buffer);

        const metadata: TemplateMetadata = {
            id,
            filename,
            originalName,
            size: buffer.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source,
        };

        // Save to index.json
        this.index!.templates[id] = metadata;
        await this.saveIndex();

        // Save to database
        if (uploadedBy) {
            try {
                await database.query(
                    `INSERT INTO templates (id, name, original_filename, file_path, file_size, uploaded_by, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                    [id, originalName, originalName, filePath, buffer.length, uploadedBy]
                );
                logger.debug(`Template saved to database: ${id}`);
            } catch (dbError) {
                logger.error('Failed to save template to database:', dbError);
                // Continue even if database save fails - file system is source of truth
            }
        }

        logger.info(`Template stored: ${id} (${originalName})`);
        return metadata;
    }

    /**
     * Get template by ID
     */
    async get(id: string): Promise<{ buffer: Buffer; metadata: TemplateMetadata }> {
        if (!this.index) await this.loadIndex();

        const metadata = this.index!.templates[id];
        if (!metadata) {
            throw new TemplateNotFoundError(id);
        }

        const filePath = path.join(this.storagePath, metadata.filename);

        try {
            const buffer = await fs.readFile(filePath);
            return { buffer, metadata };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new TemplateNotFoundError(id);
            }
            throw new TemplateLoadError(`Failed to read template: ${id}`, {
                originalError: (error as Error).message,
            });
        }
    }

    /**
     * Get template metadata by ID
     */
    async getMetadata(id: string): Promise<TemplateMetadata | null> {
        if (!this.index) await this.loadIndex();
        return this.index!.templates[id] || null;
    }

    /**
     * Delete template (from both file and database)
     */
    async delete(id: string): Promise<boolean> {
        if (!this.index) await this.loadIndex();

        const metadata = this.index!.templates[id];
        if (!metadata) {
            return false;
        }

        const filePath = path.join(this.storagePath, metadata.filename);

        // Delete from file system
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }

        // Delete from index
        delete this.index!.templates[id];
        await this.saveIndex();

        // Delete from database
        try {
            await database.query('DELETE FROM templates WHERE id = $1', [id]);
            logger.debug(`Template deleted from database: ${id}`);
        } catch (dbError) {
            logger.error('Failed to delete template from database:', dbError);
        }

        logger.info(`Template deleted: ${id}`);
        return true;
    }

    /**
     * List all templates
     */
    async list(): Promise<TemplateMetadata[]> {
        if (!this.index) await this.loadIndex();
        return Object.values(this.index!.templates);
    }

    /**
     * Check if template exists
     */
    async exists(id: string): Promise<boolean> {
        if (!this.index) await this.loadIndex();
        return id in this.index!.templates;
    }

    /**
     * Update template metadata
     */
    async updateMetadata(id: string, updates: Partial<TemplateMetadata>): Promise<TemplateMetadata | null> {
        if (!this.index) await this.loadIndex();

        const metadata = this.index!.templates[id];
        if (!metadata) {
            return null;
        }

        const updated = {
            ...metadata,
            ...updates,
            id, // Ensure ID cannot be changed
            updatedAt: new Date().toISOString(),
        };

        this.index!.templates[id] = updated;
        await this.saveIndex();

        return updated;
    }
}

export default TemplateStore;
