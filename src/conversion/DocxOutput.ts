/**
 * DocxOutput - Handles DOCX output (essentially passthrough)
 */

import { ConversionResult } from './PdfConverter.js';

export class DocxOutput {
    /**
     * Return DOCX buffer as-is
     */
    output(buffer: Buffer, originalFilename: string = 'document.docx'): ConversionResult {
        return {
            buffer,
            format: 'docx',
            filename: originalFilename.endsWith('.docx') ? originalFilename : `${originalFilename}.docx`,
        };
    }
}

export default DocxOutput;
