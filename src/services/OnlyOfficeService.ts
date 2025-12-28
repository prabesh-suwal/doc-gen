import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/Logger.js';
import PizZip from 'pizzip';

/**
 * OnlyOffice Service - Manages document lifecycle for template editing
 */
export class OnlyOfficeService {
    private editingPath: string;

    constructor() {
        this.editingPath = config.editingPath;
    }

    /**
     * Initialize the editing directory
     */
    async initialize(): Promise<void> {
        await fs.mkdir(this.editingPath, { recursive: true });
        logger.info(`OnlyOffice editing directory initialized: ${this.editingPath}`);
    }

    /**
     * Create a new blank document for editing
     */
    async createBlankDocument(): Promise<{ documentId: string; filePath: string }> {
        const documentId = uuidv4();
        const filePath = path.join(this.editingPath, `${documentId}.docx`);

        // Create a minimal blank DOCX file
        const blankContent = await this.generateBlankDocx();
        await fs.writeFile(filePath, blankContent);

        logger.info(`Created blank document: ${documentId}`);
        return { documentId, filePath };
    }

    /**
     * Generate a minimal blank DOCX file
     */
    private async generateBlankDocx(): Promise<Buffer> {
        // Create a minimal DOCX structure
        const zip = new PizZip();

        // [Content_Types].xml
        zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

        // _rels/.rels
        zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

        // word/_rels/document.xml.rels
        zip.folder('word')!.folder('_rels')!.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

        // word/document.xml
        zip.folder('word')!.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        <w:p>
            <w:r>
                <w:t>Start creating your template here...</w:t>
            </w:r>
        </w:p>
    </w:body>
</w:document>`);

        return zip.generate({ type: 'nodebuffer' });
    }

    /**
     * Get editor configuration for OnlyOffice
     */
    getEditorConfig(documentId: string, user: { id: string; name: string }): any {
        return {
            documentType: 'word',
            document: {
                fileType: 'docx',
                key: documentId,
                title: 'New Template.docx',
                url: `${config.server.baseUrl}/api/editor/download/${documentId}`,
                permissions: {
                    edit: true,
                    download: true,
                    print: false,
                },
            },
            editorConfig: {
                mode: 'edit',
                callbackUrl: `${config.onlyOffice.callbackUrl}/${documentId}`,
                lang: 'en',
                user: {
                    id: user.id,
                    name: user.name,
                },
                customization: {
                    forcesave: true,
                    autosave: true,
                    comments: false,
                    chat: false,
                    compactHeader: false,
                    help: false,
                    hideRightMenu: false,
                },
            },
            height: '100%',
            width: '100%',
        };
    }

    /**
     * Get document file path
     */
    getDocumentPath(documentId: string): string {
        return path.join(this.editingPath, `${documentId}.docx`);
    }

    /**
     * Check if document exists
     */
    async documentExists(documentId: string): Promise<boolean> {
        try {
            await fs.access(this.getDocumentPath(documentId));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get document buffer
     */
    async getDocument(documentId: string): Promise<Buffer> {
        const filePath = this.getDocumentPath(documentId);
        return await fs.readFile(filePath);
    }

    /**
     * Save document from OnlyOffice callback
     */
    async saveDocumentFromUrl(documentId: string, downloadUrl: string): Promise<void> {
        const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const filePath = this.getDocumentPath(documentId);
        await fs.writeFile(filePath, buffer);
        logger.info(`Document saved from OnlyOffice: ${documentId}`);
    }

    /**
     * Delete editing document
     */
    async deleteDocument(documentId: string): Promise<void> {
        const filePath = this.getDocumentPath(documentId);
        try {
            await fs.unlink(filePath);
            logger.info(`Editing document deleted: ${documentId}`);
        } catch (error) {
            logger.warn(`Failed to delete editing document ${documentId}:`, error);
        }
    }

    /**
     * Clean up old editing files (older than 24 hours)
     */
    async cleanupOldFiles(): Promise<void> {
        try {
            const files = await fs.readdir(this.editingPath);
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours

            for (const file of files) {
                const filePath = path.join(this.editingPath, file);
                const stats = await fs.stat(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    await fs.unlink(filePath);
                    logger.info(`Cleaned up old editing file: ${file}`);
                }
            }
        } catch (error) {
            logger.error('Error cleaning up old editing files:', error);
        }
    }
}

export default new OnlyOfficeService();
