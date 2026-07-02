// lib/docx.js — render de CV y cover letter a .docx (Microsoft Word).
//
// Consume el mismo objeto `data` que producen buildData/buildCoverLetter en
// template.js, así que comparte toda la lógica de merge/idioma. Devuelve un
// Buffer con el documento .docx listo para escribir a disco.

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
} = require("docx");

const ACCENT = "2563EB";

function sectionTitle(text) {
  return new Paragraph({
    spacing: { before: 220, after: 100 },
    border: { bottom: { color: "000000", style: BorderStyle.SINGLE, size: 8, space: 1 } },
    children: [new TextRun({ text: (text || "").toUpperCase(), bold: true, size: 22, color: "000000" })],
  });
}

function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 20 } });
}

// A header line linking each { label, url }
function linksParagraph(links) {
  const children = [];
  links.forEach((l, i) => {
    if (i > 0) children.push(new TextRun({ text: "  ·  ", color: "666666", size: 18 }));
    if (l.url) {
      children.push(
        new ExternalHyperlink({
          link: l.url,
          children: [new TextRun({ text: l.label || l.url, style: "Hyperlink", size: 18 })],
        }),
      );
    } else {
      children.push(new TextRun({ text: l.label, color: "666666", size: 18 }));
    }
  });
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children });
}

// Render "entries"-shaped items (experience or custom entries sections)
function entryParagraphs(items) {
  const out = [];
  for (const e of items) {
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 0 },
        children: [
          new TextRun({ text: e.title, bold: true, size: 22 }),
          ...(e.dates ? [new TextRun({ text: `\t${e.dates}`, color: "666666", size: 18 })] : []),
        ],
      }),
    );
    if (e.subtitle) {
      out.push(
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: e.subtitle, italics: true, color: "555555", size: 20 })] }),
      );
    }
    if (e.description) {
      out.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: e.description, size: 20 })] }));
    }
    for (const b of e.bullets || []) out.push(bullet(b));
  }
  return out;
}

function customSectionParagraphs(section) {
  const out = [sectionTitle(section.label)];
  if (section.layout === "list") {
    for (const it of section.items) out.push(bullet(it));
  } else if (section.layout === "inline") {
    for (const it of section.items) {
      out.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${it.label}: `, bold: true, size: 20 }),
            new TextRun({ text: it.value, size: 20 }),
          ],
        }),
      );
    }
  } else {
    out.push(...entryParagraphs(section.items));
  }
  return out;
}

async function renderCVDocx(data) {
  const L = data.labels;
  const children = [];

  // Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: data.name, bold: true, size: 40, color: ACCENT })],
    }),
  );
  if (data.headline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: data.headline, size: 20, color: "444444" })],
      }),
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: data.contact, size: 18, color: "666666" })],
    }),
  );
  if (data.links.length) children.push(linksParagraph(data.links));

  // Summary
  if (data.summary) {
    children.push(sectionTitle(L.summary));
    children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: data.summary, size: 20 })] }));
  }

  // Experience
  children.push(sectionTitle(L.experience));
  children.push(...entryParagraphs(data.experience));

  // Education
  children.push(sectionTitle(L.education));
  for (const e of data.education) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: e.degree, bold: true, size: 20 }),
          new TextRun({ text: ` · ${e.institution} · ${e.dates}`, size: 20 }),
        ],
      }),
    );
  }

  // Skills
  children.push(sectionTitle(L.skills));
  for (const s of Object.values(data.skills)) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${s.label}: `, bold: true, size: 20 }),
          new TextRun({ text: s.value, size: 20 }),
        ],
      }),
    );
  }

  // Languages
  children.push(sectionTitle(L.languages));
  for (const l of data.languages) children.push(bullet(l));

  // Custom sections
  for (const section of data.customSections) children.push(...customSectionParagraphs(section));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

async function renderCoverLetterDocx(data) {
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: data.name, bold: true, size: 36, color: ACCENT })],
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      border: { bottom: { color: "000000", style: BorderStyle.SINGLE, size: 8, space: 6 } },
      children: [new TextRun({ text: data.contact, size: 18, color: "666666" })],
    }),
  );

  if (data.date) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 },
        children: [new TextRun({ text: data.date, size: 20 })],
      }),
    );
  }
  for (const line of [data.recipient, data.company].filter(Boolean)) {
    children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: line, size: 20 })] }));
  }
  if (data.subject) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 160 },
        children: [new TextRun({ text: data.subject, bold: true, size: 22 })],
      }),
    );
  }
  for (const p of data.body) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 160 },
        children: [new TextRun({ text: p, size: 20 })],
      }),
    );
  }
  children.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun({ text: data.closing, size: 20 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: data.name, bold: true, size: 20 })] }));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

module.exports = { renderCVDocx, renderCoverLetterDocx };
