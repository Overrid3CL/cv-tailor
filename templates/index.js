// templates/index.js — registro de temas visuales.
//
// Cada tema exporta el CSS para el CV (`cv`) y la carta de presentación
// (`cover`). La estructura HTML es común (vive en template.js); un tema solo
// cambia el CSS. Agregar un tema nuevo: crea templates/<name>.js con { cv, cover }
// y regístralo aquí.

const classic = require("./classic");
const modern = require("./modern");

const THEMES = { classic, modern };
const DEFAULT_THEME = "classic";

function themeNames() {
  return Object.keys(THEMES);
}

function getTheme(name) {
  const theme = THEMES[name || DEFAULT_THEME];
  if (!theme) {
    throw new Error(`Unknown theme: "${name}". Available: ${themeNames().join(", ")}`);
  }
  return theme;
}

module.exports = { THEMES, DEFAULT_THEME, themeNames, getTheme };
