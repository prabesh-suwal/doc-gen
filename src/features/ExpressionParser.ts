import { formatters, FormatterFunction } from './Formatters.js';
import { aggregations, AggregationFunction } from './Aggregations.js';

export interface ParsedExpression {
    path: string;
    formatters: Array<{ name: string; args: unknown[] }>;
    isLoop: boolean;
    isEndLoop: boolean;
    isCondition: boolean;
    isImage: boolean;
    raw: string;
}

/**
 * ExpressionParser - Parses and evaluates template expressions
 * 
 * Supports:
 * - Simple variables: {d.name}
 * - Nested properties: {d.user.address.city}
 * - Formatters: {d.date:formatDate('YYYY-MM-DD')}
 * - Chained formatters: {d.name:upperCase():truncate(10)}
 * - Loops: {#d.items}...{/d.items}
 * - Conditions: {#d.isActive}...{/d.isActive}
 * - Images: {%d.logo}
 */
export class ExpressionParser {
    private customFormatters: Map<string, FormatterFunction> = new Map();
    private customAggregations: Map<string, AggregationFunction> = new Map();

    /**
     * Register a custom formatter
     */
    registerFormatter(name: string, fn: FormatterFunction): void {
        this.customFormatters.set(name, fn);
    }

    /**
     * Register a custom aggregation
     */
    registerAggregation(name: string, fn: AggregationFunction): void {
        this.customAggregations.set(name, fn);
    }

    /**
     * Parse a template expression
     */
    parse(expression: string): ParsedExpression {
        const raw = expression;
        let expr = expression.trim();

        // Check for special prefixes
        const isLoop = expr.startsWith('#');
        const isEndLoop = expr.startsWith('/');
        const isImage = expr.startsWith('%');
        const isCondition = isLoop; // Conditions use same syntax as loops

        // Remove prefix
        if (isLoop || isEndLoop || isImage) {
            expr = expr.substring(1);
        }

        // Remove 'd.' prefix if present
        if (expr.startsWith('d.')) {
            expr = expr.substring(2);
        }

        // Parse formatters
        const parts = this.splitFormatters(expr);
        const path = parts[0];
        const formatterDefs: Array<{ name: string; args: unknown[] }> = [];

        for (let i = 1; i < parts.length; i++) {
            const formatterPart = parts[i];
            const parsed = this.parseFormatterCall(formatterPart);
            if (parsed) {
                formatterDefs.push(parsed);
            }
        }

        return {
            path,
            formatters: formatterDefs,
            isLoop,
            isEndLoop,
            isCondition,
            isImage,
            raw,
        };
    }

    /**
     * Evaluate an expression against data
     */
    evaluate(expression: string, data: Record<string, unknown>): unknown {
        const parsed = this.parse(expression);

        // Get the base value
        let value = this.getValueByPath(data, parsed.path);

        // Apply formatters
        for (const formatter of parsed.formatters) {
            value = this.applyFormatter(value, formatter.name, formatter.args);
        }

        return value;
    }

    /**
     * Get a value from an object using dot notation
     */
    getValueByPath(obj: unknown, path: string): unknown {
        if (!path || path === '') return obj;
        if (obj === null || obj === undefined) return undefined;

        const parts = path.split('.');
        let current: unknown = obj;

        for (const part of parts) {
            if (current === null || current === undefined) return undefined;

            // Handle array access like items[0]
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
                const [, arrayName, indexStr] = arrayMatch;
                if (typeof current !== 'object') return undefined;
                const arr = (current as Record<string, unknown>)[arrayName];
                if (!Array.isArray(arr)) return undefined;
                current = arr[parseInt(indexStr, 10)];
            } else {
                if (typeof current !== 'object') return undefined;
                current = (current as Record<string, unknown>)[part];
            }
        }

        return current;
    }

    /**
     * Split expression into path and formatter parts
     */
    private splitFormatters(expr: string): string[] {
        const parts: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < expr.length; i++) {
            const char = expr[i];
            const prevChar = i > 0 ? expr[i - 1] : '';

            // Handle string boundaries
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // Track parentheses depth
            if (!inString) {
                if (char === '(') depth++;
                if (char === ')') depth--;

                // Split on colon only at depth 0 and not in string
                if (char === ':' && depth === 0) {
                    parts.push(current.trim());
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        if (current.trim()) {
            parts.push(current.trim());
        }

        return parts;
    }

    /**
     * Parse a formatter call like "formatDate('YYYY-MM-DD')"
     */
    private parseFormatterCall(call: string): { name: string; args: unknown[] } | null {
        const match = call.match(/^(\w+)(?:\((.*)\))?$/);
        if (!match) return null;

        const [, name, argsStr] = match;
        const args: unknown[] = [];

        if (argsStr) {
            // Parse arguments
            const parsedArgs = this.parseArguments(argsStr);
            args.push(...parsedArgs);
        }

        return { name, args };
    }

    /**
     * Parse formatter arguments
     */
    private parseArguments(argsStr: string): unknown[] {
        const args: unknown[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i <= argsStr.length; i++) {
            const char = argsStr[i] || ',';
            const prevChar = i > 0 ? argsStr[i - 1] : '';

            // Handle string boundaries
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(' || char === '[' || char === '{') depth++;
                if (char === ')' || char === ']' || char === '}') depth--;

                if ((char === ',' && depth === 0) || i === argsStr.length) {
                    const trimmed = current.trim();
                    if (trimmed) {
                        args.push(this.parseValue(trimmed));
                    }
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        return args;
    }

    /**
     * Parse a single value (string, number, boolean, etc.)
     */
    private parseValue(value: string): unknown {
        // String literals
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            return value.slice(1, -1);
        }

        // Numbers
        if (/^-?\d+(\.\d+)?$/.test(value)) {
            return parseFloat(value);
        }

        // Booleans
        if (value === 'true') return true;
        if (value === 'false') return false;

        // Null/undefined
        if (value === 'null') return null;
        if (value === 'undefined') return undefined;

        // Return as string
        return value;
    }

    /**
     * Apply a formatter to a value
     */
    private applyFormatter(value: unknown, name: string, args: unknown[]): unknown {
        // Check custom formatters first
        const customFn = this.customFormatters.get(name);
        if (customFn) {
            return customFn(value, ...args);
        }

        // Check built-in formatters
        const builtInFn = formatters[name];
        if (builtInFn) {
            return builtInFn(value, ...args);
        }

        // Check aggregations (for arrays)
        const customAgg = this.customAggregations.get(name);
        if (customAgg && Array.isArray(value)) {
            return customAgg(value, args[0] as string);
        }

        const builtInAgg = aggregations[name];
        if (builtInAgg && Array.isArray(value)) {
            return builtInAgg(value, args[0] as string);
        }

        // Unknown formatter - return value unchanged
        return value;
    }
}

export default ExpressionParser;
