// test/validate.test.js — validación de schema + chequeos semánticos
const { describe, test, expect } = require("bun:test");
const { validateBase, validateVariant } = require("../lib/validate");

const fixtureBase = () => ({
  name: "Jane Doe",
  contact: "City · jane@example.com",
  labels: {
    es: {
      summary: "Resumen",
      experience: "Experiencia",
      education: "Educación",
      skills: "Habilidades",
      languages: "Idiomas",
    },
  },
  experience: [
    {
      id: "acme-dev",
      title: "Dev",
      company: "Acme",
      dates: "2020 – 2024",
      bullets: ["X"],
    },
  ],
  education: [{ degree: "Ing.", institution: "Uni", dates: "2010" }],
  skills: { backend: { label: "Backend", value: "Node.js" } },
  languages: ["Inglés"],
});

describe("validateBase", () => {
  test("acepta un base válido", () => {
    const res = validateBase(fixtureBase());
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test("rechaza campos requeridos ausentes", () => {
    const base = fixtureBase();
    delete base.experience;
    expect(validateBase(base).valid).toBe(false);
  });

  test("rechaza ids de experiencia duplicados", () => {
    const base = fixtureBase();
    base.experience.push({ ...base.experience[0] });
    const res = validateBase(base);
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain('duplicate id "acme-dev"');
  });
});

describe("validateVariant", () => {
  test("acepta una variant vacía", () => {
    expect(validateVariant({}, fixtureBase()).valid).toBe(true);
  });

  test("acepta overrides válidos", () => {
    const variant = {
      headline: { es: "Titular" },
      experience_ids: ["acme-dev"],
      experience: { "acme-dev": { bullets: ["Nuevo"] } },
      skills_order: ["backend"],
    };
    expect(validateVariant(variant, fixtureBase()).valid).toBe(true);
  });

  test("rechaza experience_ids con id desconocido", () => {
    const res = validateVariant({ experience_ids: ["nope"] }, fixtureBase());
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain('"nope"');
  });

  test("rechaza una entrada de experiencia nueva incompleta", () => {
    const res = validateVariant({ experience: { "new-job": { title: "X" } } }, fixtureBase());
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain("a new entry requires");
  });

  test("rechaza skills_order con key desconocida", () => {
    const res = validateVariant({ skills_order: ["nope"] }, fixtureBase());
    expect(res.valid).toBe(false);
  });

  test("rechaza una sección de skills nueva incompleta", () => {
    const res = validateVariant({ skills: { ai: { label: "IA" } } }, fixtureBase());
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain("a new section requires");
  });

  test("acepta cover_letter válida", () => {
    const variant = {
      cover_letter: {
        recipient: { es: "Equipo de Selección" },
        body: [{ es: "Párrafo." }],
      },
    };
    expect(validateVariant(variant, fixtureBase()).valid).toBe(true);
  });

  test("rechaza cover_letter sin body", () => {
    const res = validateVariant({ cover_letter: { subject: "Hola" } }, fixtureBase());
    expect(res.valid).toBe(false);
  });

  test("rechaza cover_letter con body vacío", () => {
    const res = validateVariant({ cover_letter: { body: [] } }, fixtureBase());
    expect(res.valid).toBe(false);
  });

  test("rechaza propiedades desconocidas en cover_letter", () => {
    const res = validateVariant({ cover_letter: { body: ["x"], extra: 1 } }, fixtureBase());
    expect(res.valid).toBe(false);
  });

  test("acepta un override de custom_section y orden", () => {
    const base = fixtureBase();
    base.custom_sections = [{ id: "projects", label: "Proyectos", layout: "list", items: ["X"] }];
    const variant = {
      custom_sections: { projects: { items: ["Y"] }, awards: { label: "Premios", items: ["Z"] } },
      custom_sections_order: ["awards", "projects"],
    };
    expect(validateVariant(variant, base).valid).toBe(true);
  });

  test("rechaza una custom_section nueva incompleta", () => {
    const res = validateVariant({ custom_sections: { awards: { layout: "list" } } }, fixtureBase());
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain("a new section requires");
  });

  test("rechaza custom_sections_order con id desconocido", () => {
    const res = validateVariant({ custom_sections_order: ["nope"] }, fixtureBase());
    expect(res.valid).toBe(false);
  });

  test("acepta links en la variant", () => {
    expect(validateVariant({ links: [{ label: "Web", url: "https://w.test" }] }, fixtureBase()).valid).toBe(true);
  });
});

describe("validateBase custom_sections", () => {
  test("acepta base con custom_sections y links", () => {
    const base = fixtureBase();
    base.links = [{ url: "https://x.test" }];
    base.custom_sections = [{ id: "projects", label: "Proyectos", items: [] }];
    expect(validateBase(base).valid).toBe(true);
  });

  test("rechaza ids de custom_sections duplicados", () => {
    const base = fixtureBase();
    base.custom_sections = [
      { id: "projects", label: "P", items: [] },
      { id: "projects", label: "P", items: [] },
    ];
    const res = validateBase(base);
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain("duplicate id");
  });
});
