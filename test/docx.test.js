// test/docx.test.js — el renderer DOCX produce un buffer .docx válido (zip PK)
const { describe, test, expect } = require("bun:test");
const { buildData, buildCoverLetter } = require("../template");
const { renderCVDocx, renderCoverLetterDocx } = require("../lib/docx");

const base = () => ({
  name: "Jane Doe",
  contact: "City · jane@example.com",
  labels: {
    es: { summary: "Resumen", experience: "Experiencia", education: "Educación", skills: "Habilidades", languages: "Idiomas" },
  },
  dateTokens: {},
  links: [{ label: "GitHub", url: "https://github.com/jane" }],
  experience: [{ id: "acme", title: "Dev", company: "Acme", dates: "2020 – 2024", bullets: ["X"] }],
  education: [{ degree: "Ing.", institution: "Uni", dates: "2010" }],
  skills: { backend: { label: "Backend", value: "Node" } },
  languages: ["Inglés"],
  custom_sections: [{ id: "projects", label: "Proyectos", layout: "list", items: ["CLI"] }],
});

// .docx es un zip: empieza con la firma "PK"
function isDocxBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b;
}

describe("renderCVDocx", () => {
  test("devuelve un buffer .docx", async () => {
    const buf = await renderCVDocx(buildData({}, "es", base()));
    expect(isDocxBuffer(buf)).toBe(true);
  });
});

describe("renderCoverLetterDocx", () => {
  test("devuelve un buffer .docx", async () => {
    const variant = { cover_letter: { recipient: "Equipo", company: "Acme", body: ["Hola."] } };
    const buf = await renderCoverLetterDocx(buildCoverLetter(variant, "es", base(), { today: new Date(Date.UTC(2026, 0, 1)) }));
    expect(isDocxBuffer(buf)).toBe(true);
  });
});
