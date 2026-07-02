// test/lint.test.js — reglas deterministas de lib/lint.js
const { describe, test, expect } = require("bun:test");
const { lintCV, LIMITS } = require("../lib/lint");

const fixtureBase = (overrides = {}) => ({
  name: "Jane Doe",
  contact: "City",
  labels: {
    es: { summary: "Resumen", experience: "Experiencia", education: "Educación", skills: "Habilidades", languages: "Idiomas" },
  },
  dateTokens: {},
  links: [{ label: "GitHub", url: "https://github.com/jane" }],
  experience: [
    {
      id: "acme",
      title: "Dev Senior",
      company: "Acme",
      dates: "2020 – 2024",
      bullets: [
        "Reduje el tiempo de despliegue en 40% automatizando el pipeline de CI/CD.",
        "Diseñé una API que procesa 5.000 solicitudes por minuto.",
      ],
    },
  ],
  education: [{ degree: "Ing.", institution: "Uni", dates: "2015" }],
  skills: { backend: { label: "Backend", value: "Node.js" } },
  languages: ["Inglés"],
  ...overrides,
});

const goodVariant = () => ({
  headline: "Backend Senior",
  summary: "Ingeniera de software con 8 años construyendo sistemas backend de alto volumen y liderando equipos pequeños en fintech.",
});

const byWhere = (findings, where) => findings.filter((f) => f.where.includes(where));

describe("lintCV", () => {
  test("un CV sano con headline/summary/links no produce warnings", () => {
    const { findings } = lintCV(fixtureBase(), goodVariant(), "es");
    expect(findings.filter((f) => f.severity === "warn")).toEqual([]);
  });

  test("detecta falta de headline, summary y links", () => {
    const base = fixtureBase({ links: [] });
    const { findings } = lintCV(base, {}, "es");
    const wheres = findings.map((f) => f.where);
    expect(wheres).toContain("headline");
    expect(wheres).toContain("summary");
    expect(wheres).toContain("links");
  });

  test("summary fuera de rango produce warn", () => {
    const short = lintCV(fixtureBase(), { summary: "Muy corto." }, "es");
    expect(byWhere(short.findings, "summary")[0].severity).toBe("warn");

    const long = lintCV(fixtureBase(), { summary: "x".repeat(LIMITS.summaryMax + 1) }, "es");
    expect(byWhere(long.findings, "summary")[0].severity).toBe("warn");
  });

  test("bullet demasiado largo produce warn", () => {
    const base = fixtureBase();
    base.experience[0].bullets = ["Diseñé un sistema que " + "procesa datos ".repeat(25) + "al 99%."];
    const { findings } = lintCV(base, goodVariant(), "es");
    expect(byWhere(findings, "bullet 1").some((f) => f.severity === "warn" && f.message.includes("chars"))).toBe(true);
  });

  test("arranque débil produce warn (es y en)", () => {
    const base = fixtureBase();
    base.experience[0].bullets = [
      "Ayudé a migrar el sistema a la nube con un ahorro del 20%.",
      "Was responsible for the deployment pipeline with 99% uptime.",
    ];
    const { findings } = lintCV(base, goodVariant(), "es");
    const weak = findings.filter((f) => f.message.includes("Weak opener"));
    expect(weak.length).toBe(2);
  });

  test("mayoría de bullets sin métricas produce info agregado", () => {
    const base = fixtureBase();
    base.experience[0].bullets = [
      "Desarrollé funcionalidades para la plataforma principal.",
      "Mantuve los servicios del equipo en buen estado.",
      "Coordiné con otras áreas de la empresa.",
    ];
    const { findings } = lintCV(base, goodVariant(), "es");
    expect(findings.some((f) => f.message.includes("no numbers or metrics"))).toBe(true);
  });

  test("demasiados bullets en una entrada produce warn", () => {
    const base = fixtureBase();
    base.experience[0].bullets = Array.from({ length: 8 }, (_, i) => `Logro medible número ${i + 1} con 10% de impacto.`);
    const { findings } = lintCV(base, goodVariant(), "es");
    expect(byWhere(findings, 'experience "Dev Senior"').some((f) => f.severity === "warn" && f.message.includes("8 bullets"))).toBe(true);
  });

  test("término repetido en exceso produce info", () => {
    const base = fixtureBase();
    base.experience[0].bullets = Array.from(
      { length: 6 },
      (_, i) => `Implementé microservicios con microservicios y más microservicios v${i + 1}.`,
    );
    const { findings } = lintCV(base, goodVariant(), "es");
    expect(findings.some((f) => f.message.includes('"microservicios"'))).toBe(true);
  });
});
