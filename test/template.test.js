// test/template.test.js — merge/render logic de template.js contra un base fixture
const { describe, test, expect } = require("bun:test");
const {
  supportedLangs,
  escapeHtml,
  formatDate,
  translateDates,
  buildData,
  buildCoverLetter,
  renderHTML,
  renderMarkdown,
  renderCoverLetterHTML,
  renderCoverLetterMarkdown,
} = require("../template");

const fixtureBase = () => ({
  name: "Jane Doe",
  contact: "City · jane@example.com",
  labels: {
    es: {
      summary: "Resumen Profesional",
      experience: "Experiencia Profesional",
      education: "Educación",
      skills: "Habilidades Técnicas",
      languages: "Idiomas",
    },
    en: {
      summary: "Professional Summary",
      experience: "Experience",
      education: "Education",
      skills: "Technical Skills",
      languages: "Languages",
    },
  },
  dateTokens: { en: { Ene: "Jan", Ago: "Aug", Presente: "Present" } },
  links: [{ label: "GitHub", url: "https://github.com/jane" }],
  experience: [
    {
      id: "acme-dev",
      title: { es: "Desarrolladora", en: "Developer" },
      company: "Acme",
      dates: "Ene 2020 – Presente",
      bullets: [{ es: "Hice X", en: "Did X" }],
    },
    {
      id: "beta-qa",
      title: { es: "QA", en: "QA" },
      company: "Beta",
      dates: "Ago 2018 – Ene 2020",
      bullets: [{ es: "Probé Y", en: "Tested Y" }],
    },
  ],
  education: [
    { degree: { es: "Ingeniería", en: "Engineering" }, institution: "Uni", dates: "2010 – 2014" },
  ],
  skills: {
    backend: { label: { es: "Backend", en: "Backend" }, value: "Node.js" },
    frontend: { label: { es: "Frontend", en: "Frontend" }, value: "Angular" },
  },
  languages: [{ es: "Inglés — B2", en: "English — B2" }],
  custom_sections: [
    {
      id: "projects",
      label: { es: "Proyectos", en: "Projects" },
      layout: "entries",
      items: [{ title: "CLI Tool", url: "https://x.test", dates: "2023", bullets: [{ es: "Go", en: "Go" }] }],
    },
    {
      id: "certs",
      label: { es: "Certificaciones", en: "Certifications" },
      layout: "list",
      items: [{ es: "AWS SAA", en: "AWS SAA" }],
    },
  ],
});

describe("supportedLangs", () => {
  test("deriva los idiomas de base.labels", () => {
    expect(supportedLangs(fixtureBase())).toEqual(["es", "en"]);
  });
});

