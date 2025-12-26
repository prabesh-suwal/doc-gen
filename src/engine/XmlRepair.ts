/**
 * XmlRepair - Repairs split expressions in Word XML
 * 
 * Word often splits text across multiple <w:t> elements, e.g.:
 * <w:r><w:t>${user.</w:t></w:r><w:r><w:t>name}</w:t></w:r>
 * 
 * This module merges them back into coherent expressions:
 * <w:r><w:t>${user.name}</w:t></w:r>
 */

export class XmlRepair {
    /**
     * Repair split expressions in XML content
     */
    repair(xml: string): string {
        let result = xml;

        // Step 1: Merge text across runs within paragraphs
        result = this.mergeSplitTextInParagraphs(result);

        // Step 2: Fix any remaining split expressions by direct text extraction and replacement
        result = this.fixRemainingSpitExpressions(result);

        return result;
    }

    /**
     * Merge split text within paragraphs
     */
    private mergeSplitTextInParagraphs(xml: string): string {
        // Find paragraphs with potential split expressions
        const paragraphRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;

        return xml.replace(paragraphRegex, (match, content: string) => {
            // Extract all text from <w:t> elements in this paragraph
            const textParts: string[] = [];
            const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
            let textMatch;

            while ((textMatch = textRegex.exec(content)) !== null) {
                textParts.push(textMatch[1]);
            }

            const fullText = textParts.join('');

            // Check if this paragraph contains a split expression
            const hasSplitExpression = this.hasSplitExpression(textParts);

            if (!hasSplitExpression) {
                return match; // No split expression, return original
            }

            // Rebuild paragraph with merged text
            return this.rebuildParagraph(content, fullText);
        });
    }

    /**
     * Check if text parts contain a split expression
     */
    private hasSplitExpression(textParts: string[]): boolean {
        let openCount = 0;

        for (const text of textParts) {
            for (let i = 0; i < text.length; i++) {
                if (text[i] === '$' && text[i + 1] === '{') {
                    openCount++;
                    i++;
                } else if (text[i] === '}' && openCount > 0) {
                    openCount--;
                }
            }

            // If we end a text part with unclosed expression, it's split
            if (openCount > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Rebuild a paragraph with merged text
     */
    private rebuildParagraph(content: string, mergedText: string): string {
        // Extract paragraph properties
        const pPrMatch = content.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
        const pPr = pPrMatch ? pPrMatch[0] : '';

        // Get the first run's properties for styling
        let rPr = '';
        const rPrMatch = content.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
        if (rPrMatch) {
            rPr = rPrMatch[0];
        }

        // Build new paragraph
        let result = '<w:p>';
        if (pPr) {
            result += pPr;
        }
        result += '<w:r>';
        if (rPr) {
            result += rPr;
        }
        result += `<w:t>${this.escapeXml(mergedText)}</w:t>`;
        result += '</w:r>';
        result += '</w:p>';

        return result;
    }

    /**
     * Fix remaining split expressions by finding incomplete ones
     */
    private fixRemainingSpitExpressions(xml: string): string {
        // This is a more direct approach - find ${...} patterns that span across XML tags
        // and merge them directly

        // Pattern to match expression start that's followed by XML tags before the closing }
        const splitExprPattern = /\$\{([^}]*)<\/w:t>[\s\S]*?<w:t[^>]*>([^}]*)\}/g;

        let result = xml;
        let iterations = 0;
        const maxIterations = 50;

        while (iterations < maxIterations) {
            const newResult = result.replace(splitExprPattern, (match, _part1, _part2) => {
                // Extract just the text parts and merge
                const allText = this.extractTextFromXml(match);
                return allText;
            });

            if (newResult === result) {
                break;
            }
            result = newResult;
            iterations++;
        }

        return result;
    }

    /**
     * Extract text from XML, stripping all tags
     */
    private extractTextFromXml(xml: string): string {
        // Get text between <w:t> tags
        const textParts: string[] = [];
        const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let match;

        while ((match = textRegex.exec(xml)) !== null) {
            textParts.push(match[1]);
        }

        return textParts.join('');
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(text: string): string {
        return text
            .replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Unescape XML entities
     */
    unescapeXml(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
    }
}

export default XmlRepair;
