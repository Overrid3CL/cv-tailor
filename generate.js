#!/usr/bin/env node
// generate.js — CLI para generar CVs y cartas de presentación.
//
// Usage:
//   node generate.js --variant tailored
//   node generate.js --variant all --lang all
//   node generate.js --variant acme,globex,initech   # lote: un solo Chromium
//   node generate.js --variant tailored --lang en --doc cover
//   node generate.js --variant tailored --doc all --lang all --format all
//   node generate.js --variant tailored --template modern
//   node generate.js --variant tailored --format html        # preview sin Chrome
//   node generate.js --variant tailored --lang en --out ~/Desktop/cv.pdf
//   node generate.js --list
//
// --variant: nombre de variant, lista separada por comas, o "all" para todas.
// --lang:    es (default) | en | all (todos los idiomas de base.labels).
// --doc:     cv (default) | cover | all.
// --format:  lista separada por comas de pdf,md,html,docx o "all". Default: pdf,md.
// --template: tema visual (ver templates/). Default: classic.
//
// PDF uses the system's Chrome/Edge/Chromium (nothing is downloaded): set
// PUPPETEER_EXECUTABLE_PATH for a custom location and PUPPETEER_LAUNCH_ARGS
// for extra flags (e.g. "--no-sandbox" in Docker/CI).
// PDF es el único formato que necesita Chrome; md/html/docx no lo lanzan.

const fs = require("fs");
const path = require("path");
const {
  supportedLangs,
  escapeHtml,
  buildData,
  buildCoverLetter,
  renderHTML,
  renderMarkdown,
  renderCoverLetterHTML,
  renderCoverLetterMarkdown,
} = require("./template");
const { renderCVDocx, renderCoverLetterDocx } = require("./lib/docx");
const { themeNames, DEFAULT_THEME } = require("./templates");
const { validateBase, validateVariant } = require("./lib/validate");
const config = require("./lib/config");

const SUPPORTED_DOCS = ["cv", "cover"];
const SUPPORTED_FORMATS = ["pdf", "md", "html", "docx"];
const DEFAULT_FORMATS = ["pdf", "md"];
const VARIANTS_DIR = config.variantsDir();
const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function listVariantFiles() {
  return fs
    .readdirSync(VARIANTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// --list
if (args.includes("--list")) {
  const names = listVariantFiles();
  if (!names.length) console.log("No variants found in /variants");
  else {
    console.log("Available variants:");
    names.forEach((n) => console.log(`  - ${n}`));
  }
  process.exit(0);
}

// --variant (required; "all" expands to every variant; also accepts a
// comma-separated list — one run shares a single Chromium for the whole batch)
const variantArg = flag("--variant");
if (!variantArg) {
  fail(
    "Usage: node generate.js --variant <name|a,b,c|all> [--lang es|en|all] [--doc cv|cover|all] [--format pdf,md,html,docx|all] [--template <theme>] [--out <path>]\n" +
      "       node generate.js --list",
  );
}
const variantNames =
  variantArg === "all"
    ? listVariantFiles()
    : [...new Set(variantArg.split(",").map((v) => v.trim()).filter(Boolean))];
if (!variantNames.length) fail("No variants to generate.");
for (const n of variantNames) {
  if (!fs.existsSync(path.join(VARIANTS_DIR, `${n}.json`))) fail(`Variant not found: ${n}`);
}

// Load + validate base.json from the data directory (cwd or CV_DIR).
if (!fs.existsSync(config.basePath())) {
  fail(`base.json not found in ${config.DATA_DIR}.\nCopy examples/base.json there, or set CV_DIR to your CV data folder.`);
}
const base = config.loadBase();
const baseCheck = validateBase(base);
if (!baseCheck.valid) fail(`Validation failed (base.json):\n  - ${baseCheck.errors.join("\n  - ")}`);
const SUPPORTED_LANGS = supportedLangs(base);

// --lang
const langArg = flag("--lang", "es");
const langs = langArg === "all" ? SUPPORTED_LANGS : [langArg];
for (const l of langs) {
  if (!SUPPORTED_LANGS.includes(l)) fail(`Unsupported --lang "${l}". Use: ${SUPPORTED_LANGS.join(", ")} | all`);
}

// --doc
const docArg = flag("--doc", "cv");
if (![...SUPPORTED_DOCS, "all"].includes(docArg)) {
  fail(`Unsupported --doc "${docArg}". Use: ${SUPPORTED_DOCS.join(", ")} | all`);
}

// --format (comma-separated list, or "all")
const formatArg = flag("--format", DEFAULT_FORMATS.join(","));
const formats =
  formatArg === "all" ? SUPPORTED_FORMATS : formatArg.split(",").map((f) => f.trim()).filter(Boolean);
for (const f of formats) {
  if (!SUPPORTED_FORMATS.includes(f)) fail(`Unsupported --format "${f}". Use: ${SUPPORTED_FORMATS.join(", ")} | all`);
}

// --template
const themeArg = flag("--template", DEFAULT_THEME);
if (!themeNames().includes(themeArg)) {
  fail(`Unsupported --template "${themeArg}". Use: ${themeNames().join(", ")}`);
}

// --out (single variant, single language, single doc, single format)
const outArg = flag("--out");
if (outArg && (variantNames.length > 1 || langs.length > 1 || docArg === "all" || formats.length > 1)) {
  fail("--out only combines with a single variant, language, doc and format (it points to one file).");
}

function needsBrowser() {
  return formats.includes("pdf");
}

// Localiza un navegador Chromium para el PDF (puppeteer-core no descarga
// ninguno): PUPPETEER_EXECUTABLE_PATH manda; si no, se busca Chrome/Edge/
// Chromium del sistema en sus rutas estándar por plataforma.
function findBrowser() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    if (!fs.existsSync(envPath)) fail(`PUPPETEER_EXECUTABLE_PATH does not exist: ${envPath}`);
    return envPath;
  }

  const home = process.env.LOCALAPPDATA || "";
  const candidates = {
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      home && path.join(home, "Google\\Chrome\\Application\\chrome.exe"),
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    linux: [
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
      "/snap/bin/chromium",
    ],
  }[process.platform] || [];

  const found = candidates.filter(Boolean).find((p) => fs.existsSync(p));
  if (found) return found;

  return fail(
    "PDF needs a Chromium-based browser and none was found.\n" +
      "  - If you have Chrome/Edge/Chromium in a custom location: set PUPPETEER_EXECUTABLE_PATH to its executable.\n" +
      "  - Otherwise install Google Chrome (or Microsoft Edge) and retry.\n" +
      "  - No browser? Every other format works without one: --format md,html,docx",
  );
}

