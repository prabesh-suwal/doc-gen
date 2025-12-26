/**
 * Base error class for template processing errors
 */
export class TemplateError extends Error {
    public readonly code: string;
    public readonly details?: Record<string, unknown>;

    constructor(message: string, code: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'TemplateError';
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error thrown when template file cannot be loaded
 */
export class TemplateLoadError extends TemplateError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'TEMPLATE_LOAD_ERROR', details);
        this.name = 'TemplateLoadError';
    }
}

/**
 * Error thrown when template parsing fails
 */
export class TemplateParseError extends TemplateError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'TEMPLATE_PARSE_ERROR', details);
        this.name = 'TemplateParseError';
    }
}

/**
 * Error thrown when template rendering fails
 */
export class TemplateRenderError extends TemplateError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'TEMPLATE_RENDER_ERROR', details);
        this.name = 'TemplateRenderError';
    }
}

/**
 * Error thrown when template normalization fails
 */
export class NormalizationError extends TemplateError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'NORMALIZATION_ERROR', details);
        this.name = 'NormalizationError';
    }
}

/**
 * Error thrown when output conversion fails
 */
export class ConversionError extends TemplateError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONVERSION_ERROR', details);
        this.name = 'ConversionError';
    }
}

/**
 * Error thrown when template is not found
 */
export class TemplateNotFoundError extends TemplateError {
    constructor(templateId: string) {
        super(`Template not found: ${templateId}`, 'TEMPLATE_NOT_FOUND', { templateId });
        this.name = 'TemplateNotFoundError';
    }
}

/**
 * Error thrown for validation errors
 */
export class ValidationError extends TemplateError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}
