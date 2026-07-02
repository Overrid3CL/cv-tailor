// test/config.test.js — el directorio de datos se compone correctamente
const { describe, test, expect } = require("bun:test");
const path = require("path");
const config = require("../lib/config");

describe("config", () => {
  test("DATA_DIR es una ruta absoluta", () => {
    expect(path.isAbsolute(config.DATA_DIR)).toBe(true);
  });

  test("base/variants/output cuelgan de DATA_DIR", () => {
    expect(config.basePath()).toBe(path.join(config.DATA_DIR, "base.json"));
    expect(config.variantsDir()).toBe(path.join(config.DATA_DIR, "variants"));
    expect(config.outputDir()).toBe(path.join(config.DATA_DIR, "output"));
  });
});
