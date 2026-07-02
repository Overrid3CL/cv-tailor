#!/usr/bin/env node
// validate.js — valida base.json y todas las variants contra los schemas
// y los chequeos semánticos. Uso: node validate.js  (o npm run validate)

const { validateAll } = require("./lib/store");

const report = validateAll();

for (const [file, res] of Object.entries(report.files)) {
  if (res.valid) {
    console.log(`✓ ${file}`);
  } else {
    console.error(`✗ ${file}`);
    for (const err of res.errors) console.error(`    ${err}`);
  }
}

if (!report.valid) {
  console.error("\nValidation failed.");
  process.exit(1);
}
console.log("\nAll valid.");
