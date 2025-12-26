import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import logger from '../utils/Logger.js';
import { NormalizationError } from '../utils/errors.js';
import { SourceDetectionResult } from './SourceDetector.js';

export interface NormalizationResult {
    normalized: boolean;
    buffer: Buffer;
    reason: string | null;
}

/**
 * Normalizer - Normalizes DOCX templates using LibreOffice headless
 */
export class Normalizer {
    private libreOfficePath: string;
    private tempPath: string;

    constructor() {
        this.libreOfficePath = config.libreOfficePath;
        this.tempPath = config.tempPath;
    }

    /**
     * Normalize a template if needed based on source detection
     */
    async normalizeIfNeeded(
        buffer: Buffer,
        sourceInfo: SourceDetectionResult
    ): Promise<NormalizationResult> {
        if (!config.enableNormalization) {
            logger.debug('Normalization disabled in config');
            return { normalized: false, buffer, reason: 'disabled' };
        }

        if (!sourceInfo.needsNormalization) {
            logger.debug('Template does not need normalization');
            return { normalized: false, buffer, reason: 'not-needed' };
        }

        logger.info(`Normalizing template from ${sourceInfo.source}`);
        const normalizedBuffer = await this.normalize(buffer);

        return {
            normalized: true,
            buffer: normalizedBuffer,
            reason: `normalized-from-${sourceInfo.source}`,
        };
    }

    /**
     * Normalize a DOCX template using LibreOffice
     */
    async normalize(buffer: Buffer): Promise<Buffer> {
        const operationId = uuidv4();
        const workDir = path.join(this.tempPath, operationId);
        const inputPath = path.join(workDir, 'input.docx');
        const outputPath = path.join(workDir, 'input.docx'); // LibreOffice keeps the same name

        try {
            // Create work directory
            await fs.mkdir(workDir, { recursive: true });

            // Write input file
            await fs.writeFile(inputPath, buffer);

            // Run LibreOffice conversion
            await this.runLibreOffice(inputPath, workDir);

            // Read the output file
            const outputBuffer = await fs.readFile(outputPath);

            logger.debug(`Normalization complete: ${buffer.length} -> ${outputBuffer.length} bytes`);
            return outputBuffer;
        } catch (error) {
            throw new NormalizationError('Failed to normalize template', {
                operationId,
                originalError: (error as Error).message,
            });
        } finally {
            // Cleanup
            try {
                await fs.rm(workDir, { recursive: true, force: true });
            } catch {
                logger.warn(`Failed to cleanup work directory: ${workDir}`);
            }
        }
    }

    /**
     * Run LibreOffice headless conversion
     */
    private runLibreOffice(inputPath: string, outputDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Use a unique user profile to avoid conflicts in concurrent operations
            const userInstallation = `file://${path.join(this.tempPath, `profile-${uuidv4()}`)}`;

            const args = [
                '--headless',
                '--invisible',
                '--nologo',
                '--nofirststartwizard',
                `-env:UserInstallation=${userInstallation}`,
                '--convert-to',
                'docx',
                '--outdir',
                outputDir,
                inputPath,
            ];

            logger.debug(`Running: ${this.libreOfficePath} ${args.join(' ')}`);

            const process = spawn(this.libreOfficePath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timeout = setTimeout(() => {
                process.kill('SIGKILL');
                reject(new Error('LibreOffice conversion timed out'));
            }, 60000); // 60 second timeout

            process.on('close', (code) => {
                clearTimeout(timeout);

                if (code === 0) {
                    logger.debug('LibreOffice conversion completed successfully');
                    resolve();
                } else {
                    logger.error(`LibreOffice failed with code ${code}: ${stderr}`);
                    reject(new Error(`LibreOffice exited with code ${code}: ${stderr}`));
                }
            });

            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to start LibreOffice: ${error.message}`));
            });
        });
    }

    /**
     * Check if LibreOffice is available
     */
    async checkAvailability(): Promise<boolean> {
        return new Promise((resolve) => {
            const process = spawn(this.libreOfficePath, ['--version'], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            process.on('close', (code) => {
                resolve(code === 0);
            });

            process.on('error', () => {
                resolve(false);
            });
        });
    }
}

export default Normalizer;
