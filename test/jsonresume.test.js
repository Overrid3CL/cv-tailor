// test/jsonresume.test.js — conversor JSON Resume -> base.json
const { describe, test, expect } = require("bun:test");
const { jsonResumeToBase, fmtDate, dateRange, slugify } = require("../lib/jsonresume");
const { validateBase } = require("../lib/validate");

describe("helpers", () => {
  test("fmtDate formatea ISO a token en español", () => {
    expect(fmtDate("2022-07")).toBe("Jul 2022");
    expect(fmtDate("2022")).toBe("2022");
    expect(fmtDate("")).toBe("Presente");
  });
  test("dateRange arma el rango", () => {
    expect(dateRange("2020-01", "2024-08")).toBe("Ene 2020 – Ago 2024");
    expect(dateRange("2020-01", "")).toBe("Ene 2020 – Presente");
  });
  test("slugify produce kebab-case", () => {
    expect(slugify("Acme Corp!")).toBe("acme-corp");
    expect(slugify("", "fallback")).toBe("fallback");
  });
});

const sampleResume = () => ({
  basics: {
    name: "Alex Doe",
    label: "Engineer",
    email: "alex@example.com",
    phone: "+123",
    url: "https://alexdoe.dev",
    location: { city: "City", region: "Region" },
    profiles: [{ network: "GitHub", url: "https://github.com/alexdoe" }],
  },
  work: [
    {
      name: "Acme",
      position: "Senior Engineer",
      startDate: "2022-01",
      endDate: "",
      highlights: ["Did A", "Did B"],
    },
    { name: "Startup", position: "Developer", startDate: "2019-08", endDate: "2021-12", summary: "Built stuff" },
  ],
  education: [{ institution: "Uni", studyType: "BSc", area: "CS", startDate: "2015", endDate: "2019" }],
  skills: [{ name: "Backend", keywords: ["Node", "Go"] }, { name: "Frontend", level: "Advanced" }],
  languages: [{ language: "Spanish", fluency: "Native" }],
  projects: [{ name: "CLI", description: "A tool", url: "https://x.test", highlights: ["Go"] }],
  certificates: [{ name: "AWS SAA", issuer: "Amazon", date: "2023-05" }],
});

describe("jsonResumeToBase", () => {
  test("produce un base válido", () => {
    const base = jsonResumeToBase(sampleResume());
    expect(validateBase(base).valid).toBe(true);
  });

  test("mapea basics, contact y links", () => {
    const base = jsonResumeToBase(sampleResume());
    expect(base.name).toBe("Alex Doe");
    expect(base.contact).toContain("City, Region");
    expect(base.contact).toContain("alex@example.com");
    expect(base.links).toEqual([{ label: "GitHub", url: "https://github.com/alexdoe" }]);
  });

  test("mapea experiencia con ids únicos y fechas", () => {
    const base = jsonResumeToBase(sampleResume());
    expect(base.experience).toHaveLength(2);
    expect(base.experience[0].dates).toBe("Ene 2022 – Presente");
    expect(base.experience[0].bullets).toEqual(["Did A", "Did B"]);
    // sin highlights, usa summary como único bullet
    expect(base.experience[1].bullets).toEqual(["Built stuff"]);
  });

  test("mapea skills (keywords y level)", () => {
    const base = jsonResumeToBase(sampleResume());
    expect(base.skills.backend.value).toBe("Node, Go");
    expect(base.skills.frontend.value).toBe("Advanced");
  });

  test("mapea projects y certificates a custom_sections", () => {
    const base = jsonResumeToBase(sampleResume());
    const ids = base.custom_sections.map((s) => s.id);
    expect(ids).toContain("projects");
    expect(ids).toContain("certificates");
  });

  test("incluye dateTokens.en para traducir fechas", () => {
    const base = jsonResumeToBase(sampleResume());
    expect(base.dateTokens.en.Ene).toBe("Jan");
    expect(base.dateTokens.en.Presente).toBe("Present");
  });

  test("lanza con entrada inválida", () => {
    expect(() => jsonResumeToBase(null)).toThrow();
  });
});
