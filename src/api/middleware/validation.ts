import { z } from 'zod';

// Output format enum
export const OutputFormatSchema = z.enum(['docx', 'pdf', 'html']);

// Operation config schema
export const OperationConfigSchema = z.object({
    pageBreakBefore: z.array(z.string()).optional(),
    pageBreakAfter: z.array(z.string()).optional(),
    conditionalBlocks: z.record(z.boolean()).optional(),
    formatting: z.record(z.unknown()).optional(),
    computed: z.record(z.string()).optional(),
}).optional();

// Render request schema (for one-time render)
export const RenderRequestSchema = z.object({
    data: z.record(z.unknown()),
    result: OutputFormatSchema.default('docx'),
    operation: OperationConfigSchema,
});

// Render with template ID schema
export const RenderByIdRequestSchema = z.object({
    data: z.record(z.unknown()),
    result: OutputFormatSchema.default('docx'),
    operation: OperationConfigSchema,
});

// Template metadata update schema
export const TemplateUpdateSchema = z.object({
    tags: z.array(z.string()).optional(),
});

export type OutputFormat = z.infer<typeof OutputFormatSchema>;
export type OperationConfig = z.infer<typeof OperationConfigSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type RenderByIdRequest = z.infer<typeof RenderByIdRequestSchema>;
export type TemplateUpdate = z.infer<typeof TemplateUpdateSchema>;
