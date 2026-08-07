//prisama/scripts/combine.js
const fs = require('fs');
const path = require('path');

const header = `// Generated from prisma/models/*.prisma
// Keep the model definitions in separate files for easier edits.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

`;

const modelsDir = path.join(__dirname, '../models');
const outputDir = path.join(__dirname, '../generated');
const outputFile = path.join(outputDir, 'schema.prisma');

try {
  // Read all model files
  const modelFiles = fs.readdirSync(modelsDir)
    .filter(f => f.endsWith('.prisma'))
    .sort();

  if (modelFiles.length === 0) {
    console.error('❌ No model files found in', modelsDir);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let combined = header;
  let modelCount = 0;

  for (const file of modelFiles) {
    const content = fs.readFileSync(path.join(modelsDir, file), 'utf8');
    combined += content + '\n';
    modelCount++;
    console.log(`  📄 Added ${file}`);
  }

  fs.writeFileSync(outputFile, combined);
  console.log(`\n✅ Combined ${modelCount} model files into schema.prisma`);
  console.log(`📁 Output: ${outputFile}`);
} catch (error) {
  console.error('❌ Error combining schemas:', error.message);
  process.exit(1);
}
