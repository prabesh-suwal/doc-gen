/**
 * TemplateProcessor - Main template processing engine
 * 
 * Processes DOCX XML content:
 * - Replaces ${variable} expressions
 * - Handles ${#each array}...${/each} loops
 * - Handles ${#if condition}...${/if} conditionals
 * - Manages table row repetition
 */

import ScopeManager, { LoopMetadata } from './ScopeManager.js';
import ExpressionEvaluator from './ExpressionEvaluator.js';
import XmlRepair from './XmlRepair.js';

export interface ProcessResult {
    content: string;
    warnings: string[];
}

export class TemplateProcessor {
    private scopeManager: ScopeManager;
    private expressionEvaluator: ExpressionEvaluator;
    private xmlRepair: XmlRepair;
    private warnings: string[] = [];

    // Regex to match ${...} expressions
    private readonly expressionRegex = /\$\{([^}]+)\}/g;

    constructor() {
        this.scopeManager = new ScopeManager();
        this.expressionEvaluator = new ExpressionEvaluator();
        this.xmlRepair = new XmlRepair();
    }

    /**
     * Process template content with data
     */
    process(content: string, data: Record<string, unknown>): ProcessResult {
        this.warnings = [];
        this.scopeManager.initialize(data);

        // Step 1: Repair split expressions
        let result = this.xmlRepair.repair(content);

        // Step 2: Process loops and conditions (block-level)
        result = this.processBlocks(result);

        // Step 3: Process remaining simple expressions
        result = this.processExpressions(result);

        return {
            content: result,
            warnings: this.warnings
        };
    }

    /**
     * Process block-level constructs (loops and conditions)
     */
    private processBlocks(content: string): string {
        let result = content;
        let iterations = 0;
        const maxIterations = 100; // Prevent infinite loops

        // Keep processing until no more blocks are found
        while (iterations < maxIterations) {
            const loopProcessed = this.processLoops(result);
            const conditionProcessed = this.processConditions(loopProcessed);

            if (conditionProcessed === result) {
                break; // No changes made
            }
            result = conditionProcessed;
            iterations++;
        }

        return result;
    }

    /**
     * Process ${#each array}...${/each} loops
     */
    private processLoops(content: string): string {
        // Find loop blocks - match ${#each ...}...${/each}
        const loopStartRegex = /\$\{#each\s+([^}]+)\}/;
        const loopEndMarker = '${/each}';

        let result = content;
        let match;

        while ((match = loopStartRegex.exec(result)) !== null) {
            const startIndex = match.index;
            const startTag = match[0];
            const arrayPath = match[1].trim();

            // Find the matching ${/each}
            const afterStart = result.substring(startIndex + startTag.length);
            const endIndex = this.findMatchingEnd(afterStart, '#each', '/each');

            if (endIndex === -1) {
                this.warnings.push(`Unclosed loop: ${startTag}`);
                break;
            }

            const loopContent = afterStart.substring(0, endIndex);
            const beforeLoop = result.substring(0, startIndex);
            const afterLoop = result.substring(startIndex + startTag.length + endIndex + loopEndMarker.length);

            // Get the array data
            const arrayData = this.scopeManager.resolve(arrayPath);

            if (!Array.isArray(arrayData)) {
                // Not an array - remove the loop block
                result = beforeLoop + afterLoop;
                if (arrayData !== undefined && arrayData !== null) {
                    this.warnings.push(`Expected array for loop: ${arrayPath}`);
                }
                continue;
            }

            // Process each item
            let expandedContent = '';
            const count = arrayData.length;

            for (let i = 0; i < count; i++) {
                const item = arrayData[i] as Record<string, unknown>;
                const loopMeta: LoopMetadata = {
                    $index: i,
                    $first: i === 0,
                    $last: i === count - 1,
                    $count: count
                };

                // Push scope for this item
                this.scopeManager.pushScope(item, loopMeta);

                // Process the loop content for this item
                let itemContent = loopContent;

                // Process nested blocks and expressions
                itemContent = this.processBlocks(itemContent);
                itemContent = this.processExpressions(itemContent);

                expandedContent += itemContent;

                // Pop scope
                this.scopeManager.popScope();
            }

            // Reconstruct the result
            result = beforeLoop + expandedContent + afterLoop;
        }

        // After all loops are processed, remove empty table rows
        result = this.removeEmptyTableRows(result);

        return result;
    }

    /**
     * Process ${#if condition}...${/if} conditions
     */
    private processConditions(content: string): string {
        const conditionStartRegex = /\$\{#if\s+([^}]+)\}/;
        const conditionEndMarker = '${/if}';

        let result = content;
        let match;

        while ((match = conditionStartRegex.exec(result)) !== null) {
            const startIndex = match.index;
            const startTag = match[0];
            const conditionExpr = match[1].trim();

            // Find the matching ${/if}
            const afterStart = result.substring(startIndex + startTag.length);
            const endIndex = this.findMatchingEnd(afterStart, '#if', '/if');

            if (endIndex === -1) {
                this.warnings.push(`Unclosed condition: ${startTag}`);
                break;
            }

            const conditionContent = afterStart.substring(0, endIndex);
            const beforeCondition = result.substring(0, startIndex);
            const afterCondition = result.substring(startIndex + startTag.length + endIndex + conditionEndMarker.length);

            // Parse and evaluate the condition
            const parsed = this.expressionEvaluator.parse('#if ' + conditionExpr);
            const isTrue = parsed.condition
                ? this.expressionEvaluator.evaluateCondition(parsed.condition, this.scopeManager)
                : false;

            if (isTrue) {
                // Condition is true - keep content (but process it)
                const processedContent = this.processBlocks(conditionContent);
                result = beforeCondition + processedContent + afterCondition;
            } else {
                // Condition is false - remove content
                result = beforeCondition + afterCondition;
            }
        }

        return result;
    }

    /**
     * Find the matching end tag, accounting for nesting
     */
    private findMatchingEnd(content: string, startType: string, endType: string): number {
        const startRegex = new RegExp(`\\$\\{${startType}\\s+[^}]+\\}`, 'g');
        const endRegex = new RegExp(`\\$\\{${endType}\\}`, 'g');

        let depth = 1;
        let position = 0;

        while (position < content.length && depth > 0) {
            const remaining = content.substring(position);

            const startMatch = startRegex.exec(remaining);
            const endMatch = endRegex.exec(remaining);

            // Reset regex lastIndex
            startRegex.lastIndex = 0;
            endRegex.lastIndex = 0;

            const startPos = startMatch ? startMatch.index : Infinity;
            const endPos = endMatch ? endMatch.index : Infinity;

            if (endPos < startPos) {
                // Found end tag first
                depth--;
                if (depth === 0) {
                    return position + endPos;
                }
                position += endPos + endMatch![0].length;
            } else if (startPos < endPos) {
                // Found start tag first (nested)
                depth++;
                position += startPos + startMatch![0].length;
            } else {
                // No more tags found
                break;
            }
        }

        return -1;
    }
    /**
     * Remove empty table rows from the content
     * These are rows where all cells are empty (no text content)
     */
    private removeEmptyTableRows(content: string): string {
        let result = content;
        let pos = 0;
        const rowsToRemove: { start: number; end: number }[] = [];

        while (pos < result.length) {
            // Find next <w:tr
            const rowStart = result.indexOf('<w:tr', pos);
            if (rowStart === -1) break;

            // Find closing </w:tr>
            const rowEnd = result.indexOf('</w:tr>', rowStart);
            if (rowEnd === -1) break;

            // Extract the row
            const row = result.substring(rowStart, rowEnd + 7);

            // Get text content
            const rowText = row.replace(/<[^>]+>/g, '').trim();

            // If the row is empty, mark for removal
            if (rowText === '') {
                rowsToRemove.push({ start: rowStart, end: rowEnd + 7 });
            }

            pos = rowEnd + 7;
        }

        // Remove rows in reverse order to preserve indices
        for (let i = rowsToRemove.length - 1; i >= 0; i--) {
            const { start, end } = rowsToRemove[i];
            result = result.substring(0, start) + result.substring(end);
        }

        return result;
    }


    /**
     * Process simple ${variable} expressions
     */
    private processExpressions(content: string): string {
        return content.replace(this.expressionRegex, (_match, expression) => {
            try {
                const parsed = this.expressionEvaluator.parse(expression);

                // Skip block markers (already processed)
                if (parsed.type !== 'variable') {
                    return '';
                }

                const value = this.expressionEvaluator.evaluate(expression, this.scopeManager);

                if (value === null || value === undefined || value === '') {
                    // Log warning for undefined values
                    if (value === undefined) {
                        this.warnings.push(`Undefined value for: ${expression}`);
                    }
                    return '';
                }

                return this.escapeXml(String(value));
            } catch (error) {
                this.warnings.push(`Error evaluating: ${expression} - ${(error as Error).message}`);
                return '';
            }
        });
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Get scope manager for external access
     */
    getScopeManager(): ScopeManager {
        return this.scopeManager;
    }

    /**
     * Get expression evaluator for external access
     */
    getExpressionEvaluator(): ExpressionEvaluator {
        return this.expressionEvaluator;
    }
}

export default TemplateProcessor;
