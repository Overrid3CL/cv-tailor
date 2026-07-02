// lib/config.js — resuelve el "directorio de datos" (dónde viven base.json,
// variants/ y output/), separado del directorio del código (que viaja con el
// paquete: schemas/, templates/, *.js).
//
// Datos: por defecto el directorio actual (process.cwd()), o CV_DIR si está
// definido. Esto permite instalar la herramienta global / vía bunx y correrla
// sobre la carpeta del CV en la que estás parado, en vez de sobre la carpeta
// donde npm/bun dejó el paquete.
//
// El código (schemas, templates) se resuelve siempre con require()/__dirname en
// sus módulos, así que no depende de este archivo.

const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.CV_DIR ? path.resolve(process.env.CV_DIR) : process.cwd();

function basePath() {
  return path.join(DATA_DIR, "base.json");
}

function variantsDir() {
  return path.join(DATA_DIR, "variants");
}

function outputDir() {
  return path.join(DATA_DIR, "output");
}

function achievementsPath() {
  return path.join(DATA_DIR, "achievements.json");
}

function applicationsPath() {
  return path.join(DATA_DIR, "applications.json");
}

// Snapshots por postulación: applications/<id>/ (PDF enviado + variant congelada)
function applicationsDir() {
  return path.join(DATA_DIR, "applications");
}

// Lee y parsea base.json desde el directorio de datos. Lanza si no existe.
function loadBase() {
  return JSON.parse(fs.readFileSync(basePath(), "utf-8"));
}

module.exports = {
  DATA_DIR,
  basePath,
  variantsDir,
  outputDir,
  achievementsPath,
  applicationsPath,
  applicationsDir,
  loadBase,
};
