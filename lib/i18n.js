// lib/i18n.js — translation utilities over the data documents.
//
// Detects translatable fields (objects keyed by language code, e.g.
// { es, en, "pt-BR" }) that are missing a given language. The translation
// itself is done by the MCP client (the user's AI agent) guided by the
// translate_cv prompt; only the deterministic part lives here: finding WHAT
// is missing and at which exact path.

// Language-code-shaped keys: "es", "en", "fr", "pt-BR", "zh-Hans"…
// Structural keys ("label", "url", "value", month tokens…) do not match, so
// data objects are never mistaken for translatable ones.
const LANG_KEY_RE = /^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/;

// A node is "translatable" if it is a plain object whose keys ALL look like
// language codes and whose values are ALL strings — the same shape t() in
// template.js resolves. No specific pivot language is required.
function isTranslatable(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (!entries.length) return false;
  return entries.every(([key, v]) => LANG_KEY_RE.test(key) && typeof v === "string");
}

// Walk a document (base or variant) and return the paths of translatable
// fields missing the requested language: [{ path, source }] where source is
// the text in the pivot language ("es" if present, else the first one). Does
// not descend into translatable nodes (their keys are languages, not
// structure).
function findMissingTranslations(doc, lang) {
  const missing = [];

  function walk(node, path) {
    if (isTranslatable(node)) {
      if (!(lang in node)) {
        missing.push({ path, source: node.es ?? Object.values(node)[0] });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  }

  walk(doc, "");
  return missing;
}

module.exports = { isTranslatable, findMissingTranslations };
