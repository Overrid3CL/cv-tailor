// lib/validate.js — validación de base.json y variants/*.json
//
// Dos capas:
//   1. JSON Schema (ajv): estructura y tipos (schemas/*.schema.json).
//   2. Semántica: referencias cruzadas que el schema no puede expresar
//      (ids de experience_ids/skills_order existentes, entradas nuevas
//      completas, consistencia de idiomas en labels).
//
// Ambas funciones devuelven { valid: boolean, errors: string[] }.

const Ajv = require("ajv");
const baseSchema = require("../schemas/base.schema.json");
const variantSchema = require("../schemas/variant.schema.json");
const achievementsSchema = require("../schemas/achievements.schema.json");
const applicationsSchema = require("../schemas/applications.schema.json");

const ajv = new Ajv({ allErrors: true, strict: false });
const validateBaseSchema = ajv.compile(baseSchema);
const validateVariantSchema = ajv.compile(variantSchema);
const validateAchievementsSchema = ajv.compile(achievementsSchema);
const validateApplicationsSchema = ajv.compile(applicationsSchema);

function formatAjvErrors(errors) {
  return (errors || []).map((e) => {
    const where = e.instancePath || "(root)";
    return `${where}: ${e.message}`;
  });
}

// Campos requeridos para que una entrada de experiencia nueva (no presente
// en base) pueda renderizarse completa.
const NEW_EXPERIENCE_REQUIRED = ["title", "company", "dates", "bullets"];
const NEW_SKILL_REQUIRED = ["label", "value"];
const NEW_CUSTOM_SECTION_REQUIRED = ["label", "items"];

function validateBase(data) {
  const errors = [];

  if (!validateBaseSchema(data)) {
    errors.push(...formatAjvErrors(validateBaseSchema.errors));
    return { valid: false, errors };
  }

  // Ids de experiencia únicos
  const seen = new Set();
  for (const e of data.experience) {
    if (seen.has(e.id)) errors.push(`/experience: duplicate id "${e.id}"`);
    seen.add(e.id);
  }

  // Ids de secciones custom únicos
  const seenSections = new Set();
  for (const s of data.custom_sections || []) {
    if (seenSections.has(s.id)) errors.push(`/custom_sections: duplicate id "${s.id}"`);
    seenSections.add(s.id);
  }

  // Todo idioma usado en labels debería existir; nada más que validar aquí —
  // los objetos traducibles pueden omitir idiomas (fallback a "es").

  return { valid: errors.length === 0, errors };
}

// base es opcional: sin base solo se valida el schema del variant.
function validateVariant(data, base) {
  const errors = [];

  if (!validateVariantSchema(data)) {
    errors.push(...formatAjvErrors(validateVariantSchema.errors));
    return { valid: false, errors };
  }

  if (base) {
    const baseIds = new Set((base.experience || []).map((e) => e.id));
    const variantExp = data.experience || {};

    // Entradas nuevas (id no existe en base) deben venir completas
    for (const [id, ov] of Object.entries(variantExp)) {
      if (!baseIds.has(id)) {
        const missing = NEW_EXPERIENCE_REQUIRED.filter((f) => !(f in ov));
        if (missing.length) {
          errors.push(
            `/experience/${id}: id not present in base.json; a new entry requires ${missing.join(", ")}`,
          );
        }
      }
    }

    // experience_ids debe referirse a ids conocidos (base o definidos en el variant)
    const knownIds = new Set([...baseIds, ...Object.keys(variantExp)]);
    for (const id of data.experience_ids || []) {
      if (!knownIds.has(id)) {
        errors.push(`/experience_ids: unknown id "${id}" (not in base.json nor in the variant experience)`);
      }
    }

    // Secciones de skills nuevas deben venir completas
    const baseSkillKeys = new Set(Object.keys(base.skills || {}));
    const variantSkills = data.skills || {};
    for (const [key, ov] of Object.entries(variantSkills)) {
      if (!baseSkillKeys.has(key)) {
        const missing = NEW_SKILL_REQUIRED.filter((f) => !(f in ov));
        if (missing.length) {
          errors.push(
            `/skills/${key}: key not present in base.json; a new section requires ${missing.join(", ")}`,
          );
        }
      }
    }

    // skills_order debe referirse a keys conocidas
    const knownSkillKeys = new Set([...baseSkillKeys, ...Object.keys(variantSkills)]);
    for (const key of data.skills_order || []) {
      if (!knownSkillKeys.has(key)) {
        errors.push(`/skills_order: unknown key "${key}" (not in base.json nor in the variant skills)`);
      }
    }

    // Secciones custom nuevas deben venir completas
    const baseSectionIds = new Set((base.custom_sections || []).map((s) => s.id));
    const variantSections = data.custom_sections || {};
    for (const [id, ov] of Object.entries(variantSections)) {
      if (!baseSectionIds.has(id)) {
        const missing = NEW_CUSTOM_SECTION_REQUIRED.filter((f) => !(f in ov));
        if (missing.length) {
          errors.push(
            `/custom_sections/${id}: id not present in base.json; a new section requires ${missing.join(", ")}`,
          );
        }
      }
    }

    // custom_sections_order debe referirse a ids conocidos
    const knownSectionIds = new Set([...baseSectionIds, ...Object.keys(variantSections)]);
    for (const id of data.custom_sections_order || []) {
      if (!knownSectionIds.has(id)) {
        errors.push(
          `/custom_sections_order: unknown id "${id}" (not in base.json nor in the variant custom_sections)`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// base es opcional: sin base solo se valida schema + ids únicos.
function validateAchievements(data, base) {
  const errors = [];

  if (!validateAchievementsSchema(data)) {
    errors.push(...formatAjvErrors(validateAchievementsSchema.errors));
    return { valid: false, errors };
  }

  // Ids únicos
  const seen = new Set();
  for (const a of data) {
    if (seen.has(a.id)) errors.push(`/achievements: duplicate id "${a.id}"`);
    seen.add(a.id);
  }

  // source debe apuntar a una entrada de experience existente
  if (base) {
    const expIds = new Set((base.experience || []).map((e) => e.id));
    for (const a of data) {
      if (a.source && !expIds.has(a.source)) {
        errors.push(`/achievements/${a.id}: source "${a.source}" does not exist in base.experience`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateApplications(data) {
  const errors = [];

  if (!validateApplicationsSchema(data)) {
    errors.push(...formatAjvErrors(validateApplicationsSchema.errors));
    return { valid: false, errors };
  }

  // Ids únicos
  const seen = new Set();
  for (const a of data) {
    if (seen.has(a.id)) errors.push(`/applications: duplicate id "${a.id}"`);
    seen.add(a.id);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateBase, validateVariant, validateAchievements, validateApplications };
