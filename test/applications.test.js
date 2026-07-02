// test/applications.test.js — schema/semántica del tracker de postulaciones
const { describe, test, expect } = require("bun:test");
const fs = require("fs");
const path = require("path");
const { validateApplications } = require("../lib/validate");

const fixtureApplications = () => [
  {
    id: "2026-07-acme-tech-lead",
    company: "Acme",
    role: "Tech Lead",
    date: "2026-07-02",
    variant: "tech-lead",
    lang: "es",
    status: "sent",
    match_score: 92,
    job_url: "https://acme.test/jobs/1",
    job_text: "Buscamos Tech Lead...",
    notes: "Referido",
    updated: "2026-07-02",
  },
  {
    id: "2026-06-beta-tailored",
    company: "Beta",
    role: "Backend Engineer",
    date: "2026-06-15",
    variant: "tailored",
  },
];

describe("validateApplications", () => {
  test("acepta un registro válido (completo y mínimo)", () => {
    const res = validateApplications(fixtureApplications());
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test("acepta lista vacía", () => {
    expect(validateApplications([]).valid).toBe(true);
  });

  test("rechaza campos requeridos ausentes", () => {
    const data = fixtureApplications();
    delete data[0].company;
    expect(validateApplications(data).valid).toBe(false);
  });

  test("rechaza ids duplicados", () => {
    const data = fixtureApplications();
    data.push({ ...data[0] });
    const res = validateApplications(data);
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain('duplicate id "2026-07-acme-tech-lead"');
  });

  test("rechaza status fuera del enum", () => {
    const data = fixtureApplications();
    data[0].status = "pending";
    expect(validateApplications(data).valid).toBe(false);
  });

  test("rechaza fecha no ISO", () => {
    const data = fixtureApplications();
    data[0].date = "02/07/2026";
    expect(validateApplications(data).valid).toBe(false);
  });

  test("rechaza match_score fuera de rango y propiedades desconocidas", () => {
    const over = fixtureApplications();
    over[0].match_score = 150;
    expect(validateApplications(over).valid).toBe(false);

    const extra = fixtureApplications();
    extra[0].extra = true;
    expect(validateApplications(extra).valid).toBe(false);
  });

  test("rechaza id que no sea kebab-case", () => {
    const data = fixtureApplications();
    data[0].id = "Acme Julio";
    expect(validateApplications(data).valid).toBe(false);
  });
});

describe("examples/applications.json", () => {
  test("es un registro válido", () => {
    const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", p), "utf-8"));
    expect(validateApplications(read("examples/applications.json")).valid).toBe(true);
  });
});
