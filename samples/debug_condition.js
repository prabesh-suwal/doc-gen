/**
 * Detailed debug test
 */

async function detailedDebug() {
    const { TemplateProcessor } = await import('../dist/engine/TemplateProcessor.js');

    const processor = new TemplateProcessor();

    // Simplified data matching test.json structure
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

    // Simplified template matching the structure
    const template = `\${#each collateral}
COLLATERAL TYPE: \${this.type}
OWNER TYPE: \${this.collateralOwner.type}
\${#if this.collateralOwner.type == 'Individual'}
=== INSIDE IF BLOCK ===
Owner Type Inside: \${this.collateralOwner.type}
Collateral Type: \${this.type}
=== END IF BLOCK ===
\${/if}
\${/each}`;

    console.log('=== Template ===');
    console.log(template);

    console.log('\n=== Data ===');
    console.log(JSON.stringify(data, null, 2));

    const result = processor.process(template, data);

    console.log('\n=== Result ===');
    console.log(result.content);

    console.log('\n=== Warnings ===');
    result.warnings.forEach(w => console.log(' -', w));
}

detailedDebug().catch(console.error);
