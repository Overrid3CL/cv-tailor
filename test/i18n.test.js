// test/i18n.test.js — detección de traducciones faltantes (lib/i18n.js)
const { describe, test, expect } = require("bun:test");
const { isTranslatable, findMissingTranslations } = require("../lib/i18n");

describe("isTranslatable", () => {
  test("objeto { es, en } de strings sí", () => {
    expect(isTranslatable({ es: "hola", en: "hello" })).toBe(true);
    expect(isTranslatable({ es: "solo es" })).toBe(true);
  });
  test("strings, arrays y objetos estructurales no", () => {
    expect(isTranslatable("hola")).toBe(false);
    expect(isTranslatable(["es"])).toBe(false);
    expect(isTranslatable({ en: "english-only is fine now" })).toBe(true);
    expect(isTranslatable({ es: "x", extra: { nested: true } })).toBe(false);
    expect(isTranslatable(null)).toBe(false);
  });
});

describe("findMissingTranslations", () => {
  const doc = {
    name: "Plain Name",
    headline: { es: "Titular", en: "Headline" },
    summary: { es: "Solo español" },
    experience: [
      {
        id: "acme",
        title: { es: "Dev", en: "Dev" },
        bullets: [{ es: "Bullet uno" }, { es: "Bullet dos", en: "Bullet two" }],
      },
    ],
    skills: {
      backend: { label: { es: "Backend" }, value: "Node.js" },
    },
  };

  test("encuentra solo los campos sin el idioma pedido, con ruta exacta", () => {
    const missing = findMissingTranslations(doc, "en");
    const paths = missing.map((m) => m.path);
    expect(paths).toEqual([
      "summary",
      "experience[0].bullets[0]",
      "skills.backend.label",
    ]);
    expect(missing[0].source).toBe("Solo español");
  });

  test("con el idioma completo no reporta nada", () => {
    expect(findMissingTranslations(doc, "es")).toEqual([]);
  });

  test("strings planos no cuentan como faltantes (idioma-neutros)", () => {
    const missing = findMissingTranslations({ contact: "x", languages: ["y"] }, "en");
    expect(missing).toEqual([]);
  });

  test("un idioma nuevo reporta todos los translatable", () => {
    const missing = findMissingTranslations(doc, "fr");
    expect(missing.length).toBe(6); // headline, summary, title, 2 bullets y label
  });
});
