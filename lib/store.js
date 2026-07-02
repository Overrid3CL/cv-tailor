// lib/store.js — lectura/escritura de base.json y variants/*.json
//
// Toda escritura pasa por el validador (lib/validate.js); un documento
// inválido nunca llega a disco. Los archivos se escriben con indentación
// de 2 espacios y newline final.

const fs = require("fs");
const path = require("path");
const { validateBase, validateVariant, validateAchievements, validateApplications } = require("./validate");
const config = require("./config");

// Datos (base.json, variants/) viven en el directorio de datos (cwd o CV_DIR),
// no junto al código: así la herramienta funciona instalada global / vía bunx.
const DATA_DIR = config.DATA_DIR;
const BASE_PATH = config.basePath();
const VARIANTS_DIR = config.variantsDir();

const VARIANT_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = "ValidationError";
    this.errors = errors || [];
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function readBase() {
  return JSON.parse(fs.readFileSync(BASE_PATH, "utf-8"));
}

function writeBase(data) {
  const { valid, errors } = validateBase(data);
  if (!valid) throw new ValidationError("invalid base.json", errors);

  // Un cambio en base puede romper referencias de variants existentes:
  // revalidarlas todas antes de escribir.
  const broken = [];
  for (const name of listVariantNames()) {
    const res = validateVariant(readVariant(name), data);
    if (!res.valid) broken.push(...res.errors.map((e) => `variants/${name}.json ${e}`));
  }
  if (broken.length) {
    throw new ValidationError(
      "This base.json change would break existing variants (update or delete those variants first)",
      broken,
    );
  }

  writeJson(BASE_PATH, data);
}

function listVariantNames() {
  if (!fs.existsSync(VARIANTS_DIR)) return [];
  return fs
    .readdirSync(VARIANTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function variantPath(name) {
  if (!VARIANT_NAME_RE.test(name)) {
    throw new ValidationError(`Invalid variant name: "${name}" (use kebab-case: [a-z0-9-])`);
  }
  return path.join(VARIANTS_DIR, `${name}.json`);
}

function variantExists(name) {
  return fs.existsSync(variantPath(name));
}

function readVariant(name) {
  const p = variantPath(name);
  if (!fs.existsSync(p)) throw new Error(`Variant not found: ${name}`);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeVariant(name, data) {
  const p = variantPath(name); // valida el nombre
  const { valid, errors } = validateVariant(data, readBase());
  if (!valid) throw new ValidationError(`invalid variants/${name}.json`, errors);
  writeJson(p, data);
}

function deleteVariant(name) {
  const p = variantPath(name);
  if (!fs.existsSync(p)) throw new Error(`Variant not found: ${name}`);
  fs.unlinkSync(p);
}

// achievements.json es opcional: si no existe, banco vacío.
function readAchievements() {
  const p = config.achievementsPath();
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeAchievements(data) {
  const base = fs.existsSync(config.basePath()) ? readBase() : null;
  const { valid, errors } = validateAchievements(data, base);
  if (!valid) throw new ValidationError("invalid achievements.json", errors);
  writeJson(config.achievementsPath(), data);
}

// applications.json es opcional: si no existe, registro vacío.
function readApplications() {
  const p = config.applicationsPath();
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeApplications(data) {
  const { valid, errors } = validateApplications(data);
  if (!valid) throw new ValidationError("invalid applications.json", errors);
  writeJson(config.applicationsPath(), data);
}

// Valida base.json y todas las variants. Devuelve un reporte por archivo.
function validateAll() {
  const report = { valid: true, files: {} };

  let base = null;
  try {
    base = readBase();
    const res = validateBase(base);
    report.files["base.json"] = res;
    if (!res.valid) report.valid = false;
  } catch (err) {
    report.files["base.json"] = { valid: false, errors: [err.message] };
    report.valid = false;
  }

  for (const name of listVariantNames()) {
    const key = `variants/${name}.json`;
    try {
      const res = validateVariant(readVariant(name), base);
      report.files[key] = res;
      if (!res.valid) report.valid = false;
    } catch (err) {
      report.files[key] = { valid: false, errors: [err.message] };
      report.valid = false;
    }
  }

  return report;
}

module.exports = {
  DATA_DIR,
  BASE_PATH,
  VARIANTS_DIR,
  ValidationError,
  readBase,
  writeBase,
  listVariantNames,
  variantExists,
  readVariant,
  writeVariant,
  deleteVariant,
  readAchievements,
  writeAchievements,
  readApplications,
  writeApplications,
  validateAll,
};
