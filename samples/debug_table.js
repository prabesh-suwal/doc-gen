/**
 * Debug table row extraction
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

async function debugTableRows() {
    const { TemplateProcessor } = await import('../dist/engine/TemplateProcessor.js');

    const templatePath = path.join(__dirname, '../table_template.docx');
    const templateBuffer = fs.readFileSync(templatePath);
    const zip = new PizZip(templateBuffer);
    const documentXml = zip.file('word/document.xml').asText();

    // Find the loop
    const eachStart = documentXml.indexOf('${#each fees}');
    const eachEnd = documentXml.indexOf('${/each}');

    console.log('Loop start at:', eachStart);
    console.log('Loop end at:', eachEnd);

    // Find the table row containing ${#each}
    const beforeEach = documentXml.substring(0, eachStart);
    const rowStartBefore = beforeEach.lastIndexOf('<w:tr');
    console.log('\nRow containing #each starts at:', rowStartBefore);

    // Content before the loop tag
    const beforeLoopContent = documentXml.substring(0, eachStart);
    console.log('\nLast 200 chars before ${#each}:');
    console.log(beforeLoopContent.slice(-200).replace(/<[^>]+>/g, ' ').trim());

    // Content between ${#each} and ${/each}
    const loopContent = documentXml.substring(eachStart + '${#each fees}'.length, eachEnd);
    console.log('\nLoop content text:');
    console.log(loopContent.replace(/<[^>]+>/g, ' ').trim());

    // Count rows in loop content
    const rowMatches = loopContent.match(/<w:tr/g) || [];
    console.log('\nNumber of <w:tr in loop content:', rowMatches.length);

    // Extract each row manually
    console.log('\n=== Rows in loop area ===');
    let fullArea = beforeLoopContent.substring(rowStartBefore) + loopContent + documentXml.substring(eachEnd);
    let pos = 0;
    let rowNum = 0;
    while (pos < fullArea.length && rowNum < 5) {
        const rowStart = fullArea.indexOf('<w:tr', pos);
        if (rowStart === -1) break;
        const rowEnd = fullArea.indexOf('</w:tr>', rowStart);
        if (rowEnd === -1) break;

        const row = fullArea.substring(rowStart, rowEnd + 7);
        const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        rowNum++;
        console.log(`Row ${rowNum}: ${text}`);

        pos = rowEnd + 7;
    }
}

debugTableRows().catch(console.error);
