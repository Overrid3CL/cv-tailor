// test/achievements.test.js — schema/semántica del banco de logros + ranking
const { describe, test, expect } = require("bun:test");
const fs = require("fs");
const path = require("path");
const { validateAchievements } = require("../lib/validate");
const { rankAchievements } = require("../lib/match");

const fixtureBase = () => ({
  experience: [{ id: "acme" }, { id: "beta" }],
});

const fixtureAchievements = () => [
  {
    id: "saga",
    tags: ["backend", "payments"],
    skills: ["Java", "Saga"],
    text: { es: "Implementé el patrón Saga para pagos masivos.", en: "Implemented the Saga pattern for bulk payments." },
    metric: "5.000+ trx/día",
    source: "acme",
  },
  {
    id: "mentoring",
    tags: ["leadership"],
    text: { es: "Mentoré a 4 desarrolladores.", en: "Mentored 4 developers." },
  },
];

describe("validateAchievements", () => {
  test("acepta un banco válido", () => {
    const res = validateAchievements(fixtureAchievements(), fixtureBase());
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test("acepta lista vacía", () => {
    expect(validateAchievements([], fixtureBase()).valid).toBe(true);
  });

  test("rechaza ids duplicados", () => {
    const data = fixtureAchievements();
    data.push({ ...data[0] });
    const res = validateAchievements(data, fixtureBase());
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain('duplicate id "saga"');
  });

  test("rechaza source que no existe en base.experience", () => {
    const data = fixtureAchievements();
    data[0].source = "nope";
    const res = validateAchievements(data, fixtureBase());
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain('"nope"');
  });

  test("sin base solo valida schema (source no se chequea)", () => {
    const data = fixtureAchievements();
    data[0].source = "nope";
    expect(validateAchievements(data, null).valid).toBe(true);
  });

  test("rechaza logro sin text y propiedades desconocidas", () => {
    expect(validateAchievements([{ id: "x" }], null).valid).toBe(false);
    expect(validateAchievements([{ id: "x", text: "y", extra: 1 }], null).valid).toBe(false);
  });
});

describe("rankAchievements", () => {
  test("prioriza logros con keywords de la oferta (texto, skills y tags)", () => {
    const job = "Buscamos backend con Java y patrón Saga. Java excluyente para pagos.";
    const ranking = rankAchievements(job, fixtureAchievements(), "es");
    expect(ranking[0].id).toBe("saga");
    expect(ranking[0].matched).toContain("java");
    // "mentoring" no comparte keywords → fuera del ranking
    expect(ranking.find((r) => r.id === "mentoring")).toBeUndefined();
  });

  test("resuelve el texto en el idioma pedido", () => {
    const job = "Backend role with Saga pattern and bulk payments. Saga required.";
    const ranking = rankAchievements(job, fixtureAchievements(), "en");
    expect(ranking[0].id).toBe("saga");
  });
});

describe("examples/achievements.json", () => {
  test("valida contra examples/base.json", () => {
    const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", p), "utf-8"));
    const res = validateAchievements(read("examples/achievements.json"), read("examples/base.json"));
    expect(res.valid).toBe(true);
  });
});
