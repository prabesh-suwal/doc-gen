import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';

dayjs.extend(relativeTime);
dayjs.extend(advancedFormat);

export type FormatterFunction = (value: unknown, ...args: unknown[]) => unknown;

/**
 * Built-in formatters for the template engine
 */
export const formatters: Record<string, FormatterFunction> = {
    // ============= DATE FORMATTERS =============

    /**
     * Format a date value
     * Usage: {d.date:formatDate('YYYY-MM-DD')}
     */
    formatDate: (value: unknown, format: unknown = 'YYYY-MM-DD'): string => {
        if (!value) return '';
        const date = dayjs(value as string | number | Date);
        if (!date.isValid()) return String(value);
        return date.format(String(format));
    },

    /**
     * Add days to a date
     * Usage: {d.date:addDays(7)}
     */
    addDays: (value: unknown, days: unknown = 0): string => {
        if (!value) return '';
        const date = dayjs(value as string | number | Date);
        if (!date.isValid()) return String(value);
        return date.add(Number(days), 'day').format('YYYY-MM-DD');
    },

    /**
     * Get relative time from now
     * Usage: {d.date:relativeTime()}
     */
    relativeTime: (value: unknown): string => {
        if (!value) return '';
        const date = dayjs(value as string | number | Date);
        if (!date.isValid()) return String(value);
        return date.fromNow();
    },

    // ============= NUMBER FORMATTERS =============

    /**
     * Format a number with decimal places
     * Usage: {d.amount:formatNumber(2)}
     */
    formatNumber: (value: unknown, decimals: unknown = 2): string => {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        return num.toFixed(Number(decimals));
    },

    /**
     * Format as currency
     * Usage: {d.price:currency('$')}
     */
    currency: (value: unknown, symbol: unknown = '$', decimals: unknown = 2): string => {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        return `${symbol}${num.toFixed(Number(decimals))}`;
    },

    /**
     * Format as percentage
     * Usage: {d.rate:percentage(1)}
     */
    percentage: (value: unknown, decimals: unknown = 0): string => {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        return `${(num * 100).toFixed(Number(decimals))}%`;
    },

    /**
     * Format number with thousands separator
     * Usage: {d.amount:thousands()}
     */
    thousands: (value: unknown, separator: unknown = ','): string => {
        const num = Number(value);
        if (isNaN(num)) return String(value);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, String(separator));
    },

    // ============= TEXT FORMATTERS =============

    /**
     * Convert to uppercase
     * Usage: {d.name:upperCase()}
     */
    upperCase: (value: unknown): string => {
        return String(value || '').toUpperCase();
    },

    /**
     * Convert to lowercase
     * Usage: {d.name:lowerCase()}
     */
    lowerCase: (value: unknown): string => {
        return String(value || '').toLowerCase();
    },

    /**
     * Capitalize first letter
     * Usage: {d.name:capitalize()}
     */
    capitalize: (value: unknown): string => {
        const str = String(value || '');
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    /**
     * Capitalize each word
     * Usage: {d.name:titleCase()}
     */
    titleCase: (value: unknown): string => {
        return String(value || '')
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase());
    },

    /**
     * Truncate text
     * Usage: {d.description:truncate(50, '...')}
     */
    truncate: (value: unknown, length: unknown = 50, suffix: unknown = '...'): string => {
        const str = String(value || '');
        const maxLen = Number(length);
        if (str.length <= maxLen) return str;
        return str.substring(0, maxLen) + String(suffix);
    },

    /**
     * Trim whitespace
     * Usage: {d.text:trim()}
     */
    trim: (value: unknown): string => {
        return String(value || '').trim();
    },

    /**
     * Replace text
     * Usage: {d.text:replace('old', 'new')}
     */
    replace: (value: unknown, search: unknown, replacement: unknown = ''): string => {
        return String(value || '').replace(new RegExp(String(search), 'g'), String(replacement));
    },

    // ============= UTILITY FORMATTERS =============

    /**
     * Return default value if empty/null/undefined
     * Usage: {d.field:default('N/A')}
     */
    default: (value: unknown, defaultValue: unknown = ''): unknown => {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        return value;
    },

    /**
     * Return replacement if empty
     * Usage: {d.field:ifEmpty('Not provided')}
     */
    ifEmpty: (value: unknown, replacement: unknown = ''): unknown => {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            return replacement;
        }
        return value;
    },

    /**
     * Conditional value
     * Usage: {d.status:ifEqual('active', 'Yes', 'No')}
     */
    ifEqual: (value: unknown, compare: unknown, trueVal: unknown, falseVal: unknown = ''): unknown => {
        return value === compare ? trueVal : falseVal;
    },

    /**
     * Check if value is true/truthy
     * Usage: {d.isActive:ifTrue('Active', 'Inactive')}
     */
    ifTrue: (value: unknown, trueVal: unknown, falseVal: unknown = ''): unknown => {
        return value ? trueVal : falseVal;
    },

    /**
     * Get array length
     * Usage: {d.items:length()}
     */
    length: (value: unknown): number => {
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'string') return value.length;
        return 0;
    },

    /**
     * Join array elements
     * Usage: {d.tags:join(', ')}
     */
    join: (value: unknown, separator: unknown = ', '): string => {
        if (!Array.isArray(value)) return String(value || '');
        return value.join(String(separator));
    },

    /**
     * Get item at index
     * Usage: {d.items:at(0)}
     */
    at: (value: unknown, index: unknown = 0): unknown => {
        if (!Array.isArray(value)) return value;
        const idx = Number(index);
        return value[idx < 0 ? value.length + idx : idx];
    },

    /**
     * Convert to JSON string
     * Usage: {d.object:json()}
     */
    json: (value: unknown): string => {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    },
};

/**
 * Get a formatter by name
 */
export function getFormatter(name: string): FormatterFunction | undefined {
    return formatters[name];
}

/**
 * Register a custom formatter
 */
export function registerFormatter(name: string, fn: FormatterFunction): void {
    formatters[name] = fn;
}

export default formatters;
