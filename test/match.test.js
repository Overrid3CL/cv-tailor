// test/match.test.js — análisis determinista oferta vs CV (lib/match.js)
const { describe, test, expect } = require("bun:test");
const { normalize, tokenize, detectLang, extractKeywords, cvCorpus, matchJob, rankVariants } = require("../lib/match");

const fixtureBase = () => ({
  name: "Jane Doe",
  contact: "City · jane@example.com",
  labels: {
    es: { summary: "Resumen", experience: "Experiencia", education: "Educación", skills: "Habilidades", languages: "Idiomas" },
    en: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", languages: "Languages" },
  },
  dateTokens: { en: { Ene: "Jan", Presente: "Present" } },
  experience: [
    {
      id: "acme",
      title: { es: "Desarrolladora Backend", en: "Backend Developer" },
      company: "Acme",
      dates: "Ene 2020 – Presente",
      bullets: [
        { es: "Construí microservicios con Java y Spring Boot sobre Kubernetes.", en: "Built microservices with Java and Spring Boot on Kubernetes." },
        { es: "Implementé pipelines de CI/CD con GitHub Actions.", en: "Implemented CI/CD pipelines with GitHub Actions." },
      ],
    },
  ],
  education: [{ degree: "Ing. Informática", institution: "Uni", dates: "2015" }],
  skills: {
    backend: { label: "Backend", value: "Java, Spring Boot, Node.js" },
    infra: { label: "Infra", value: "Kubernetes, Docker, AWS" },
  },
  languages: ["Inglés — B2"],
});

const JOB_ES = `
Buscamos Ingeniero Backend Senior.
Requisitos: experiencia con Java y Spring Boot. Conocimientos de Kubernetes y AWS.
Deseable: Terraform, GraphQL. Java y Spring Boot son excluyentes.
Trabajarás con microservicios y CI/CD.
Microservicios de alto volumen. GraphQL para las APIs nuevas.
`;

const JOB_EN = `
We are looking for a Senior Backend Engineer to join our team.
Requirements: strong experience with Java and Spring Boot. Knowledge of Kubernetes and AWS.
Nice to have: Terraform, GraphQL. Java and Spring Boot are required.
You will work with microservices and CI/CD pipelines.
High-volume microservices. GraphQL for the new APIs.
`;

describe("normalize / tokenize", () => {
  test("normaliza acentos y mayúsculas", () => {
    expect(normalize("Educación TÉCNICA")).toBe("educacion tecnica");
  });
  test("conserva separadores técnicos internos", () => {
    const toks = tokenize("Uso .NET, C++, CI/CD y Node.js v20");
    expect(toks).toContain("net");
    expect(toks).toContain("c++");
    expect(toks).toContain("ci/cd");
    expect(toks).toContain("node.js");
    expect(toks).not.toContain("20"); // números puros fuera
  });
});

describe("extractKeywords", () => {
  test("encuentra términos repetidos, siglas y bigramas", () => {
    const kws = extractKeywords(JOB_ES).map((k) => k.keyword);
    expect(kws).toContain("java");
    expect(kws).toContain("spring boot");
    expect(kws).toContain("aws"); // sigla, aparece 1 vez
    expect(kws).toContain("microservicios");
  });

  test("filtra stopwords y boilerplate de ofertas", () => {
    const kws = extractKeywords(JOB_ES).map((k) => k.keyword);
    expect(kws).not.toContain("experiencia");
    expect(kws).not.toContain("requisitos");
    expect(kws).not.toContain("con");
  });

  test("knownTerms sube el peso y rescata términos de mención única", () => {
    const without = extractKeywords("Se requiere GraphQL para el rol de backend backend.");
    const withKnown = extractKeywords("Se requiere GraphQL para el rol de backend backend.", {
      knownTerms: new Set(["graphql"]),
    });
    const w = (list, kw) => (list.find((k) => k.keyword === kw) || { weight: 0 }).weight;
    expect(w(withKnown, "graphql")).toBeGreaterThan(w(without, "graphql"));
  });
});

