import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/Logger.js';
import { TemplateError } from '../../utils/errors.js';
import { ZodError } from 'zod';

export interface ApiError {
    error: string;
    code: string;
    details?: unknown;
}

/**
 * Global error handler middleware
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    logger.error(`Error handling request ${req.method} ${req.path}:`, err);

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        const response: ApiError = {
            error: 'Validation error',
            code: 'VALIDATION_ERROR',
            details: err.errors,
        };
        res.status(400).json(response);
        return;
    }

    // Handle custom template errors
    if (err instanceof TemplateError) {
        const statusCode = getStatusCode(err.code);
        const response: ApiError = {
            error: err.message,
            code: err.code,
            details: err.details,
        };
        res.status(statusCode).json(response);
        return;
    }

    // Handle multer errors
    if (err.name === 'MulterError') {
        const response: ApiError = {
            error: err.message,
            code: 'FILE_UPLOAD_ERROR',
        };
        res.status(400).json(response);
        return;
    }

    // Handle unknown errors
    const response: ApiError = {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    };
    res.status(500).json(response);
}

/**
 * Get HTTP status code for error code
 */
function getStatusCode(code: string): number {
    const statusMap: Record<string, number> = {
        VALIDATION_ERROR: 400,
        TEMPLATE_LOAD_ERROR: 400,
        TEMPLATE_PARSE_ERROR: 400,
        TEMPLATE_RENDER_ERROR: 422,
        NORMALIZATION_ERROR: 500,
        CONVERSION_ERROR: 500,
        TEMPLATE_NOT_FOUND: 404,
    };

    return statusMap[code] || 500;
}

/**
 * Not found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
    const response: ApiError = {
        error: `Route not found: ${req.method} ${req.path}`,
        code: 'NOT_FOUND',
    };
    res.status(404).json(response);
}
