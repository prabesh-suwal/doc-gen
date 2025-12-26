// Test script for new template engine features
const TemplateProcessor = require('../dist/engine/TemplateProcessor.js').TemplateProcessor;
const fs = require('fs');

// Test data
const testData = {
    items: [
        { name: 'First Item', value: 100 },
        { name: 'Second Item', value: 200 },
        { name: 'Third Item', value: 300 },
        { name: 'Fourth Item', value: 400 },
        { name: 'Fifth Item', value: 500 }
    ],
    payments: [
        { month: 'January', amount: 5000, status: 'completed' },
        { month: 'February', amount: 15000, status: 'pending' },
        { month: 'March', amount: 150000, status: 'completed' },
        { month: 'April', amount: 500, status: 'pending' },
        { month: 'May', amount: 75000, status: 'completed' }
    ],
    loan: {
        principalAmount: 350000,
        interestRate: 0.095,
        agreementDate: '2025-09-15T10:30:00Z',
        emiAmount: 5875.50
    },
    borrower: {
        name: 'John Doe',
        monthlyIncome: 125000
    },
    testDate: '2025-12-26T16:40:00Z',
    testAmount: 12345.6789,
    testPercentage: 0.1234
};

const processor = new TemplateProcessor();

console.log('='.repeat(80));
console.log('TESTING SEQUENTIAL NUMBERING FORMATTERS');
console.log('='.repeat(80));

// Test 1: Numeric sequence
console.log('\n--- Test 1: Numeric Sequence (1, 2, 3...) ---');
const numericTemplate = '${#each items}${$index|seq:1}. ${this.name}\n${/each}';
const numericResult = processor.process(numericTemplate, testData);
console.log('Template:', numericTemplate);
console.log('Result:\n', numericResult.content);

// Test 2: Lowercase alphabetic
console.log('\n--- Test 2: Lowercase Alphabetic (a, b, c...) ---');
const alphaLowerTemplate = '${#each items}${$index|seq:a}) ${this.name}\n${/each}';
const alphaLowerResult = processor.process(alphaLowerTemplate, testData);
console.log('Template:', alphaLowerTemplate);
console.log('Result:\n', alphaLowerResult.content);

// Test 3: Uppercase alphabetic
console.log('\n--- Test 3: Uppercase Alphabetic (A, B, C...) ---');
const alphaUpperTemplate = '${#each items}${$index|seq:A}) ${this.name}\n${/each}';
const alphaUpperResult = processor.process(alphaUpperTemplate, testData);
console.log('Template:', alphaUpperTemplate);
console.log('Result:\n', alphaUpperResult.content);

// Test 4: Lowercase roman numerals
console.log('\n--- Test 4: Lowercase Roman Numerals (i, ii, iii...) ---');
const romanLowerTemplate = '${#each items}${$index|seq:i}. ${this.name}\n${/each}';
const romanLowerResult = processor.process(romanLowerTemplate, testData);
console.log('Template:', romanLowerTemplate);
console.log('Result:\n', romanLowerResult.content);

// Test 5: Uppercase roman numerals
console.log('\n--- Test 5: Uppercase Roman Numerals (I, II, III...) ---');
const romanUpperTemplate = '${#each items}${$index|seq:I}. ${this.name}\n${/each}';
const romanUpperResult = processor.process(romanUpperTemplate, testData);
console.log('Template:', romanUpperTemplate);
console.log('Result:\n', romanUpperResult.content);

console.log('\n' + '='.repeat(80));
console.log('TESTING COMPARISON OPERATORS & ELSEIF');
console.log('='.repeat(80));

// Test 6: Greater than operator
console.log('\n--- Test 6: Greater Than Operator (>) ---');
const gtTemplate = '${#each payments}${this.month}: ${#if this.amount > 100000}Large${#elseif this.amount > 10000}Medium${#else}Small${/if}\n${/each}';
const gtResult = processor.process(gtTemplate, testData);
console.log('Template:', gtTemplate);
console.log('Result:\n', gtResult.content);

