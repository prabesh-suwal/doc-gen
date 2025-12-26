/**
 * ExpressionEvaluator - Parses and evaluates ${...} expressions
 * 
 * Supports:
 * - Simple variables: ${name}
 * - Nested paths: ${user.address.city}
 * - Formatters: ${date|date:DD/MM/YYYY}
 * - Chained formatters: ${name|uppercase|truncate:10}
 * - Loop context: ${this.name}, ${this}
 * - Parent scope: ${../name}, ${../../id}
 * - Array access: ${items[0].name}
 * - Loop metadata: ${$index}, ${$first}, ${$last}
 */

import { formatters, FormatterFunction } from '../features/Formatters.js';
import { aggregations } from '../features/Aggregations.js';
import ScopeManager from './ScopeManager.js';

export interface ParsedExpression {
    type: 'variable' | 'loop_start' | 'loop_end' | 'condition_start' | 'condition_end';
    path: string;
    formatters: FormatterCall[];
    raw: string;
    condition?: ConditionInfo;
}

export interface FormatterCall {
    name: string;
    args: unknown[];
}

export interface ConditionInfo {
    type: 'truthy' | 'equals' | 'not_equals' | 'gt' | 'lt' | 'gte' | 'lte';
    left: string;
    right?: string;
}

export class ExpressionEvaluator {
    private customFormatters: Map<string, FormatterFunction> = new Map();

    /**
     * Register a custom formatter
     */
    registerFormatter(name: string, fn: FormatterFunction): void {
        this.customFormatters.set(name, fn);
    }

    /**
     * Parse an expression string (without the ${} delimiters)
     */
    parse(expression: string): ParsedExpression {
        const raw = expression;
        const trimmed = expression.trim();

        // Check for loop end: /each
        if (trimmed === '/each') {
            return { type: 'loop_end', path: '', formatters: [], raw };
        }

        // Check for condition end: /if
        if (trimmed === '/if') {
            return { type: 'condition_end', path: '', formatters: [], raw };
        }

        // Check for loop start: #each array
        if (trimmed.startsWith('#each ')) {
            const path = trimmed.substring(6).trim();
            return { type: 'loop_start', path: this.cleanPath(path), formatters: [], raw };
        }

        // Check for condition start: #if condition
        if (trimmed.startsWith('#if ')) {
            const conditionExpr = trimmed.substring(4).trim();
            const condition = this.parseCondition(conditionExpr);
            return {
                type: 'condition_start',
                path: condition.left,
                formatters: [],
                raw,
                condition
            };
        }

        // Regular variable with optional formatters
        const { path, formatters: formatterCalls } = this.parseVariableWithFormatters(trimmed);

        return {
            type: 'variable',
            path: this.cleanPath(path),
            formatters: formatterCalls,
            raw
        };
    }

    /**
     * Evaluate an expression using the scope manager
     */
    evaluate(expression: string, scopeManager: ScopeManager): unknown {
        const parsed = this.parse(expression);

        if (parsed.type !== 'variable') {
            return null; // Loops and conditions are handled separately
        }

        // Get the value from scope
        let value = scopeManager.resolve(parsed.path);

        // Apply formatters
        for (const formatter of parsed.formatters) {
            value = this.applyFormatter(value, formatter.name, formatter.args);
        }

        return this.formatOutput(value);
    }

    /**
     * Evaluate a condition
     */
    evaluateCondition(condition: ConditionInfo, scopeManager: ScopeManager): boolean {
        const leftValue = scopeManager.resolve(condition.left);

        switch (condition.type) {
            case 'truthy':
                return Boolean(leftValue);

            case 'equals': {
                const rightValue = this.parseStaticValue(condition.right || '');
                return leftValue === rightValue;
            }

            case 'not_equals': {
                const rightValue = this.parseStaticValue(condition.right || '');
                return leftValue !== rightValue;
            }

            case 'gt': {
                const rightValue = parseFloat(condition.right || '0');
                return Number(leftValue) > rightValue;
            }

            case 'lt': {
                const rightValue = parseFloat(condition.right || '0');
                return Number(leftValue) < rightValue;
            }

            case 'gte': {
                const rightValue = parseFloat(condition.right || '0');
                return Number(leftValue) >= rightValue;
            }

            case 'lte': {
                const rightValue = parseFloat(condition.right || '0');
                return Number(leftValue) <= rightValue;
            }

            default:
                return Boolean(leftValue);
        }
    }

