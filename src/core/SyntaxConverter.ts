/**
 * Template Syntax Converter
 * Converts Carbone-style syntax to docxtemplater angular expressions syntax
 * 
 * Conversions:
 * - ${variable} -> {variable}
 * - ${#each array} -> {#array}
 * - ${/each} -> {/}
 * - ${#if condition} -> {#condition}
 * - ${/if} -> {/}
 * - ${this.property} -> {property}
 * - ${var|formatter:arg} -> {var | formatter(arg)}
 * - ${../var} -> {..var} (parent scope)
 */

import PizZip from 'pizzip';
import logger from '../utils/Logger.js';

export class SyntaxConverter {
    /**
     * Convert a template zip from Carbone syntax to docxtemplater syntax
     */
    convert(zip: PizZip): PizZip {
        const filesToConvert = [
            'word/document.xml',
            'word/header1.xml',
            'word/header2.xml',
            'word/header3.xml',
            'word/footer1.xml',
            'word/footer2.xml',
            'word/footer3.xml',
        ];

        for (const filename of filesToConvert) {
            const file = zip.file(filename);
            if (!file) continue;

            const content = file.asText();
            const converted = this.convertContent(content);

            if (content !== converted) {
                logger.debug(`Converted syntax in ${filename}`);
                zip.file(filename, converted);
            }
        }

        return zip;
    }

    /**
     * Convert Carbone syntax to docxtemplater syntax in content
     */
    private convertContent(content: string): string {
        let result = content;

        // Convert ${#each array} to {#array}
        result = result.replace(/\$\{#each\s+([^}]+)\}/g, (_, expr) => {
            const path = this.convertPath(expr.trim());
            return `{#${path}}`;
        });

        // Convert ${/each} to {/}
        result = result.replace(/\$\{\/each\}/g, '{/}');

        // Convert ${#if condition} to {#condition}
        result = result.replace(/\$\{#if\s+([^}]+)\}/g, (_, expr) => {
            const condition = expr.trim();

            // Handle equality comparisons: this.type == "Land"
            const eqMatch = condition.match(/^(.+?)\s*==\s*["']?([^"']+)["']?\s*$/);
            if (eqMatch) {
                const path = this.convertPath(eqMatch[1].trim());
                const value = eqMatch[2].trim();
                return `{#${path} === '${value}'}`;
            }

            // Handle inequality: this.type != "Land"
            const neqMatch = condition.match(/^(.+?)\s*!=\s*["']?([^"']+)["']?\s*$/);
            if (neqMatch) {
                const path = this.convertPath(neqMatch[1].trim());
                const value = neqMatch[2].trim();
                return `{#${path} !== '${value}'}`;
            }

            // Simple truthy check
            const path = this.convertPath(condition);
            return `{#${path}}`;
        });

        // Convert ${/if} to {/}
        result = result.replace(/\$\{\/if\}/g, '{/}');

        // Convert ${this.property|formatter} to {property | formatter}
        result = result.replace(/\$\{this\.([^}]+)\}/g, (_, expr) => {
            return this.convertExpression(expr);
        });

        // Convert ${this} to {.}
        result = result.replace(/\$\{this\}/g, '{.}');

        // Convert ${../var} parent scope references
        result = result.replace(/\$\{(\.\.\/[^}]+)\}/g, (_, expr) => {
            // Convert ../ to .. for docxtemplater
            const converted = expr.replace(/\.\.\//g, '..');
            return this.convertExpression(converted);
        });

        // Convert ${variable} with potential formatters
        result = result.replace(/\$\{([^#/][^}]*)\}/g, (_, expr) => {
            return this.convertExpression(expr);
        });

        return result;
    }

    /**
     * Convert an expression with optional formatters
     */
    private convertExpression(expr: string): string {
        // Check for pipe (formatter) syntax
        const pipeIndex = expr.indexOf('|');

        if (pipeIndex === -1) {
            // No formatter, just convert path
            const path = this.convertPath(expr.trim());
            return `{${path}}`;
        }

        // Has formatter(s)
        const path = this.convertPath(expr.substring(0, pipeIndex).trim());
        const formatterPart = expr.substring(pipeIndex + 1).trim();

        // Convert Carbone formatter syntax to angular expressions
        // Carbone: date:DD/MM/YYYY -> Angular: date('DD/MM/YYYY')
        const convertedFormatter = this.convertFormatterSyntax(formatterPart);

        return `{${path} | ${convertedFormatter}}`;
    }

    /**
     * Convert formatter syntax from Carbone to Angular expressions
     * Carbone: date:DD/MM/YYYY or formatNumber:2
     * Angular: date('DD/MM/YYYY') or formatNumber(2)
     */
    private convertFormatterSyntax(formatter: string): string {
        // Split by colon to get formatter name and args
        const colonIndex = formatter.indexOf(':');

        if (colonIndex === -1) {
            // No arguments, just the formatter name
            return formatter.trim();
        }

        const name = formatter.substring(0, colonIndex).trim();
        const args = formatter.substring(colonIndex + 1).trim();

        // Convert args to function call syntax
        // Check if args is a number
        if (/^-?\d+(\.\d+)?$/.test(args)) {
            return `${name}(${args})`;
        }

        // Otherwise treat as string
        return `${name}('${args}')`;
    }

    /**
     * Convert path expressions
     * - this.property -> property
     * - ../ -> .. (parent scope access not fully supported, strip it)
     */
    private convertPath(path: string): string {
        // Remove "this." prefix
        if (path.startsWith('this.')) {
            return path.substring(5);
        }
        // Handle parent scope references (not directly supported, keep as is)
        return path;
    }

    /**
     * Detect if template uses Carbone syntax
     */
    detectSyntax(zip: PizZip): 'carbone' | 'docxtemplater' | 'unknown' {
        const documentXml = zip.file('word/document.xml')?.asText() || '';

        // Carbone uses ${...} syntax
        if (/\$\{[^}]+\}/.test(documentXml)) {
            return 'carbone';
        }

        // Docxtemplater uses {...} without $
        if (/\{[^${}]+\}/.test(documentXml)) {
            return 'docxtemplater';
        }

        return 'unknown';
    }
}

export default SyntaxConverter;