// Test 7: Less than operator
console.log('\n--- Test 7: Less Than Operator (<) ---');
const ltTemplate = '${#each payments}${this.month}: ${#if this.amount < 1000}Very Small${#elseif this.amount < 10000}Small${#elseif this.amount < 100000}Medium${#else}Large${/if}\n${/each}';
const ltResult = processor.process(ltTemplate, testData);
console.log('Template:', ltTemplate);
console.log('Result:\n', ltResult.content);

// Test 8: Greater than or equal
console.log('\n--- Test 8: Greater Than or Equal (>=) ---');
const gteTemplate = 'Loan amount: ${#if loan.principalAmount >= 500000}High${#elseif loan.principalAmount >= 100000}Medium${#else}Low${/if}';
const gteResult = processor.process(gteTemplate, testData);
console.log('Template:', gteTemplate);
console.log('Result:', gteResult.content);

// Test 9: Less than or equal
console.log('\n--- Test 9: Less Than or Equal (<=) ---');
const lteTemplate = 'Interest Rate: ${#if loan.interestRate <= 0.05}Excellent${#elseif loan.interestRate <= 0.08}Good${#elseif loan.interestRate <= 0.1}Fair${#else}High${/if}';
const lteResult = processor.process(lteTemplate, testData);
console.log('Template:', lteTemplate);
console.log('Result:', lteResult.content);

console.log('\n' + '='.repeat(80));
console.log('TESTING FORMATTERS');
console.log('='.repeat(80));

// Test 10: Date formatter
console.log('\n--- Test 10: Date Formatter ---');
const dateTemplate = 'Agreement Date: ${loan.agreementDate|date:DD MMMM YYYY}';
const dateResult = processor.process(dateTemplate, testData);
console.log('Template:', dateTemplate);
console.log('Result:', dateResult.content);

// Test 11: Currency formatter with Rs.
console.log('\n--- Test 11: Currency Formatter (Rs.) ---');
const currencyTemplate = 'Monthly Income: ${borrower.monthlyIncome|currency:Rs. }';
const currencyResult = processor.process(currencyTemplate, testData);
console.log('Template:', currencyTemplate);
console.log('Result:', currencyResult.content);

// Test 12: Currency formatter with $
console.log('\n--- Test 12: Currency Formatter ($) ---');
const currencyUSDTemplate = 'EMI: ${loan.emiAmount|currency:$}';
const currencyUSDResult = processor.process(currencyUSDTemplate, testData);
console.log('Template:', currencyUSDTemplate);
console.log('Result:', currencyUSDResult.content);

// Test 13: Number formatter
console.log('\n--- Test 13: Number Formatter ---');
const numberTemplate = 'Precise Amount: ${testAmount|number:2}';
const numberResult = processor.process(numberTemplate, testData);
console.log('Template:', numberTemplate);
console.log('Result:', numberResult.content);

// Test 14: Percentage formatter
console.log('\n--- Test 14: Percentage Formatter ---');
const percentageTemplate = 'Interest Rate: ${loan.interestRate|percentage:2}';
const percentageResult = processor.process(percentageTemplate, testData);
console.log('Template:', percentageTemplate);
console.log('Result:', percentageResult.content);

// Test 15: Chained formatters
console.log('\n--- Test 15: Chained Formatters ---');
const chainedTemplate = 'Value: ${testPercentage|percentage:1|default:N/A}';
const chainedResult = processor.process(chainedTemplate, testData);
console.log('Template:', chainedTemplate);
console.log('Result:', chainedResult.content);

// Test 16: Combined - Sequential numbering with conditionals and formatters
console.log('\n' + '='.repeat(80));
console.log('COMBINED TEST - Sequential + Conditionals + Formatters');
console.log('='.repeat(80));
const combinedTemplate = `Payment Schedule:
\${#each payments}\${$index|seq:1}. \${this.month} - \${this.amount|currency:Rs. } - \${#if this.amount > 100000}High Priority\${#elseif this.amount > 10000}Medium Priority\${#else}Low Priority\${/if}
\${/each}`;
const combinedResult = processor.process(combinedTemplate, testData);
console.log('Template:', combinedTemplate);
console.log('Result:\n', combinedResult.content);

console.log('\n' + '='.repeat(80));
console.log('ALL TESTS COMPLETED');
console.log('='.repeat(80));
