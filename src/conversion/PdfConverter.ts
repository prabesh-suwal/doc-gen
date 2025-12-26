import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import logger from '../utils/Logger.js';
import { ConversionError } from '../utils/errors.js';

export type OutputFormat = 'docx' | 'pdf' | 'html';

export interface ConversionResult {
    buffer: Buffer;
    format: OutputFormat;
    filename: string;
}

/**
 * PdfConverter - Converts DOCX to PDF using LibreOffice
 */
export class PdfConverter {
    private libreOfficePath: string;
    private tempPath: string;

    constructor() {
        this.libreOfficePath = config.libreOfficePath;
        this.tempPath = config.tempPath;
    }

    /**
     * Convert DOCX buffer to PDF
     */
    async convert(docxBuffer: Buffer, originalFilename: string = 'document.docx'): Promise<ConversionResult> {
        const operationId = uuidv4();
        const workDir = path.join(this.tempPath, operationId);
        const baseName = path.basename(originalFilename, '.docx');
        const inputPath = path.join(workDir, `${baseName}.docx`);
        const outputPath = path.join(workDir, `${baseName}.pdf`);

        try {
            // Create work directory
            await fs.mkdir(workDir, { recursive: true });

            // Write input file
            await fs.writeFile(inputPath, docxBuffer);

            // Run LibreOffice conversion
            await this.runConversion(inputPath, workDir, 'pdf');

            // Read the output file
            const outputBuffer = await fs.readFile(outputPath);

            logger.info(`PDF conversion complete: ${docxBuffer.length} -> ${outputBuffer.length} bytes`);

            return {
                buffer: outputBuffer,
                format: 'pdf',
                filename: `${baseName}.pdf`,
            };
        } catch (error) {
            throw new ConversionError('Failed to convert to PDF', {
                operationId,
                originalError: (error as Error).message,
            });
        } finally {
            // Cleanup
            this.cleanup(workDir);
        }
    }

    /**
     * Run LibreOffice conversion
     */
    private runConversion(inputPath: string, outputDir: string, format: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const userInstallation = `file://${path.join(this.tempPath, `profile-${uuidv4()}`)}`;

            const args = [
                '--headless',
                '--invisible',
                '--nologo',
                '--nofirststartwizard',
                `-env:UserInstallation=${userInstallation}`,
                '--convert-to',
                format,
                '--outdir',
                outputDir,
                inputPath,
            ];

            logger.debug(`Running: ${this.libreOfficePath} ${args.join(' ')}`);

            const process = spawn(this.libreOfficePath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stderr = '';

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timeout = setTimeout(() => {
                process.kill('SIGKILL');
                reject(new Error('PDF conversion timed out'));
            }, 120000); // 2 minute timeout for PDF

            process.on('close', (code) => {
                clearTimeout(timeout);

                if (code === 0) {
                    resolve();
                } else {
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
     * Cleanup work directory
     */
    private async cleanup(workDir: string): Promise<void> {
        try {
            await fs.rm(workDir, { recursive: true, force: true });
        } catch {
            logger.warn(`Failed to cleanup work directory: ${workDir}`);
        }
    }
}

export default PdfConverter;
