import logger from '../utils/Logger.js';

export interface OperationConfig {
    pageBreakBefore?: string[];
    pageBreakAfter?: string[];
    conditionalBlocks?: Record<string, boolean>;
    formatting?: Record<string, unknown>;
    computed?: Record<string, string>;
    tablePageBreaking?: boolean;
    longTableSplit?: boolean;
    repeatTableHeader?: boolean;  // Default: false (don't repeat header on split pages)
}

export interface ProcessedData {
    data: Record<string, unknown>;
    operations: OperationConfig;
}

/**
 * OperationsProcessor - Handles custom operations on data and rendering
 */
export class OperationsProcessor {
    /**
     * Process operations and transform data
     */
    process(data: Record<string, unknown>, operations?: OperationConfig): ProcessedData {
        if (!operations) {
            return { data, operations: {} };
        }

        logger.debug('Processing operations...');

        // Process computed fields
        const processedData = this.processComputedFields(data, operations.computed);

        // Process conditional blocks
        if (operations.conditionalBlocks) {
            this.applyConditionalBlocks(processedData, operations.conditionalBlocks);
        }

        return {
            data: processedData,
            operations,
        };
    }

    /**
     * Process computed fields
     */
    private processComputedFields(
        data: Record<string, unknown>,
        computed?: Record<string, string>
    ): Record<string, unknown> {
        if (!computed) return data;

        const result = { ...data };

        for (const [fieldName, expression] of Object.entries(computed)) {
            try {
                const value = this.evaluateExpression(expression, data);
                this.setValueByPath(result, fieldName, value);
            } catch (error) {
                logger.warn(`Failed to compute field ${fieldName}: ${(error as Error).message}`);
            }
        }

        return result;
    }

    /**
     * Apply conditional blocks to show/hide sections
     */
    private applyConditionalBlocks(
        data: Record<string, unknown>,
        conditionalBlocks: Record<string, boolean>
    ): void {
        for (const [blockName, visible] of Object.entries(conditionalBlocks)) {
            // Set a flag in data for conditional rendering
            this.setValueByPath(data, `_show_${blockName}`, visible);
        }
    }

    /**
     * Simple expression evaluator for computed fields
     * Supports: arithmetic, field references, simple functions
     */
    private evaluateExpression(expression: string, data: Record<string, unknown>): unknown {
        // Replace field references with values
        const fieldPattern = /\$\{([^}]+)\}/g;
        let processedExpr = expression;

        processedExpr = processedExpr.replace(fieldPattern, (_match, fieldPath) => {
            const value = this.getValueByPath(data, fieldPath.trim());
            if (typeof value === 'number') return String(value);
            if (typeof value === 'string') return `"${value}"`;
            return JSON.stringify(value);
        });

        // Evaluate simple arithmetic expressions
        // Note: This is a basic implementation. For production, consider a proper expression parser.
        try {
            // Only allow safe operations
            if (/^[\d\s+\-*/().]+$/.test(processedExpr)) {
                // eslint-disable-next-line no-eval
                return eval(processedExpr);
            }
            return processedExpr;
        } catch {
            return expression;
        }
    }

    /**
     * Get value from object by path
     */
    private getValueByPath(obj: unknown, path: string): unknown {
        if (!path) return obj;
        const parts = path.split('.');
        let current: unknown = obj;

        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            if (typeof current !== 'object') return undefined;
            current = (current as Record<string, unknown>)[part];
        }

        return current;
    }

    /**
     * Set value in object by path
     */
    private setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
        const parts = path.split('.');
        let current: Record<string, unknown> = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current) || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part] as Record<string, unknown>;
        }

        current[parts[parts.length - 1]] = value;
    }

    /**
     * Add page break markers to data
     */
    addPageBreakMarkers(
        data: Record<string, unknown>,
        pageBreakBefore?: string[],
        pageBreakAfter?: string[]
    ): void {
        if (pageBreakBefore) {
            for (const section of pageBreakBefore) {
                this.setValueByPath(data, `_pageBreakBefore_${section}`, true);
            }
        }

        if (pageBreakAfter) {
            for (const section of pageBreakAfter) {
                this.setValueByPath(data, `_pageBreakAfter_${section}`, true);
            }
        }
    }
}

export default OperationsProcessor;
