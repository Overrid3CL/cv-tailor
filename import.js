#!/usr/bin/env node
// import.js — importa un CV en formato JSON Resume (jsonresume.org) a base.json.
//
// Usage:
//   node import.js <ruta-al-jsonresume.json>            # escribe ./base.json
//   node import.js resume.json --out mi-base.json       # a otra ruta
//   node import.js resume.json --stdout                 # imprime sin escribir
//
// El resultado se valida contra el schema de base antes de escribir.

const fs = require("fs");
const { jsonResumeToBase } = require("./lib/jsonresume");
const { validateBase } = require("./lib/validate");
const config = require("./lib/config");

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!input) {
  fail(
    "Usage: node import.js <jsonresume.json> [--out base.json] [--stdout]\n" +
      "Converts a JSON Resume CV (https://jsonresume.org) into base.json.",
  );
}
if (!fs.existsSync(input)) fail(`File not found: ${input}`);

let resume;
try {
  resume = JSON.parse(fs.readFileSync(input, "utf-8"));
} catch (err) {
  fail(`Could not parse ${input} as JSON: ${err.message}`);
}

let base;
try {
  base = jsonResumeToBase(resume);
} catch (err) {
  fail(`Conversion failed: ${err.message}`);
}

const check = validateBase(base);
if (!check.valid) {
  fail(`The generated base is not valid (check the input JSON Resume):\n  - ${check.errors.join("\n  - ")}`);
}

const json = JSON.stringify(base, null, 2) + "\n";

if (args.includes("--stdout")) {
  process.stdout.write(json);
  process.exit(0);
}

const outIdx = args.indexOf("--out");
const outPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : config.basePath();
fs.writeFileSync(outPath, json, "utf-8");
console.log(`✓ base.json written to: ${outPath}`);
console.log(`  ${base.experience.length} experience entries, ${Object.keys(base.skills).length} skills, ${base.education.length} education entries.`);
