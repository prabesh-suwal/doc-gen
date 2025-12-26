/**
 * TablePageBreaker - Handles table page breaking logic
 * 
 * Inserts page breaks before tables based on operation configuration:
 * - tablePageBreaking: Enable/disable page breaking for tables
 * - longTableSplit: Allow long tables to split across pages
 */

import logger from '../utils/Logger.js';
import { OperationConfig } from './OperationsProcessor.js';

interface TableInfo {
    startIndex: number;
    endIndex: number;
    rowCount: number;
    xml: string;
}

export class TablePageBreaker {
    // Threshold for determining if table is "long" (rows)
    private readonly LONG_TABLE_THRESHOLD = 35;

    /**
     * Process document XML and add page breaks before tables as needed
     * Also adds cantSplit properties to prevent row splitting
     */
    processDocument(xml: string, config: OperationConfig): string {
        let result = xml;

        // Find all tables in document (needed for both page breaking and header control)
        const tables = this.findTables(xml);

        if (tables.length === 0) {
            logger.debug('No tables found in document');
            return xml;
        }

        logger.info(`Found ${tables.length} table(s) in document`);

        // Process page breaking if enabled
        if (config.tablePageBreaking) {
            logger.debug('Processing tables for page breaking...');

            // Process tables in reverse order to maintain indices
            for (let i = tables.length - 1; i >= 0; i--) {
                const table = tables[i];
                const shouldAddBreak = this.shouldAddPageBreak(table, config);
                logger.info(`🔷 🔷 shouldAddBreak ${shouldAddBreak} `);

                if (shouldAddBreak) {
                    logger.debug(
                        `Adding page break before table at index ${table.startIndex} (${table.rowCount} rows)`
                    );
                    result = this.insertPageBreak(result, table.startIndex);

                    // Also add cantSplit to table rows to prevent row splitting
                    // This ensures the table stays together on one page
                    result = this.addCantSplitToTable(result, table.startIndex + this.getPageBreakLength());
                } else {
                    logger.debug(
                        `Skipping page break for table at index ${table.startIndex} (${table.rowCount} rows)`
                    );
                }
            }
        }

        // Handle table header repetition (independent of page breaking)
        // By default (repeatTableHeader=false), remove tblHeader to prevent repetition
        if (config.repeatTableHeader === false || config.repeatTableHeader === undefined) {
            logger.info('Removing table header repetition from all tables...');
            result = this.removeAllTableHeaderRepetition(result);
        }

        return result;
    }

    /**
     * Add cantSplit and keepNext properties to all rows in a table to prevent splitting
     * cantSplit prevents a row from splitting internally
     * keepNext keeps rows together on the same page
     */
    private addCantSplitToTable(xml: string, tableStartIndex: number): string {
        // Find the table at this position
        const tableRegex = /<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/;
        const beforeTable = xml.substring(0, tableStartIndex);
        const afterTableStart = xml.substring(tableStartIndex);

        const tableMatch = afterTableStart.match(tableRegex);
        if (!tableMatch) {
            return xml;
        }

        let tableXml = tableMatch[0];

        // Process each row individually
        const rowRegex = /<w:tr[^>]*>/g;
        let processedTable = tableXml;
        let match;
        let modifications: Array<{ index: number; oldText: string; newText: string }> = [];
        const rowMatches: Array<{ tag: string; index: number }> = [];

        // Find all row start tags
        while ((match = rowRegex.exec(tableXml)) !== null) {
            rowMatches.push({
                tag: match[0],
                index: match.index
            });
        }

        // Process each row
        for (let i = 0; i < rowMatches.length; i++) {
            const rowStartTag = rowMatches[i].tag;
            const rowStartIndex = rowMatches[i].index;
            const isLastRow = (i === rowMatches.length - 1);

            // Find the end of this row (next <w:tr or </w:tbl>)
            const afterRow = tableXml.substring(rowStartIndex + rowStartTag.length);
            const nextRowIndex = afterRow.search(/<w:tr[^>]*>/);
            const tableEndIndex = afterRow.indexOf('</w:tbl>');

            let rowEndIndex;
            if (nextRowIndex === -1) {
                rowEndIndex = tableEndIndex === -1 ? afterRow.length : tableEndIndex;
            } else if (tableEndIndex === -1) {
                rowEndIndex = nextRowIndex;
            } else {
                rowEndIndex = Math.min(nextRowIndex, tableEndIndex);
            }

            const rowContent = afterRow.substring(0, rowEndIndex);

            // Check if row already has trPr
            const trPrMatch = rowContent.match(/<w:trPr[^>]*>/);

            // Determine what properties to add
            let propertiesToAdd = '';
            if (!rowContent.includes('<w:cantSplit')) {
                propertiesToAdd += '<w:cantSplit/>';
            }
            if (!isLastRow && !rowContent.includes('<w:keepNext')) {
                propertiesToAdd += '<w:keepNext/>';
            }

            if (propertiesToAdd) {
                if (trPrMatch) {
                    // Has trPr, add properties after it
                    const trPrIndex = rowStartIndex + rowStartTag.length + trPrMatch.index!;
                    const trPrTag = trPrMatch[0];
                    modifications.push({
                        index: trPrIndex + trPrTag.length,
                        oldText: '',
                        newText: propertiesToAdd
                    });
                } else {
                    // No trPr, add it after row start tag
                    modifications.push({
                        index: rowStartIndex + rowStartTag.length,
                        oldText: '',
                        newText: `<w:trPr>${propertiesToAdd}</w:trPr>`
                    });
                }
            }
        }

        // Apply modifications in reverse order to preserve indices
        modifications.sort((a, b) => b.index - a.index);
        for (const mod of modifications) {
            processedTable = processedTable.substring(0, mod.index) +
                mod.newText +
                processedTable.substring(mod.index + mod.oldText.length);
        }

        return beforeTable + processedTable + afterTableStart.substring(tableMatch[0].length);
    }

