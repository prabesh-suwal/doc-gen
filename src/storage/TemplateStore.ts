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

/**
 * TemplateStore - Database-backed template storage
 */
export class TemplateStore {
    private storagePath: string;

    constructor() {
        this.storagePath = config.storagePath;
    }

    /**
     * Initialize storage directory
     */
    async initialize(): Promise<void> {
        await fs.mkdir(this.storagePath, { recursive: true });
        logger.info(`Template storage initialized at: ${this.storagePath}`);
    }



    /**
     * Store a template (both file and database)
     */
    async store(
        buffer: Buffer,
        originalName: string,
        source?: string,
        uploadedBy?: string,
        options?: {
            tags?: string[];
            sampleData?: any;
            // Removed: group?: string;
        }
    ): Promise<TemplateMetadata> {
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
            tags: options?.tags,
        };

        // Save to database
        if (uploadedBy) {
            try {
                const tagsArray = options?.tags || [];
                const sampleDataJson = options?.sampleData ? JSON.stringify(options.sampleData) : null;

                await database.query(
                    `INSERT INTO templates (id, name, original_filename, file_path, file_size, uploaded_by, tags, sample_data, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                    [id, originalName, originalName, filePath, buffer.length, uploadedBy, tagsArray, sampleDataJson]
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
        try {
            // Query database for metadata
            const result = await database.query(
                `SELECT id, name as "originalName", original_filename as filename, 
                        file_path as "filePath", file_size as size, 
                        created_at as "createdAt", updated_at as "updatedAt", 
                        group_name as "group", tags, sample_data as "sampleData"
                 FROM templates 
                 WHERE id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                throw new TemplateNotFoundError(id);
            }

            const row = result.rows[0];
            const metadata: TemplateMetadata = {
                id: row.id,
                filename: row.filename,
                originalName: row.originalName,
                size: row.size,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                tags: row.tags || []
            };

            // Read file from disk
            const buffer = await fs.readFile(row.filePath);

            return { buffer, metadata };
        } catch (error) {
            if (error instanceof TemplateNotFoundError) {
                throw error;
            }
            logger.error(`Failed to get template ${id}:`, error);
            throw new TemplateLoadError(`Failed to load template: ${id}`, {
                originalError: (error as Error).message,
            });
        }
    }

    /**
     * Get template metadata by ID
     */
    async getMetadata(id: string): Promise<TemplateMetadata | null> {
        try {
            const result = await database.query(
                `SELECT id, name as "originalName", original_filename as filename, 
                        file_size as size, created_at as "createdAt", 
                        updated_at as "updatedAt", group_name as "group", 
                        tags, sample_data as "sampleData"
                 FROM templates 
                 WHERE id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];
            return {
                id: row.id,
                filename: row.filename,
                originalName: row.originalName,
                size: row.size,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                tags: row.tags || []
            };
        } catch (error) {
            logger.error(`Failed to get template metadata ${id}:`, error);
            return null;
        }
    }

    /**
     * Delete a template
     */
    async delete(id: string): Promise<void> {
        try {
            // Get file path from database
            const result = await database.query(
                `SELECT file_path FROM templates WHERE id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                throw new TemplateNotFoundError(id);
            }

            const filePath = result.rows[0].file_path;

            // Delete from database first
            await database.query(
                `DELETE FROM templates WHERE id = $1`,
                [id]
            );

            // Then delete file from disk
            try {
                await fs.unlink(filePath);
            } catch (fileError) {
                logger.warn(`Failed to delete template file: ${filePath}`, fileError);
                // Continue even if file deletion fails
            }

            logger.info(`Template deleted: ${id}`);
        } catch (error) {
            if (error instanceof TemplateNotFoundError) {
                throw error;
            }
            logger.error(`Failed to delete template ${id}:`, error);
            throw error;
        }
    }

    /**
     * List all templates
     */
    async list(): Promise<TemplateMetadata[]> {
        try {
            const result = await database.query(
                `SELECT id, name as "originalName", original_filename as filename, 
                        file_size as size, created_at as "createdAt", 
                        updated_at as "updatedAt", 
                        tags, sample_data as "sampleData"
                 FROM templates 
                 ORDER BY created_at DESC`
            );

            return result.rows.map(row => ({
                id: row.id,
                filename: row.filename,
                originalName: row.originalName,
                size: row.size,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                tags: row.tags || []
            }));
        } catch (error) {
            logger.error('Failed to list templates from database:', error);
            return [];
        }
    }

    /**
     * Check if template exists
     */
    async exists(id: string): Promise<boolean> {
        try {
            const result = await database.query(
                `SELECT 1 FROM templates WHERE id = $1`,
                [id]
            );
            return result.rows.length > 0;
        } catch (error) {
            logger.error(`Failed to check template existence: ${id}`, error);
            return false;
        }
    }

    /**
     * Update template metadata
     */
    async updateMetadata(id: string, updates: Partial<TemplateMetadata>): Promise<TemplateMetadata | null> {
        // if (!this.index) await this.loadIndex();

        // const metadata = this.index!.templates[id];
        // if (!metadata) {
        //     return null;
        // }

        // const updated = {
        //     ...metadata,
        //     ...updates,
        //     id, // Ensure ID cannot be changed
        //     updatedAt: new Date().toISOString(),
        // };

        // this.index!.templates[id] = updated;
        // await this.saveIndex();

        return null;
    }
}

export default TemplateStore;
