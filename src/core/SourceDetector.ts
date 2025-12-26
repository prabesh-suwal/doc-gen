import PizZip from 'pizzip';
import logger from '../utils/Logger.js';

export type TemplateSource = 'microsoft-word' | 'libreoffice' | 'google-docs' | 'unknown';

export interface SourceDetectionResult {
    source: TemplateSource;
    application: string | null;
    version: string | null;
    confidence: 'high' | 'medium' | 'low';
    needsNormalization: boolean;
    details: Record<string, string>;
}

/**
 * SourceDetector - Detects the application that created the DOCX template
 */
export class SourceDetector {
    /**
     * Detect the source application of a DOCX template
     */
    detect(zip: PizZip): SourceDetectionResult {
        logger.debug('Detecting template source...');

        const appInfo = this.extractAppInfo(zip);
        const coreInfo = this.extractCoreInfo(zip);

        // Check for Google Docs
        if (this.isGoogleDocs(appInfo, coreInfo)) {
            logger.info('Detected Google Docs template');
            return {
                source: 'google-docs',
                application: 'Google Docs',
                version: null,
                confidence: 'high',
                needsNormalization: true,
                details: { ...appInfo, ...coreInfo },
            };
        }

        // Check for LibreOffice
        if (this.isLibreOffice(appInfo)) {
            logger.info(`Detected LibreOffice template: ${appInfo.application}`);
            return {
                source: 'libreoffice',
                application: appInfo.application || 'LibreOffice',
                version: appInfo.appVersion || null,
                confidence: 'high',
                needsNormalization: true,
                details: { ...appInfo, ...coreInfo },
            };
        }

        // Check for Microsoft Word
        if (this.isMicrosoftWord(appInfo)) {
            logger.info(`Detected Microsoft Word template: ${appInfo.application}`);
            return {
                source: 'microsoft-word',
                application: appInfo.application || 'Microsoft Word',
                version: appInfo.appVersion || null,
                confidence: 'high',
                needsNormalization: false,
                details: { ...appInfo, ...coreInfo },
            };
        }

        // Unknown source
        logger.warn('Could not determine template source');
        return {
            source: 'unknown',
            application: appInfo.application || null,
            version: appInfo.appVersion || null,
            confidence: 'low',
            needsNormalization: true, // Normalize unknown sources for safety
            details: { ...appInfo, ...coreInfo },
        };
    }

    /**
     * Check if template markers are properly formed (not split across XML elements)
     */
    checkTemplateMarkers(zip: PizZip): { valid: boolean; issues: string[] } {
        const issues: string[] = [];
        const documentXml = zip.file('word/document.xml')?.asText() || '';

        // Check for split markers (e.g., {d. split across <w:t> elements)
        const splitPattern = /<w:t[^>]*>\{[^}]*<\/w:t>.*?<w:t[^>]*>[^{]*\}/gs;
        const splitMatches = documentXml.match(splitPattern);
        if (splitMatches) {
            issues.push(`Found ${splitMatches.length} potentially split template markers`);
        }

        // Check for incomplete markers
        const openBraces = (documentXml.match(/\{/g) || []).length;
        const closeBraces = (documentXml.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
            issues.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
        }

        return {
            valid: issues.length === 0,
            issues,
        };
    }

    /**
     * Extract application info from docProps/app.xml
     */
    private extractAppInfo(zip: PizZip): Record<string, string> {
        const appXml = zip.file('docProps/app.xml')?.asText() || '';
        const result: Record<string, string> = {};

        // Extract Application name
        const appMatch = appXml.match(/<Application>([^<]+)<\/Application>/);
        if (appMatch) {
            result.application = appMatch[1];
        }

        // Extract AppVersion
        const versionMatch = appXml.match(/<AppVersion>([^<]+)<\/AppVersion>/);
        if (versionMatch) {
            result.appVersion = versionMatch[1];
        }

        // Extract Company
        const companyMatch = appXml.match(/<Company>([^<]*)<\/Company>/);
        if (companyMatch) {
            result.company = companyMatch[1];
        }

        return result;
    }

    /**
     * Extract core info from docProps/core.xml
     */
    private extractCoreInfo(zip: PizZip): Record<string, string> {
        const coreXml = zip.file('docProps/core.xml')?.asText() || '';
        const result: Record<string, string> = {};

        // Extract creator
        const creatorMatch = coreXml.match(/<dc:creator>([^<]*)<\/dc:creator>/);
        if (creatorMatch) {
            result.creator = creatorMatch[1];
        }

        // Extract lastModifiedBy
        const modifiedByMatch = coreXml.match(/<cp:lastModifiedBy>([^<]*)<\/cp:lastModifiedBy>/);
        if (modifiedByMatch) {
            result.lastModifiedBy = modifiedByMatch[1];
        }

        return result;
    }

    /**
     * Check if the template was created with Google Docs
     */
    private isGoogleDocs(appInfo: Record<string, string>, coreInfo: Record<string, string>): boolean {
        // Google Docs typically doesn't include app.xml or has minimal info
        // but the creator might indicate Google
        if (coreInfo.creator?.toLowerCase().includes('google')) {
            return true;
        }

        // Check for Google Docs specific patterns in the document
        // Note: This is a heuristic as Google Docs doesn't reliably identify itself
        if (!appInfo.application && !appInfo.appVersion) {
            // Extra heuristic: Google Docs often has minimal metadata
            return Object.keys(appInfo).length === 0;
        }

        return false;
    }

    /**
     * Check if the template was created with LibreOffice
     */
    private isLibreOffice(appInfo: Record<string, string>): boolean {
        const app = appInfo.application?.toLowerCase() || '';
        return (
            app.includes('libreoffice') ||
            app.includes('openoffice') ||
            app.includes('libre office') ||
            app.includes('open office')
        );
    }

    /**
     * Check if the template was created with Microsoft Word
     */
    private isMicrosoftWord(appInfo: Record<string, string>): boolean {
        const app = appInfo.application?.toLowerCase() || '';
        return app.includes('microsoft') || app.includes('word');
    }
}

export default SourceDetector;
