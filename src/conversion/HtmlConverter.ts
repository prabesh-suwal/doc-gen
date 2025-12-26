import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import logger from '../utils/Logger.js';
import { ConversionError } from '../utils/errors.js';
import { ConversionResult } from './PdfConverter.js';

/**
 * HtmlConverter - Converts DOCX to HTML using LibreOffice
 */
export class HtmlConverter {
    private libreOfficePath: string;
    private tempPath: string;

    constructor() {
        this.libreOfficePath = config.libreOfficePath;
        this.tempPath = config.tempPath;
    }

    /**
     * Convert DOCX buffer to HTML
     */
    async convert(docxBuffer: Buffer, originalFilename: string = 'document.docx'): Promise<ConversionResult> {
        const operationId = uuidv4();
        const workDir = path.join(this.tempPath, operationId);
        const baseName = path.basename(originalFilename, '.docx');
        const inputPath = path.join(workDir, `${baseName}.docx`);
        const outputPath = path.join(workDir, `${baseName}.html`);

        try {
            // Create work directory
            await fs.mkdir(workDir, { recursive: true });

            // Write input file
            await fs.writeFile(inputPath, docxBuffer);

            // Run LibreOffice conversion
            await this.runConversion(inputPath, workDir);

            // Read the output file
            let htmlContent = await fs.readFile(outputPath, 'utf-8');

            // Clean up the HTML
            htmlContent = this.cleanupHtml(htmlContent);

            const outputBuffer = Buffer.from(htmlContent, 'utf-8');

            logger.info(`HTML conversion complete: ${docxBuffer.length} -> ${outputBuffer.length} bytes`);

            return {
                buffer: outputBuffer,
                format: 'html',
                filename: `${baseName}.html`,
            };
        } catch (error) {
            throw new ConversionError('Failed to convert to HTML', {
                operationId,
                originalError: (error as Error).message,
            });
        } finally {
            // Cleanup
            this.cleanup(workDir);
        }
    }

    /**
     * Run LibreOffice conversion to HTML
     */
    private runConversion(inputPath: string, outputDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const userInstallation = `file://${path.join(this.tempPath, `profile-${uuidv4()}`)}`;

            const args = [
                '--headless',
                '--invisible',
                '--nologo',
                '--nofirststartwizard',
                `-env:UserInstallation=${userInstallation}`,
                '--convert-to',
                'html:HTML:EmbedImages', // Embed images in HTML
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
                reject(new Error('HTML conversion timed out'));
            }, 120000);

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
     * Clean up LibreOffice-generated HTML
     */
    private cleanupHtml(html: string): string {
        // Remove LibreOffice generator meta tag
        html = html.replace(/<meta name="generator"[^>]*>/gi, '');

        // Add viewport meta for responsiveness
        if (!html.includes('viewport')) {
            html = html.replace(
                '</head>',
                '<meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
            );
        }

        // Optionally clean up excessive inline styles
        // This is a basic cleanup - more sophisticated cleanup could be added

        return html;
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

export default HtmlConverter;