function outPathFor(variant, doc, lang, ext) {
  if (outArg) return outArg.replace(/\.[^.]+$/, "") + `.${ext}`;
  const prefix = doc === "cover" ? "cover-letter" : "cv";
  return path.join(config.outputDir(), variant, `${prefix}-${variant}-${lang}.${ext}`);
}

async function main() {
  // base ya fue cargado y validado arriba (necesario para derivar los idiomas).
  // Load + validate every requested variant up front.
  const variants = {};
  for (const name of variantNames) {
    const v = JSON.parse(fs.readFileSync(path.join(VARIANTS_DIR, `${name}.json`), "utf-8"));
    const check = validateVariant(v, base);
    if (!check.valid) fail(`Validation failed (variants/${name}.json):\n  - ${check.errors.join("\n  - ")}`);
    variants[name] = v;
  }

  let browser = null;
  let puppeteer = null;
  if (needsBrowser()) {
    puppeteer = require("puppeteer-core");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: findBrowser(),
      args: (process.env.PUPPETEER_LAUNCH_ARGS || "").split(/\s+/).filter(Boolean),
    });
  }

  // Cuenta las páginas leyendo /Count del árbol /Pages (Chromium/Skia escribe
  // ese objeto sin comprimir). Fallback: 1.
  function countPdfPages(buffer) {
    const m = buffer.toString("latin1").match(/\/Type\s*\/Pages[\s\S]{0,64}?\/Count\s+(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }

  const FOOTER_WORDS = { es: { page: "página", of: "de" }, en: { page: "page", of: "of" } };

  // footer: { name, lang }. El pie ("Nombre · página N de M") se agrega SOLO
  // cuando el documento tiene más de una página: señaliza que hay más
  // contenido y, si se imprime, cada hoja lleva el nombre.
  async function writePdf(html, pdfPath, footer) {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    // Sin margin explícito: los márgenes vienen del @page de cada tema, y así
    // aplican en todas las páginas (no solo la primera, como el padding).
    const opts = { path: pdfPath, format: "A4", printBackground: true };
    const buffer = await page.pdf(opts);

    if (footer && countPdfPages(buffer) > 1) {
      const words = FOOTER_WORDS[footer.lang] || FOOTER_WORDS.en;
      await page.pdf({
        ...opts,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          `<div style="width:100%; font-size:8px; font-family:Arial, sans-serif; color:#999; text-align:center;">` +
          `${escapeHtml(footer.name)} · ${words.page} <span class="pageNumber"></span> ${words.of} <span class="totalPages"></span>` +
          `</div>`,
      });
    }
    await page.close();
  }

  try {
    for (const name of variantNames) {
      const variant = variants[name];

      // Which documents for this variant.
      let docs;
      if (docArg === "all") docs = variant.cover_letter ? ["cv", "cover"] : ["cv"];
      else docs = [docArg];
      if (docs.includes("cover") && !variant.cover_letter) {
        fail(`Variant "${name}" does not define cover_letter (required by --doc cover).`);
      }

      for (const doc of docs) {
        for (const lang of langs) {
          const isCover = doc === "cover";
          const data = isCover ? buildCoverLetter(variant, lang, base) : buildData(variant, lang, base);
          const html = isCover ? renderCoverLetterHTML(data, themeArg) : renderHTML(data, themeArg);

          for (const fmt of formats) {
            const dest = outPathFor(name, doc, lang, fmt);
            fs.mkdirSync(path.dirname(dest), { recursive: true });

            if (fmt === "md") {
              fs.writeFileSync(dest, isCover ? renderCoverLetterMarkdown(data) : renderMarkdown(data), "utf-8");
            } else if (fmt === "html") {
              fs.writeFileSync(dest, html, "utf-8");
            } else if (fmt === "docx") {
              const buf = isCover ? await renderCoverLetterDocx(data) : await renderCVDocx(data);
              fs.writeFileSync(dest, buf);
            } else if (fmt === "pdf") {
              await writePdf(html, dest, { name: data.name, lang });
            }
            console.log(`✓ [${name}/${doc}/${lang}] ${fmt.toUpperCase()}: ${dest}`);
          }
        }
      }
    }
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