    /**
     * Get the length of the page break XML
     */
    private getPageBreakLength(): number {
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'.length;
    }

    /**
     * Find all tables in the XML and return their positions and info
     */
    private findTables(xml: string): TableInfo[] {
        const tables: TableInfo[] = [];
        const tableRegex = /<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/g;

        let match;
        while ((match = tableRegex.exec(xml)) !== null) {
            const tableXml = match[0];
            const startIndex = match.index;
            const endIndex = startIndex + tableXml.length;
            const rowCount = this.countTableRows(tableXml);

            tables.push({
                startIndex,
                endIndex,
                rowCount,
                xml: tableXml
            });
        }

        return tables;
    }

    /**
     * Count the number of rows in a table
     */
    private countTableRows(tableXml: string): number {
        const rowRegex = /<w:tr[^>]*>/g;
        const matches = tableXml.match(rowRegex);
        return matches ? matches.length : 0;
    }

    /**
     * Determine if a page break should be added before a table
     */
    private shouldAddPageBreak(table: TableInfo, config: OperationConfig): boolean {
        const isLongTable = table.rowCount > this.LONG_TABLE_THRESHOLD;

        if (config.longTableSplit) {
            // Always add page break, regardless of table length
            return true;
        } else {
            // Only add page break for short tables (that fit in one page)
            // Don't add for long tables as it won't help
            return !isLongTable;
        }
    }

    /**
     * Insert a page break paragraph before the specified position
     */
    private insertPageBreak(xml: string, position: number): string {
        const pageBreakXml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

        return xml.substring(0, position) + pageBreakXml + xml.substring(position);
    }

    /**
     * Remove table header repetition from all tables in the document
     * This prevents headers from repeating on subsequent pages when table splits
     */
    private removeAllTableHeaderRepetition(xml: string): string {
        logger.info('🚀 Checking for table headers in document...');

        // First, let's check what table header properties exist
        const tblHeaderMatches = xml.match(/<w:tblHeader[^>]*\/?>/g);
        if (tblHeaderMatches) {
            logger.info(`Found ${tblHeaderMatches.length} <w:tblHeader> tags:`);
            tblHeaderMatches.slice(0, 3).forEach((match, i) => {
                logger.info(`  [${i}]: ${match}`);
            });
        } else {
            logger.info('No <w:tblHeader> tags found in document');
        }

        // Check for tblHeader in row properties (alternative location)
        const trPrHeaderMatches = xml.match(/<w:trPr[^>]*>[\s\S]*?<w:tblHeader[^>]*\/?>/g);
        if (trPrHeaderMatches) {
            logger.info(`Found ${trPrHeaderMatches.length} table headers in <w:trPr>:`);
            trPrHeaderMatches.slice(0, 3).forEach((match, i) => {
                logger.info(`  [${i}]: ${match.substring(0, 100)}...`);
            });
        }

        // Remove all <w:tblHeader/> and <w:tblHeader></w:tblHeader> tags
        let updatedXml = xml;

        // Pattern 1: Self-closing tag
        updatedXml = updatedXml.replace(/<w:tblHeader\s*\/>/g, '');

        // Pattern 2: Open-close tag
        updatedXml = updatedXml.replace(/<w:tblHeader><\/w:tblHeader>/g, '');

        // Pattern 3: Tag with attributes
        updatedXml = updatedXml.replace(/<w:tblHeader[^>]*\/>/g, '');

        // Count changes
        const changeCount = (xml.length - updatedXml.length);
        if (changeCount > 0) {
            logger.info(`✅ Removed table header properties (${changeCount} characters removed)`);
        } else {
            logger.info('ℹ️  No table header properties found to remove');
        }

        return updatedXml;
    }
}

export default TablePageBreaker;
