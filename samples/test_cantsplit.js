// Test script for cantSplit + keepNext fix
const TablePageBreaker = require('../dist/operations/TablePageBreaker.js').TablePageBreaker;

// Sample table XML (short table)
const shortTableXml = `
<w:p><w:r><w:t>Some content before table</w:t></w:r></w:p>
<w:tbl>
  <w:tr><w:tc><w:p><w:r><w:t>Row 1</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 2</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 3</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 4</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 5</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
`;

const pageBreaker = new TablePageBreaker();

console.log('='.repeat(80));
console.log('TESTING KEEPNEXT FIX');
console.log('='.repeat(80));

console.log('\n--- Processing table with tablePageBreaking=true, longTableSplit=false ---\n');

const result = pageBreaker.processDocument(shortTableXml, {
    tablePageBreaking: true,
    longTableSplit: false
});

// Check for page break
const hasPageBreak = result.includes('<w:br w:type="page"/>');
console.log(`✓ Page break: ${hasPageBreak ? 'ADDED' : 'MISSING'}`);

// Check for cantSplit and keepNext
const cantSplitCount = (result.match(/<w:cantSplit\/>/g) || []).length;
const keepNextCount = (result.match(/<w:keepNext\/>/g) || []).length;
const rowCount = 5;

console.log(`✓ cantSplit properties: ${cantSplitCount} (expected: ${rowCount})`);
console.log(`✓ keepNext properties: ${keepNextCount} (expected: ${rowCount - 1})`);

console.log('\n' + '='.repeat(80));
console.log('EXPECTED BEHAVIOR:');
console.log('='.repeat(80));
console.log('Each row (1-5) should have: <w:trPr><w:cantSplit/><w:keepNext/></w:trPr>');
console.log('EXCEPT the last row (5) which should only have: <w:trPr><w:cantSplit/></w:trPr>');
console.log('');
console.log('This ensures:');
console.log('  - cantSplit: Each row stays together (no internal row splitting)');
console.log('  - keepNext: Each row stays with the next row (keeps table together)');
console.log('  - Last row has no keepNext (nothing to keep with after it)');

console.log('\n' + '='.repeat(80));
console.log('SAMPLE OUTPUT:');
console.log('='.repeat(80));

// Extract table part for better readability
const tableStart = result.indexOf('<w:tbl>');
const tableEnd = result.indexOf('</w:tbl>') + '</w:tbl>'.length;
const tableOnly = result.substring(tableStart, tableEnd);

// Show formatted output
const lines = tableOnly.split('\n');
lines.forEach((line, i) => {
    if (i < 15) { // Show first 15 lines
        console.log(line);
    }
});
console.log('...');

console.log('\n' + '='.repeat(80));
if (cantSplitCount === rowCount && keepNextCount === rowCount - 1) {
    console.log('✅ SUCCESS: Properties correctly added!');
    console.log('The table will now stay together on one page.');
} else {
    console.log('❌ ISSUE: Property counts don\'t match expected values');
}
console.log('='.repeat(80));
