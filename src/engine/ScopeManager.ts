/**
 * ScopeManager - Manages variable scope for nested loops
 * 
 * Handles:
 * - Scope stack for nested loops
 * - `this` reference resolution
 * - `../` parent scope navigation
 * - Loop metadata ($index, $first, $last, $count)
 */

export interface LoopMetadata {
    $index: number;
    $first: boolean;
    $last: boolean;
    $count: number;
}

export interface ScopeContext {
    data: Record<string, unknown>;
    loopMeta?: LoopMetadata;
}

export class ScopeManager {
    private scopeStack: ScopeContext[] = [];
    private rootData: Record<string, unknown> = {};

    /**
     * Initialize with root data
     */
    initialize(data: Record<string, unknown>): void {
        this.rootData = data;
        this.scopeStack = [{ data }];
    }

    /**
     * Push a new scope onto the stack (entering a loop)
     */
    pushScope(data: Record<string, unknown>, loopMeta?: LoopMetadata): void {
        this.scopeStack.push({ data, loopMeta });
    }

    /**
     * Pop the current scope (exiting a loop)
     */
    popScope(): void {
        if (this.scopeStack.length > 1) {
            this.scopeStack.pop();
        }
    }

    /**
     * Get the current scope
     */
    getCurrentScope(): ScopeContext {
        return this.scopeStack[this.scopeStack.length - 1];
    }

    /**
     * Get the current depth (number of nested scopes)
     */
    getDepth(): number {
        return this.scopeStack.length;
    }

    /**
     * Resolve a path to a value
     * Handles: this., ../, regular paths
     */
    resolve(path: string): unknown {
        const trimmedPath = path.trim();

        // Handle $index, $first, $last, $count
        if (trimmedPath.startsWith('$')) {
            return this.resolveLoopMeta(trimmedPath);
        }

        // Handle 'this' reference
        if (trimmedPath === 'this') {
            return this.getCurrentScope().data;
        }

        // Handle 'this.property'
        if (trimmedPath.startsWith('this.')) {
            const propertyPath = trimmedPath.substring(5);
            return this.getValueByPath(this.getCurrentScope().data, propertyPath);
        }

        // Handle '../' parent scope references
        if (trimmedPath.startsWith('../')) {
            return this.resolveParentPath(trimmedPath);
        }

        // Try current scope first, then walk up the scope stack
        const currentScope = this.getCurrentScope().data;
        let value = this.getValueByPath(currentScope, trimmedPath);

        if (value !== undefined) {
            return value;
        }

        // Walk up scope stack to find the value
        for (let i = this.scopeStack.length - 2; i >= 0; i--) {
            value = this.getValueByPath(this.scopeStack[i].data, trimmedPath);
            if (value !== undefined) {
                return value;
            }
        }

        // Try root data
        return this.getValueByPath(this.rootData, trimmedPath);
    }

    /**
     * Resolve loop metadata variables
     */
    private resolveLoopMeta(variable: string): unknown {
        const currentScope = this.getCurrentScope();
        if (!currentScope.loopMeta) {
            return undefined;
        }

        switch (variable) {
            case '$index':
                return currentScope.loopMeta.$index;
            case '$first':
                return currentScope.loopMeta.$first;
            case '$last':
                return currentScope.loopMeta.$last;
            case '$count':
                return currentScope.loopMeta.$count;
            default:
                return undefined;
        }
    }

    /**
     * Resolve parent scope path (../)
     */
    private resolveParentPath(path: string): unknown {
        let currentPath = path;
        let scopeIndex = this.scopeStack.length - 1;

        // Count how many levels up we need to go
        while (currentPath.startsWith('../')) {
            scopeIndex--;
            currentPath = currentPath.substring(3);
        }

        if (scopeIndex < 0) {
            // Went past root, check root data
            return this.getValueByPath(this.rootData, currentPath);
        }

        const targetScope = this.scopeStack[scopeIndex];
        return this.getValueByPath(targetScope.data, currentPath);
    }

    /**
     * Get a value from an object using dot notation
     * Supports array access: items[0].name
     */
    getValueByPath(obj: unknown, path: string): unknown {
        if (!path || path === '') return obj;
        if (obj === null || obj === undefined) return undefined;

        const parts = this.parsePath(path);
        let current: unknown = obj;

        for (const part of parts) {
            if (current === null || current === undefined) return undefined;

            if (typeof current !== 'object') return undefined;

            if (part.isArray) {
                const arr = (current as Record<string, unknown>)[part.name];
                if (!Array.isArray(arr)) return undefined;
                current = arr[part.index!];
            } else {
                current = (current as Record<string, unknown>)[part.name];
            }
        }

        return current;
    }

    /**
     * Parse a path into parts, handling array notation
     */
    private parsePath(path: string): Array<{ name: string; isArray: boolean; index?: number }> {
        const parts: Array<{ name: string; isArray: boolean; index?: number }> = [];
        const segments = path.split('.');

        for (const segment of segments) {
            const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
                parts.push({
                    name: arrayMatch[1],
                    isArray: true,
                    index: parseInt(arrayMatch[2], 10)
                });
            } else {
                parts.push({ name: segment, isArray: false });
            }
        }

        return parts;
    }

    /**
     * Reset the scope manager
     */
    reset(): void {
        this.scopeStack = [];
        this.rootData = {};
    }
}

export default ScopeManager;
