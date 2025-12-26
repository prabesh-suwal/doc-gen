export type AggregationFunction = (array: unknown[], field?: string) => unknown;

/**
 * Get a value from an object using a dot-notation path
 */
function getValueByPath(obj: unknown, path: string): unknown {
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
 * Extract numeric values from an array, optionally by field path
 */
function extractNumbers(array: unknown[], field?: string): number[] {
    return array
        .map((item) => {
            const value = field ? getValueByPath(item, field) : item;
            const num = Number(value);
            return isNaN(num) ? null : num;
        })
        .filter((n): n is number => n !== null);
}

/**
 * Built-in aggregation functions
 */
export const aggregations: Record<string, AggregationFunction> = {
    /**
     * Sum of numeric values
     * Usage: {d.items:sum('amount')}
     */
    sum: (array: unknown[], field?: string): number => {
        const numbers = extractNumbers(array, field);
        return numbers.reduce((acc, val) => acc + val, 0);
    },

    /**
     * Count of items
     * Usage: {d.items:count()}
     */
    count: (array: unknown[]): number => {
        return array.length;
    },

    /**
     * Average of numeric values
     * Usage: {d.items:avg('score')}
     */
    avg: (array: unknown[], field?: string): number => {
        const numbers = extractNumbers(array, field);
        if (numbers.length === 0) return 0;
        return numbers.reduce((acc, val) => acc + val, 0) / numbers.length;
    },

    /**
     * Minimum value
     * Usage: {d.items:min('price')}
     */
    min: (array: unknown[], field?: string): number | null => {
        const numbers = extractNumbers(array, field);
        if (numbers.length === 0) return null;
        return Math.min(...numbers);
    },

    /**
     * Maximum value
     * Usage: {d.items:max('price')}
     */
    max: (array: unknown[], field?: string): number | null => {
        const numbers = extractNumbers(array, field);
        if (numbers.length === 0) return null;
        return Math.max(...numbers);
    },

    /**
     * First item
     * Usage: {d.items:first()}
     */
    first: (array: unknown[]): unknown => {
        return array.length > 0 ? array[0] : null;
    },

    /**
     * Last item
     * Usage: {d.items:last()}
     */
    last: (array: unknown[]): unknown => {
        return array.length > 0 ? array[array.length - 1] : null;
    },

    /**
     * Get unique values
     * Usage: {d.items:unique('category')}
     */
    unique: (array: unknown[], field?: string): unknown[] => {
        const values = array.map((item) => (field ? getValueByPath(item, field) : item));
        return [...new Set(values)];
    },

    /**
     * Filter items where field equals value
     * Usage: {d.items:filter('status', 'active')}
     */
    filter: (array: unknown[], field?: string, value?: unknown): unknown[] => {
        if (!field) return array;
        return array.filter((item) => getValueByPath(item, field) === value);
    },

    /**
     * Sort array by field
     * Usage: {d.items:sort('name')} or {d.items:sort('price', 'desc')}
     */
    sort: (array: unknown[], field?: string, order?: unknown): unknown[] => {
        if (!field) return [...array].sort();
        const direction = order === 'desc' ? -1 : 1;
        return [...array].sort((a, b) => {
            const aVal = getValueByPath(a, field);
            const bVal = getValueByPath(b, field);
            if (aVal === bVal) return 0;
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            return (aVal < bVal ? -1 : 1) * direction;
        });
    },

    /**
     * Group by field
     * Usage: {d.items:groupBy('category')}
     */
    groupBy: (array: unknown[], field?: string): Record<string, unknown[]> => {
        if (!field) return { default: array };
        const groups: Record<string, unknown[]> = {};
        for (const item of array) {
            const key = String(getValueByPath(item, field) ?? 'undefined');
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }
        return groups;
    },

    /**
     * Pluck a field from all items
     * Usage: {d.items:pluck('name')}
     */
    pluck: (array: unknown[], field?: string): unknown[] => {
        if (!field) return array;
        return array.map((item) => getValueByPath(item, field));
    },
};

/**
 * Get an aggregation function by name
 */
export function getAggregation(name: string): AggregationFunction | undefined {
    return aggregations[name];
}

/**
 * Register a custom aggregation function
 */
export function registerAggregation(name: string, fn: AggregationFunction): void {
    aggregations[name] = fn;
}

export default aggregations;
