// Test script for table page breaking feature
const TablePageBreaker = require('../dist/operations/TablePageBreaker.js').TablePageBreaker;

// Sample table XML for testing
const shortTableXml = `
<w:tbl>
  <w:tr><w:tc><w:p><w:r><w:t>Row 1</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 2</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 3</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 4</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>Row 5</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
`;

// Generate long table XML (50 rows)
let longTableXml = '<w:tbl>\n';
for (let i = 1; i <= 50; i++) {
    longTableXml += `  <w:tr><w:tc><w:p><w:r><w:t>Row ${i}</w:t></w:r></w:p></w:tc></w:tr>\n`;
}
longTableXml += '</w:tbl>';

const pageBreaker = new TablePageBreaker();

console.log('='.repeat(80));
console.log('TABLE PAGE BREAKING TESTS');
console.log('='.repeat(80));

// Test 1: Short table with tablePageBreaking=true, longTableSplit=true
console.log('\n--- Test 1: Short Table (5 rows) ---');
console.log('Config: tablePageBreaking=true, longTableSplit=true');
console.log('Expected: Page break added');

let result1 = pageBreaker.processDocument(shortTableXml, {
    tablePageBreaking: true,
    longTableSplit: true
});
const hasPageBreak1 = result1.includes('<w:br w:type="page"/>');
console.log('Result:', hasPageBreak1 ? '✓ Page break added' : '✗ No page break');
console.log('');

// Test 2: Short table with tablePageBreaking=true, longTableSplit=false
console.log('--- Test 2: Short Table (5 rows) ---');
console.log('Config: tablePageBreaking=true, longTableSplit=false');
console.log('Expected: Page break added (table fits in 1 page)');

let result2 = pageBreaker.processDocument(shortTableXml, {
    tablePageBreaking: true,
    longTableSplit: false
});
const hasPageBreak2 = result2.includes('<w:br w:type="page"/>');
console.log('Result:', hasPageBreak2 ? '✓ Page break added' : '✗ No page break');
console.log('');

// Test 3: Long table with tablePageBreaking=true, longTableSplit=true
console.log('--- Test 3: Long Table (50 rows) ---');
console.log('Config: tablePageBreaking=true, longTableSplit=true');
console.log('Expected: Page break added (allow split)');

let result3 = pageBreaker.processDocument(longTableXml, {
    tablePageBreaking: true,
    longTableSplit: true
});
const hasPageBreak3 = result3.includes('<w:br w:type="page"/>');
console.log('Result:', hasPageBreak3 ? '✓ Page break added' : '✗ No page break');
console.log('');

// Test 4: Long table with tablePageBreaking=true, longTableSplit=false
console.log('--- Test 4: Long Table (50 rows) ---');
console.log('Config: tablePageBreaking=true, longTableSplit=false');
console.log('Expected: NO page break (table too long, page break won\'t help)');

let result4 = pageBreaker.processDocument(longTableXml, {
    tablePageBreaking: true,
    longTableSplit: false
});
const hasPageBreak4 = result4.includes('<w:br w:type="page"/>');
console.log('Result:', hasPageBreak4 ? '✗ Page break added (unexpected)' : '✓ No page break');
console.log('');

// Test 5: Table with tablePageBreaking=false
console.log('--- Test 5: Any Table ---');
console.log('Config: tablePageBreaking=false');
console.log('Expected: NO page break');

let result5 = pageBreaker.processDocument(shortTableXml, {
    tablePageBreaking: false
});
const hasPageBreak5 = result5.includes('<w:br w:type="page"/>');
console.log('Result:', hasPageBreak5 ? '✗ Page break added (unexpected)' : '✓ No page break');
console.log('');

// Test 6: Multiple tables
console.log('--- Test 6: Multiple Tables ---');
console.log('Config: tablePageBreaking=true, longTableSplit=false');
console.log('Expected: Page break before short table, none before long table');

const multiTableXml = shortTableXml + '\n<w:p/>\n' + longTableXml;
let result6 = pageBreaker.processDocument(multiTableXml, {
    tablePageBreaking: true,
    longTableSplit: false
});
const pageBreakCount = (result6.match(/<w:br w:type="page"\/>/g) || []).length;
console.log(`Result: ${pageBreakCount} page break(s) found`);
console.log(pageBreakCount === 1 ? '✓ Correct (1 page break)' : '✗ Incorrect');
console.log('');

console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

const tests = [
    { name: 'Short table, split allowed', passed: hasPageBreak1 },
    { name: 'Short table, no long split', passed: hasPageBreak2 },
    { name: 'Long table, split allowed', passed: hasPageBreak3 },
    { name: 'Long table, no long split', passed: !hasPageBreak4 },
    { name: 'Page breaking disabled', passed: !hasPageBreak5 },
    { name: 'Multiple tables', passed: pageBreakCount === 1 }
];

const passedCount = tests.filter(t => t.passed).length;
const totalCount = tests.length;

console.log(`Tests passed: ${passedCount}/${totalCount}`);
tests.forEach(test => {
    console.log(`  ${test.passed ? '✓' : '✗'} ${test.name}`);
});

console.log('\n' + '='.repeat(80));
if (passedCount === totalCount) {
    console.log('✓ ALL TESTS PASSED');
} else {
    console.log('✗ SOME TESTS FAILED');
}
console.log('='.repeat(80));
