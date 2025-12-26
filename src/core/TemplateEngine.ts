/**
 * TemplateEngine - Core DOCX templating engine
 * 
 * Uses custom Carbone-like templating processor supporting:
 * - ${variable} - Simple variables
 * - ${#each array}...${/each} - Loops
 * - ${#if condition}...${/if} - Conditions
 * - ${this.property} - Current loop context
 * - ${../property} - Parent scope access
 * - ${value|formatter:arg} - Formatters
 */

import PizZip from 'pizzip';
import logger from '../utils/Logger.js';
import { TemplateRenderError } from '../utils/errors.js';
import { registerFormatter, FormatterFunction } from '../features/Formatters.js';
import { registerAggregation, AggregationFunction } from '../features/Aggregations.js';
import { TemplateProcessor } from '../engine/TemplateProcessor.js';
import { TablePageBreaker } from '../operations/TablePageBreaker.js';

export interface RenderOptions {
    data: Record<string, unknown>;
    operations?: Record<string, unknown>;
}

export interface RenderResult {
    buffer: Buffer;
    errors: string[];
    warnings: string[];
}

/**
 * TemplateEngine - Core templating engine using custom processor
 */
export class TemplateEngine {
    private templateProcessor: TemplateProcessor;
    private tablePageBreaker: TablePageBreaker;

    constructor() {
        this.templateProcessor = new TemplateProcessor();
        this.tablePageBreaker = new TablePageBreaker();
    }

    /**
     * Register a custom formatter
     */
    registerFormatter(name: string, fn: FormatterFunction): void {
        registerFormatter(name, fn);
        this.templateProcessor.getExpressionEvaluator().registerFormatter(name, fn);
    }

    /**
     * Register a custom aggregation
     */
    registerAggregation(name: string, fn: AggregationFunction): void {
        registerAggregation(name, fn);
    }

    /**
     * Render a template with data
     */
    async render(zip: PizZip, options: RenderOptions): Promise<RenderResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            logger.debug('Starting template rendering...');

            // Files to process
            const filesToProcess = [
                'word/document.xml',
                'word/header1.xml',
                'word/header2.xml',
                'word/header3.xml',
                'word/footer1.xml',
                'word/footer2.xml',
                'word/footer3.xml',
            ];

            // Process each file
            for (const filename of filesToProcess) {
                const file = zip.file(filename);
                if (!file) continue;

                let content = file.asText();

                // Process the content with template processor
                const result = this.templateProcessor.process(content, options.data);
                content = result.content;

                logger.info(`options.operations?.tablePageBreaking ${options.operations?.tablePageBreaking} `);

                // Apply table operations (page breaking and/or header repetition)
                // Even if tablePageBreaking is false, we may need to process header repetition
                if (filename === 'word/document.xml' && options.operations) {
                    if (options.operations.tablePageBreaking) {
                        logger.info('Applying table page breaking...');
                    }
                    content = this.tablePageBreaker.processDocument(
                        content,
                        options.operations as any
                    );
                }

                // Update the zip file
                zip.file(filename, content);

                // Collect warnings
                warnings.push(...result.warnings);

                logger.debug(`Processed ${filename}`);
            }

            // Generate output buffer
            const outputBuffer = zip.generate({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 9 },
            });

            logger.info('Template rendered successfully');
            return {
                buffer: outputBuffer,
                errors,
                warnings,
            };
        } catch (error) {
            const err = error as Error;
            logger.error('Template rendering failed:', err);
            throw new TemplateRenderError('Unexpected error during rendering', {
                originalError: err.message,
            });
        }
    }

    /**
     * Parse a template to extract all expressions (for validation)
     */
    parseTemplate(zip: PizZip): string[] {
        const expressions: string[] = [];
        const expressionRegex = /\$\{([^}]+)\}/g;

        const filesToParse = [
            'word/document.xml',
            'word/header1.xml',
            'word/header2.xml',
            'word/header3.xml',
            'word/footer1.xml',
            'word/footer2.xml',
            'word/footer3.xml',
        ];

        for (const filename of filesToParse) {
            const file = zip.file(filename);
            if (!file) continue;

            const content = file.asText();
            let match;

            while ((match = expressionRegex.exec(content)) !== null) {
                expressions.push(match[1]);
            }
        }

        return expressions;
    }

    /**
     * Validate template expressions
     */
    validateTemplate(zip: PizZip): { valid: boolean; issues: string[] } {
        const issues: string[] = [];
        const expressions = this.parseTemplate(zip);

        // Track open blocks
        const blockStack: string[] = [];

        for (const expr of expressions) {
            const trimmed = expr.trim();

            if (trimmed.startsWith('#each ')) {
                blockStack.push('each');
            } else if (trimmed === '/each') {
                if (blockStack.pop() !== 'each') {
                    issues.push(`Mismatched /each - no opening #each`);
                }
            } else if (trimmed.startsWith('#if ')) {
                blockStack.push('if');
            } else if (trimmed === '/if') {
                if (blockStack.pop() !== 'if') {
                    issues.push(`Mismatched /if - no opening #if`);
                }
            }
        }

        // Check for unclosed blocks
        for (const block of blockStack) {
            issues.push(`Unclosed #${block} block`);
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * Get template processor for advanced usage
     */
    getProcessor(): TemplateProcessor {
        return this.templateProcessor;
    }
}

export default TemplateEngine;
