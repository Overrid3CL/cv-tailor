#!/usr/bin/env node
// match.js — CLI: analiza una oferta laboral contra el CV (score ATS-like).
//
// Usage:
//   node match.js --job oferta.txt                  # contra el base (sin variant)
//   node match.js --job oferta.txt --variant tailored
//   node match.js --job oferta.txt --variant all    # rankea todas las variants
//   node match.js --job oferta.txt --lang en       # forzar idioma del CV
//
// Sin --lang, el idioma del CV a evaluar se detecta del texto de la oferta
// (una oferta en inglés se compara contra la versión en inglés del CV).
//
// 100% determinista (sin LLM): keywords por frecuencia/siglas/skills del CV y
// score de cobertura ponderada. Ver lib/match.js.

const fs = require("fs");
const path = require("path");
const { matchJob, rankVariants, detectLang } = require("./lib/match");
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

const jobPath = flag("--job");
if (!jobPath) {
  fail("Usage: node match.js --job <oferta.txt> [--variant <name|all>] [--lang <lang>]");
}
if (!fs.existsSync(jobPath)) fail(`File not found: ${jobPath}`);
const jobText = fs.readFileSync(jobPath, "utf-8");

if (!fs.existsSync(config.basePath())) {
  fail(`base.json not found in ${config.DATA_DIR}.\nCopy examples/base.json there, or set CV_DIR to your CV data folder.`);
}
const base = config.loadBase();
const baseCheck = validateBase(base);
if (!baseCheck.valid) fail(`Validation failed (base.json):\n  - ${baseCheck.errors.join("\n  - ")}`);

const langFlag = flag("--lang");
if (langFlag && !supportedLangs(base).includes(langFlag)) {
  fail(`Unsupported --lang "${langFlag}". Use: ${supportedLangs(base).join(", ")}`);
}
const lang = langFlag || detectLang(jobText, supportedLangs(base)) || supportedLangs(base)[0];

const variantArg = flag("--variant");

function readVariantFile(name) {
  const p = path.join(config.variantsDir(), `${name}.json`);
  if (!fs.existsSync(p)) fail(`Variant not found: ${name}`);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function printReport(report, title) {
  console.log(`\n${title}`);
  console.log(`Score: ${report.score}/100  (${report.matched.length}/${report.keywords} keywords covered)`);
  if (report.matched.length) {
    console.log("\n✓ Covered:");
    for (const m of report.matched.slice(0, 15)) {
      console.log(`  - ${m.keyword}  (weight ${m.weight}; in: ${m.where.join(", ")})`);
    }
  }
  if (report.missing.length) {
    console.log("\n✗ Missing (ordered by weight in the posting):");
    for (const m of report.missing.slice(0, 15)) {
      console.log(`  - ${m.keyword}  (weight ${m.weight})`);
    }
  }
}

if (variantArg === "all") {
  const variantsDir = config.variantsDir();
  const names = fs.existsSync(variantsDir)
    ? fs.readdirSync(variantsDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
    : [];
  if (!names.length) fail("No variants in variants/.");

  const variantsMap = Object.fromEntries(names.map((n) => [n, readVariantFile(n)]));
  const ranking = rankVariants(jobText, base, variantsMap, lang);

  console.log(`Variant ranking against the job posting [${lang}]:`);
  ranking.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} — ${r.score}/100${r.missingTop.length ? `  (missing: ${r.missingTop.join(", ")})` : ""}`);
  });

  const best = ranking[0];
  printReport(matchJob(jobText, base, variantsMap[best.name], lang), `Best variant detail: ${best.name}`);
} else {
  const variant = variantArg ? readVariantFile(variantArg) : {};
  const title = variantArg ? `Match for variant "${variantArg}" [${lang}]` : `Match for the base CV [${lang}]`;
  printReport(matchJob(jobText, base, variant, lang), title);
}
