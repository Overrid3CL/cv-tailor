// test/examples.test.js — el par de ejemplo (examples/base.json + tailored) es
// internamente consistente y renderiza en todos los idiomas.
const { describe, test, expect } = require("bun:test");
const fs = require("fs");
const path = require("path");
const { validateBase, validateVariant } = require("../lib/validate");
const { supportedLangs, buildData, buildCoverLetter, renderHTML, renderMarkdown } = require("../template");

const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", p), "utf-8"));

describe("examples/", () => {
  const base = read("examples/base.json");
  const variant = read("examples/variants/tailored.json");

  test("examples/base.json es un base válido", () => {
    expect(validateBase(base).valid).toBe(true);
  });

  test("examples/variants/tailored.json valida contra examples/base.json", () => {
    const res = validateVariant(variant, base);
    expect(res.valid).toBe(true);
  });

  test("renderiza CV y cover letter en todos los idiomas", () => {
    for (const lang of supportedLangs(base)) {
      const cv = buildData(variant, lang, base);
      expect(renderHTML(cv, "classic")).toContain(cv.name);
      expect(renderMarkdown(cv)).toContain(`# ${cv.name}`);
      const cover = buildCoverLetter(variant, lang, base, { today: new Date(Date.UTC(2026, 0, 1)) });
      expect(cover.body.length).toBeGreaterThan(0);
    }
  });
});