    /**
     * Parse a condition expression
     */
    private parseCondition(expr: string): ConditionInfo {
        // Check for equality: x == 'value' or x == value
        const eqMatch = expr.match(/^(.+?)\s*==\s*(.+)$/);
        if (eqMatch) {
            return {
                type: 'equals',
                left: this.cleanPath(eqMatch[1].trim()),
                right: eqMatch[2].trim()
            };
        }

        // Check for inequality: x != 'value'
        const neqMatch = expr.match(/^(.+?)\s*!=\s*(.+)$/);
        if (neqMatch) {
            return {
                type: 'not_equals',
                left: this.cleanPath(neqMatch[1].trim()),
                right: neqMatch[2].trim()
            };
        }

        // Check for greater than or equal: x >= value
        const gteMatch = expr.match(/^(.+?)\s*>=\s*(.+)$/);
        if (gteMatch) {
            return {
                type: 'gte',
                left: this.cleanPath(gteMatch[1].trim()),
                right: gteMatch[2].trim()
            };
        }

        // Check for less than or equal: x <= value
        const lteMatch = expr.match(/^(.+?)\s*<=\s*(.+)$/);
        if (lteMatch) {
            return {
                type: 'lte',
                left: this.cleanPath(lteMatch[1].trim()),
                right: lteMatch[2].trim()
            };
        }

        // Check for greater than: x > value
        const gtMatch = expr.match(/^(.+?)\s*>\s*(.+)$/);
        if (gtMatch) {
            return {
                type: 'gt',
                left: this.cleanPath(gtMatch[1].trim()),
                right: gtMatch[2].trim()
            };
        }

        // Check for less than: x < value
        const ltMatch = expr.match(/^(.+?)\s*<\s*(.+)$/);
        if (ltMatch) {
            return {
                type: 'lt',
                left: this.cleanPath(ltMatch[1].trim()),
                right: ltMatch[2].trim()
            };
        }

        // Simple truthy check
        return {
            type: 'truthy',
            left: this.cleanPath(expr)
        };
    }

    /**
     * Parse variable with formatters: name|formatter1:arg|formatter2
     */
    private parseVariableWithFormatters(expr: string): { path: string; formatters: FormatterCall[] } {
        const parts = this.splitByPipe(expr);
        const path = parts[0].trim();
        const formatterCalls: FormatterCall[] = [];

        for (let i = 1; i < parts.length; i++) {
            const formatter = this.parseFormatterCall(parts[i].trim());
            if (formatter) {
                formatterCalls.push(formatter);
            }
        }

        return { path, formatters: formatterCalls };
    }

    /**
     * Split by pipe, respecting quotes
     */
    private splitByPipe(expr: string): string[] {
        const parts: string[] = [];
        let current = '';
        let inQuote = false;
        let quoteChar = '';

        for (const char of expr) {
            if ((char === '"' || char === "'") && !inQuote) {
                inQuote = true;
                quoteChar = char;
                current += char;
            } else if (char === quoteChar && inQuote) {
                inQuote = false;
                current += char;
            } else if (char === '|' && !inQuote) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        if (current) {
            parts.push(current);
        }

        return parts;
    }

    /**
     * Parse a formatter call: name:arg1:arg2
     */
    private parseFormatterCall(call: string): FormatterCall | null {
        const colonIndex = call.indexOf(':');

        if (colonIndex === -1) {
            return { name: call, args: [] };
        }

        const name = call.substring(0, colonIndex);
        const argsStr = call.substring(colonIndex + 1);
        const args = this.parseFormatterArgs(argsStr);

        return { name, args };
    }

    /**
     * Parse formatter arguments
     */
    private parseFormatterArgs(argsStr: string): unknown[] {
        // For now, treat the whole thing as a single argument
        // Carbone uses : as separator, not ,
        const trimmed = argsStr.trim();

        // Remove quotes if present
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return [trimmed.slice(1, -1)];
        }

        // Try to parse as number
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return [parseFloat(trimmed)];
        }

        return [trimmed];
    }

    /**
     * Parse a static value (for condition comparisons)
     */
    private parseStaticValue(value: string): unknown {
        // First normalize any smart quotes to regular quotes
        const normalized = this.normalizeQuotes(value);
        const trimmed = normalized.trim();

        // Remove quotes (both single and double)
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
        }

        // Boolean
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;

        // Number
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return parseFloat(trimmed);
        }

        // Null
        if (trimmed === 'null') return null;

        return trimmed;
    }

    /**
     * Normalize smart quotes (curly quotes) to regular ASCII quotes
     * Word and LibreOffice often convert straight quotes to smart quotes
     */
    private normalizeQuotes(text: string): string {
        return text
            // Left/right single quotes to straight single quote
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            // Left/right double quotes to straight double quote
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    }

    /**
     * Clean a path expression
     */
    private cleanPath(path: string): string {
        return path.trim();
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
        const aggFn = aggregations[name];
        if (aggFn && Array.isArray(value)) {
            return aggFn(value, args[0] as string);
        }

        // Unknown formatter - return value unchanged
        return value;
    }

    /**
     * Format a value for output
     */
    private formatOutput(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }
}

export default ExpressionEvaluator;