describe("escapeHtml", () => {
  test("escapa caracteres especiales de HTML", () => {
    expect(escapeHtml(`<b>"a" & 'b'</b>`)).toBe("&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;");
  });
  test("tolera null y undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("translateDates", () => {
  const tokens = { en: { Ene: "Jan", Presente: "Present" } };
  test("traduce tokens al idioma pedido", () => {
    expect(translateDates("Ene 2020 – Presente", "en", tokens)).toBe("Jan 2020 – Present");
  });
  test("deja el español intacto (sin mapa para es)", () => {
    expect(translateDates("Ene 2020 – Presente", "es", tokens)).toBe("Ene 2020 – Presente");
  });
});

describe("formatDate", () => {
  test("formatea una fecha localizada", () => {
    const d = new Date(Date.UTC(2026, 6, 2));
    expect(formatDate(d, "es")).toMatch(/2026/);
    expect(formatDate(d, "en")).toMatch(/2026/);
  });
});

describe("buildData", () => {
  test("sin variant devuelve el base completo en español", () => {
    const data = buildData({}, "es", fixtureBase());
    expect(data.name).toBe("Jane Doe");
    expect(data.experience.map((e) => e.title)).toEqual(["Desarrolladora", "QA"]);
    expect(data.experience[0].subtitle).toBe("Acme");
    expect(data.experience[0].dates).toBe("Ene 2020 – Presente");
    expect(Object.keys(data.skills)).toEqual(["backend", "frontend"]);
    expect(data.links).toEqual([{ label: "GitHub", url: "https://github.com/jane" }]);
    expect(data.customSections.map((s) => s.id)).toEqual(["projects", "certs"]);
  });

  test("resuelve inglés y traduce tokens de fecha", () => {
    const data = buildData({}, "en", fixtureBase());
    expect(data.experience[0].title).toBe("Developer");
    expect(data.experience[0].dates).toBe("Jan 2020 – Present");
    expect(data.labels.summary).toBe("Professional Summary");
  });

  test("experience_ids filtra y ordena", () => {
    const data = buildData({ experience_ids: ["beta-qa"] }, "es", fixtureBase());
    expect(data.experience.map((e) => e.subtitle)).toEqual(["Beta"]);
  });

  test("override parcial de una entrada de experiencia por id", () => {
    const variant = { experience: { "acme-dev": { bullets: [{ es: "Nuevo", en: "New" }] } } };
    const data = buildData(variant, "es", fixtureBase());
    expect(data.experience[0].bullets).toEqual(["Nuevo"]);
    expect(data.experience[0].title).toBe("Desarrolladora");
  });

  test("skills: override, sección nueva y skills_order", () => {
    const variant = {
      skills: { backend: { value: "Node.js, Bun" }, ai: { label: "IA", value: "LangChain" } },
      skills_order: ["ai", "backend"],
    };
    const data = buildData(variant, "es", fixtureBase());
    expect(Object.keys(data.skills)).toEqual(["ai", "backend"]);
    expect(data.skills.backend.value).toBe("Node.js, Bun");
  });

  test("links: la variant reemplaza el array", () => {
    const data = buildData({ links: [{ label: "Web", url: "https://w.test" }] }, "es", fixtureBase());
    expect(data.links).toEqual([{ label: "Web", url: "https://w.test" }]);
  });

  test("custom_sections: override, sección nueva y orden", () => {
    const variant = {
      custom_sections: {
        certs: { items: [{ es: "CKA", en: "CKA" }] },
        awards: { label: "Premios", layout: "list", items: ["X"] },
      },
      custom_sections_order: ["awards", "projects"],
    };
    const data = buildData(variant, "es", fixtureBase());
    expect(data.customSections.map((s) => s.id)).toEqual(["awards", "projects"]);
    expect(data.customSections[0].items).toEqual(["X"]);
    // certs quedó fuera del orden pero el override no rompe nada
  });

  test("custom section inline resuelve label/value", () => {
    const base = fixtureBase();
    base.custom_sections = [
      { id: "extra", label: "Extra", layout: "inline", items: [{ label: { es: "Clave", en: "Key" }, value: "V" }] },
    ];
    const data = buildData({}, "en", base);
    expect(data.customSections[0].items).toEqual([{ label: "Key", value: "V" }]);
  });
});

describe("renderHTML / renderMarkdown", () => {
  test("renderHTML escapa contenido y aplica el tema", () => {
    const base = fixtureBase();
    base.experience[0].bullets = [{ es: "Usé <script> & 'x'", en: "x" }];
    const html = renderHTML(buildData({}, "es", base), "classic");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Usé &lt;script&gt; &amp; &#39;x&#39;");
    expect(html).toContain("github.com/jane");
  });

  test("renderHTML acepta el tema modern", () => {
    const html = renderHTML(buildData({}, "es", fixtureBase()), "modern");
    expect(html).toContain("2563eb");
  });

  test("renderHTML lanza con un tema desconocido", () => {
    expect(() => renderHTML(buildData({}, "es", fixtureBase()), "nope")).toThrow("Unknown theme");
  });

  test("renderMarkdown incluye secciones, links y custom sections", () => {
    const md = renderMarkdown(buildData({}, "es", fixtureBase()));
    expect(md).toContain("# Jane Doe");
    expect(md).toContain("[GitHub](https://github.com/jane)");
    expect(md).toContain("## Experiencia Profesional");
    expect(md).toContain("- Hice X");
    expect(md).toContain("- **Backend:** Node.js");
    expect(md).toContain("## Proyectos");
    expect(md).toContain("[CLI Tool](https://x.test)");
    expect(md).toContain("## Certificaciones");
    expect(md).toContain("- AWS SAA");
  });
});

describe("buildCoverLetter", () => {
  const coverVariant = () => ({
    cover_letter: {
      recipient: { es: "Equipo de Selección", en: "Hiring Team" },
      company: "Acme Corp",
      subject: { es: "Postulación: Tech Lead", en: "Application: Tech Lead" },
      body: [{ es: "Primer párrafo.", en: "First paragraph." }],
    },
  });

  test("resuelve campos y usa fecha automática localizada", () => {
    const data = buildCoverLetter(coverVariant(), "en", fixtureBase(), { today: new Date(Date.UTC(2026, 6, 2)) });
    expect(data.recipient).toBe("Hiring Team");
    expect(data.company).toBe("Acme Corp");
    expect(data.date).toMatch(/2026/);
  });

  test("date explícita de la variant tiene prioridad", () => {
    const v = coverVariant();
    v.cover_letter.date = { es: "1 de enero", en: "Jan 1" };
    expect(buildCoverLetter(v, "es", fixtureBase()).date).toBe("1 de enero");
  });

  test("closing por defecto según idioma", () => {
    expect(buildCoverLetter(coverVariant(), "es", fixtureBase()).closing).toBe("Atentamente,");
    expect(buildCoverLetter(coverVariant(), "en", fixtureBase()).closing).toBe("Sincerely,");
  });

  test("closing de labels.<lang>.closing tiene prioridad sobre el default", () => {
    const base = fixtureBase();
    base.labels.es.closing = "Saludos,";
    expect(buildCoverLetter(coverVariant(), "es", base).closing).toBe("Saludos,");
  });

  test("falla si la variant no define cover_letter", () => {
    expect(() => buildCoverLetter({}, "es", fixtureBase())).toThrow("cover_letter");
  });

  test("renderCoverLetterHTML escapa y renderiza", () => {
    const v = coverVariant();
    v.cover_letter.body = [{ es: "Uso de <b> & co.", en: "x" }];
    const html = renderCoverLetterHTML(buildCoverLetter(v, "es", fixtureBase()), "classic");
    expect(html).toContain("Uso de &lt;b&gt; &amp; co.");
    expect(html).toContain("Equipo de Selección");
  });

  test("renderCoverLetterMarkdown arma la carta completa", () => {
    const data = buildCoverLetter(coverVariant(), "es", fixtureBase(), { today: new Date(Date.UTC(2026, 6, 2)) });
    const md = renderCoverLetterMarkdown(data);
    expect(md).toContain("# Jane Doe");
    expect(md).toContain("Equipo de Selección");
    expect(md).toContain("**Postulación: Tech Lead**");
    expect(md).toContain("Primer párrafo.");
    expect(md).toContain("Atentamente,");
  });
});