describe("matchJob", () => {
  test("score refleja cobertura: keywords del CV matchean, las ajenas faltan", () => {
    const report = matchJob(JOB_ES, fixtureBase(), {}, "es");
    const matched = report.matched.map((m) => m.keyword);
    const missing = report.missing.map((m) => m.keyword);
    expect(matched).toContain("java");
    expect(matched).toContain("spring boot");
    expect(matched).toContain("kubernetes");
    expect(missing).toContain("terraform");
    expect(missing).toContain("graphql");
    expect(report.score).toBeGreaterThan(40);
    expect(report.score).toBeLessThan(100);
  });

  test("reporta dónde matchea cada keyword", () => {
    const report = matchJob(JOB_ES, fixtureBase(), {}, "es");
    const java = report.matched.find((m) => m.keyword === "java");
    expect(java.where).toContain("skills");
    expect(java.where).toContain("experience");
  });

  test("unigrama exige token exacto: 'java' no matchea en un CV de javascript", () => {
    const base = fixtureBase();
    base.experience[0].bullets = [{ es: "Desarrollo con JavaScript y TypeScript.", en: "x" }];
    base.skills = { fe: { label: "Frontend", value: "JavaScript, TypeScript" } };
    const report = matchJob("Buscamos experto en Java. Java excluyente.", base, {}, "es");
    expect(report.missing.map((m) => m.keyword)).toContain("java");
  });

  test("funciona en inglés con el mismo base", () => {
    const report = matchJob("Senior role: Java, Spring Boot, Kubernetes. Java required.", fixtureBase(), {}, "en");
    expect(report.matched.map((m) => m.keyword)).toEqual(
      expect.arrayContaining(["java", "spring boot", "kubernetes"]),
    );
  });

  test("sin lang: detecta el idioma de la oferta y evalúa el CV en ese idioma", () => {
    const auto = matchJob(JOB_EN, fixtureBase());
    expect(auto.lang).toBe("en");
    // Mismo resultado que forzando "en" explícito
    const explicit = matchJob(JOB_EN, fixtureBase(), {}, "en");
    expect(auto.score).toBe(explicit.score);
    // Los términos descriptivos en inglés cruzan contra la versión en inglés
    expect(auto.matched.map((m) => m.keyword)).toContain("microservices");
  });

  test("sin lang y sin señal de idioma: cae al idioma pivote del CV", () => {
    const report = matchJob("Java Kubernetes AWS", fixtureBase());
    expect(report.lang).toBe("es"); // primera clave de labels
  });
});

describe("detectLang", () => {
  test("detecta español e inglés", () => {
    expect(detectLang(JOB_ES, ["es", "en"])).toBe("es");
    expect(detectLang(JOB_EN, ["es", "en"])).toBe("en");
  });

  test("sin señal clara devuelve null", () => {
    expect(detectLang("Java Kubernetes AWS Docker", ["es", "en"])).toBe(null);
    expect(detectLang("", ["es", "en"])).toBe(null);
  });

  test("respeta los idiomas candidatos", () => {
    expect(detectLang(JOB_EN, ["es"])).toBe(null); // "en" no es candidato
  });
});

describe("rankVariants", () => {
  test("ordena variants por afinidad con la oferta", () => {
    const base = fixtureBase();
    const variants = {
      "infra-heavy": {
        headline: "Infra",
        summary: { es: "Especialista en Kubernetes, AWS, Terraform y GraphQL.", en: "x" },
        skills: { extra: { label: "Cloud", value: "Terraform, GraphQL" } },
      },
      minimal: { headline: "Min", experience_ids: [], skills_order: [] },
    };
    const ranking = rankVariants(JOB_ES, base, variants, "es");
    expect(ranking[0].name).toBe("infra-heavy");
    expect(ranking[0].score).toBeGreaterThan(ranking[1].score);
    expect(ranking[1].missingTop.length).toBeGreaterThan(0);
  });
});

describe("cvCorpus", () => {
  test("incluye texto resuelto del CV en el idioma pedido", () => {
    const corpus = cvCorpus(fixtureBase(), {}, "en");
    expect(corpus).toContain("backend developer");
    expect(corpus).toContain("kubernetes");
  });
});
