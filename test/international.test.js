// test/international.test.js — the tool works for CVs authored in ANY language:
// no Spanish pivot required, and match/lint accept per-user config for other
// languages (base.stopwords / base.weak_starters).
const { describe, test, expect } = require("bun:test");
const { validateBase, validateVariant } = require("../lib/validate");
const { supportedLangs, t, buildData, buildCoverLetter, renderHTML, renderMarkdown } = require("../template");
const { matchJob, extractKeywords } = require("../lib/match");
const { lintCV } = require("../lib/lint");
const { findMissingTranslations } = require("../lib/i18n");

// English-only base: not a single "es" key anywhere.
const enOnlyBase = () => ({
  name: "John Smith",
  contact: "London · john@example.com",
  labels: {
    en: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", languages: "Languages" },
  },
  experience: [
    {
      id: "acme",
      title: { en: "Backend Engineer" },
      company: "Acme Ltd",
      dates: "Jan 2020 – Present",
      bullets: [{ en: "Built microservices with Go and Kubernetes serving 2M requests/day." }],
    },
  ],
  education: [{ degree: { en: "BSc Computer Science" }, institution: "UCL", dates: "2012 – 2016" }],
  skills: { backend: { label: { en: "Backend" }, value: "Go, Kubernetes, PostgreSQL" } },
  languages: [{ en: "English — Native" }],
});

describe("English-only base (no Spanish pivot)", () => {
  test("validates without any es keys", () => {
    const res = validateBase(enOnlyBase());
    expect(res.valid).toBe(true);
  });

  test("supported language is just en, and t() falls back to the first available language", () => {
    expect(supportedLangs(enOnlyBase())).toEqual(["en"]);
    expect(t({ en: "hello" }, "fr")).toBe("hello");
    expect(t({ fr: "bonjour" }, "en")).toBe("bonjour");
  });

  test("buildData + render work end to end in en", () => {
    const data = buildData({}, "en", enOnlyBase());
    expect(data.labels.summary).toBe("Summary");
    expect(data.experience[0].title).toBe("Backend Engineer");
    const html = renderHTML(data, "classic");
    expect(html).toContain("John Smith");
    expect(renderMarkdown(data)).toContain("# John Smith");
  });

  test("cover letter resolves with en-only content and en default closing", () => {
    const variant = { cover_letter: { body: [{ en: "First paragraph." }] } };
    expect(validateVariant(variant, enOnlyBase()).valid).toBe(true);
    const data = buildCoverLetter(variant, "en", enOnlyBase(), { today: new Date(Date.UTC(2026, 0, 1)) });
    expect(data.body).toEqual(["First paragraph."]);
    expect(data.closing).toBe("Sincerely,");
  });

  test("matchJob works against an English CV and posting", () => {
    const report = matchJob("Senior role: Go, Kubernetes, PostgreSQL. Go required.", enOnlyBase(), {}, "en");
    expect(report.matched.map((m) => m.keyword)).toEqual(expect.arrayContaining(["go", "kubernetes"]));
    expect(report.score).toBeGreaterThan(50);
  });

  test("findMissingTranslations reports the source text from the first language", () => {
    const missing = findMissingTranslations(enOnlyBase(), "fr");
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.find((m) => m.path === "name")).toBeUndefined(); // plain string, language-neutral
    const title = missing.find((m) => m.path === "experience[0].title");
    expect(title.source).toBe("Backend Engineer");
  });
});

describe("per-user language config", () => {
  test("base.stopwords filters extra noise from keyword extraction", () => {
    const kws = extractKeywords("Wir suchen Erfahrung mit Kafka. Erfahrung Erfahrung.", {
      extraStopwords: ["Erfahrung", "wir", "suchen", "mit"],
    }).map((k) => k.keyword);
    expect(kws).toContain("kafka");
    expect(kws).not.toContain("erfahrung");
  });

  test("matchJob honors base.stopwords", () => {
    const base = { ...enOnlyBase(), stopwords: ["senior"] };
    const report = matchJob("Senior senior role with Go. Senior only.", base, {}, "en");
    expect(report.missing.map((m) => m.keyword)).not.toContain("senior");
  });

  test("base.weak_starters extends the lint openers for other languages", () => {
    const base = enOnlyBase();
    base.weak_starters = ["ich half bei"];
    base.experience[0].bullets = [{ en: "Ich half bei der Migration des Systems mit 20% Ersparnis." }];
    const { findings } = lintCV(base, { headline: "X", summary: "s".repeat(60) }, "en");
    expect(findings.some((f) => f.message.includes("Weak opener"))).toBe(true);
  });
});
