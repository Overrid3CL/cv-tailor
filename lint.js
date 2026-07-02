#!/usr/bin/env node
// lint.js — CLI: revisa el CV contra buenas prácticas medibles (sin LLM).
//
// Usage:
//   node lint.js                          # base sin variant, idioma es
//   node lint.js --variant tailored
//   node lint.js --variant all --lang all
//
// Reglas: largo de bullets/summary, métricas, arranques débiles, repetición.
// Ver lib/lint.js. Para la crítica cualitativa usa el prompt MCP review_cv.

const fs = require("fs");
const path = require("path");
const { lintCV } = require("./lib/lint");
const { supportedLangs } = require("./template");
const { validateBase } = require("./lib/validate");
const config = require("./lib/config");

const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(config.basePath())) {
  fail(`base.json not found in ${config.DATA_DIR}.\nCopy examples/base.json there, or set CV_DIR to your CV data folder.`);
}
const base = config.loadBase();
const baseCheck = validateBase(base);
if (!baseCheck.valid) fail(`Validation failed (base.json):\n  - ${baseCheck.errors.join("\n  - ")}`);

const langArg = flag("--lang", "es");
const langs = langArg === "all" ? supportedLangs(base) : [langArg];
for (const l of langs) {
  if (!supportedLangs(base).includes(l)) fail(`Unsupported --lang "${l}". Use: ${supportedLangs(base).join(", ")} | all`);
}

const variantArg = flag("--variant");
let targets; // [{ name, variant }]
if (variantArg === "all") {
  const dir = config.variantsDir();
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
    : [];
  targets = names.map((n) => ({ name: n, variant: JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), "utf-8")) }));
} else if (variantArg) {
  const p = path.join(config.variantsDir(), `${variantArg}.json`);
  if (!fs.existsSync(p)) fail(`Variant not found: ${variantArg}`);
  targets = [{ name: variantArg, variant: JSON.parse(fs.readFileSync(p, "utf-8")) }];
} else {
  targets = [{ name: "(base)", variant: {} }];
}

const MARK = { warn: "✗", info: "·" };
let warns = 0;

for (const { name, variant } of targets) {
  for (const lang of langs) {
    const { findings } = lintCV(base, variant, lang);
    console.log(`\n${name} [${lang}] — ${findings.length} finding(s)`);
    for (const f of findings) {
      if (f.severity === "warn") warns++;
      console.log(`  ${MARK[f.severity]} [${f.severity}] ${f.where}: ${f.message}`);
    }
    if (!findings.length) console.log("  ✓ No findings.");
  }
}

console.log(`\n${warns} warning(s) total.`);
