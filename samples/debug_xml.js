/**
 * Trace with actual XML content
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

async function traceWithXml() {
    const { TemplateProcessor } = await import('../dist/engine/TemplateProcessor.js');

    const data = {
        collateral: [
            {
                type: "Land",
                collateralOwner: {
                    type: "Individual",
                    name: "Shiva"
                }
            }
        ]
    };

    // Get the second #each collateral block from test.docx
    const templatePath = path.join(__dirname, 'test.docx');
    const templateBuffer = fs.readFileSync(templatePath);
    const zip = new PizZip(templateBuffer);
    const documentXml = zip.file('word/document.xml').asText();

    // Find and extract second block
    const start1 = documentXml.indexOf('${#each collateral}');
    const afterFirst = documentXml.indexOf('${/each}', start1) + 8;
    const start2 = documentXml.indexOf('${#each collateral}', afterFirst);
    const end2 = documentXml.indexOf('${/each}', start2) + 8;
    const rawBlock = documentXml.substring(start2, end2);

    console.log('=== Raw Block Text (no XML tags) ===');
    console.log(rawBlock.replace(/<[^>]+>/g, '').trim());

    // Process just this block
    const processor = new TemplateProcessor();
    const result = processor.process(rawBlock, data);

    console.log('\n=== Result Text (no XML tags) ===');
    console.log(result.content.replace(/<[^>]+>/g, '').trim());

    console.log('\n=== Warnings ===');
    result.warnings.forEach(w => console.log(' -', w));

    // Now let's find what ${#if...} blocks are in the repaired content
    // before conditions are evaluated
    console.log('\n=== Checking XmlRepair output ===');
    const { XmlRepair } = await import('../dist/engine/XmlRepair.js');
    const xmlRepair = new XmlRepair();
    const repaired = xmlRepair.repair(rawBlock);

    // Find all condition patterns
    const conditions = repaired.match(/\$\{#if[^}]*\}/g) || [];
    console.log('Conditions found:', conditions);

    // Extract condition content and check it
    const match = repaired.match(/\$\{#if\s+([^}]+)\}/);
    if (match) {
        console.log('\nCondition expression:', match[1]);

        // Check if there's any hidden characters
        console.log('Expression bytes:', Buffer.from(match[1]).toString('hex'));
    }
}

traceWithXml().catch(console.error);
