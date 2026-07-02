// lib/jsonresume.js — conversor de JSON Resume (jsonresume.org/schema) a base.json.
//
// JSON Resume es monolingüe, así que los textos se importan como strings planos
// (buildData los usa igual en todos los idiomas). Las fechas ISO se reescriben a
// tokens de mes en español para que la traducción es->en de template.js funcione;
// por eso el base resultante incluye dateTokens.en.

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DATE_TOKENS_EN = { Presente: "Present" };
MONTHS_ES.forEach((m, i) => {
  if (m !== MONTHS_EN[i]) DATE_TOKENS_EN[m] = MONTHS_EN[i];
});

const DEFAULT_LABELS = {
  es: { summary: "Resumen Profesional", experience: "Experiencia Profesional", education: "Educación", skills: "Habilidades", languages: "Idiomas" },
  en: { summary: "Professional Summary", experience: "Experience", education: "Education", skills: "Skills", languages: "Languages" },
};

// "2022-07" | "2022-07-01" | "2022" -> "Jul 2022"; "" -> "Presente"
function fmtDate(iso) {
  if (!iso) return "Presente";
  const m = String(iso).match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return String(iso);
  const year = m[1];
  if (!m[2]) return year;
  const month = MONTHS_ES[parseInt(m[2], 10) - 1] || "";
  return month ? `${month} ${year}` : year;
}

function dateRange(startDate, endDate) {
  const start = fmtDate(startDate);
  if (!startDate && !endDate) return "";
  return `${start} – ${fmtDate(endDate)}`;
}

function slugify(str, fallback) {
  const s = String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || fallback;
}

function uniqueId(base, used) {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function buildContact(basics) {
  const loc = basics.location || {};
  const place = [loc.city, loc.region].filter(Boolean).join(", ");
  return [place, basics.email, basics.phone, basics.url].filter(Boolean).join("  ·  ");
}

function buildLinks(basics) {
  const links = [];
  for (const p of basics.profiles || []) {
    if (p.url) links.push({ label: p.network || p.username || p.url, url: p.url });
  }
  return links;
}

function buildExperience(work) {
  const used = new Set();
  return (work || []).map((w) => {
    const company = w.name || w.company || "";
    const id = uniqueId(slugify(`${company}-${w.position || ""}`, `job-${used.size + 1}`), used);
    const highlights = Array.isArray(w.highlights) && w.highlights.length ? w.highlights : w.summary ? [w.summary] : [];
    return {
      id,
      title: w.position || "",
      company,
      dates: dateRange(w.startDate, w.endDate),
      bullets: highlights.length ? highlights : [""],
    };
  });
}

function buildEducation(education) {
  return (education || []).map((e) => {
    const degree = [e.studyType, e.area].filter(Boolean).join(", ") || e.studyType || e.area || "";
    return { degree, institution: e.institution || "", dates: dateRange(e.startDate, e.endDate) };
  });
}

function buildSkills(skills) {
  const out = {};
  const used = new Set();
  for (const s of skills || []) {
    const id = uniqueId(slugify(s.name, `skill-${used.size + 1}`), used);
    const value = Array.isArray(s.keywords) && s.keywords.length ? s.keywords.join(", ") : s.level || "";
    out[id] = { label: s.name || id, value };
  }
  return out;
}

function buildLanguages(languages) {
  return (languages || []).map((l) => [l.language, l.fluency].filter(Boolean).join(" — "));
}

// projects[] -> custom "entries" section; certificates[] -> custom "list" section
function buildCustomSections(resume) {
  const sections = [];
  if (Array.isArray(resume.projects) && resume.projects.length) {
    sections.push({
      id: "projects",
      label: { es: "Proyectos", en: "Projects" },
      layout: "entries",
      items: resume.projects.map((p) => ({
        title: p.name || "",
        dates: dateRange(p.startDate, p.endDate),
        url: p.url || "",
        description: p.description || "",
        bullets: Array.isArray(p.highlights) ? p.highlights : [],
      })),
    });
  }
  if (Array.isArray(resume.certificates) && resume.certificates.length) {
    sections.push({
      id: "certificates",
      label: { es: "Certificaciones", en: "Certifications" },
      layout: "list",
      items: resume.certificates.map((c) =>
        [c.name, c.issuer, c.date ? fmtDate(c.date) : ""].filter(Boolean).join(" · "),
      ),
    });
  }
  return sections;
}

// Convert a parsed JSON Resume object into a base.json document.
function jsonResumeToBase(resume) {
  if (!resume || typeof resume !== "object") throw new Error("JSON Resume inválido: se esperaba un objeto");
  const basics = resume.basics || {};

  const base = {
    name: basics.name || "",
    contact: buildContact(basics),
    labels: DEFAULT_LABELS,
    dateTokens: { en: DATE_TOKENS_EN },
    experience: buildExperience(resume.work),
    education: buildEducation(resume.education),
    skills: buildSkills(resume.skills),
    languages: buildLanguages(resume.languages),
  };

  const links = buildLinks(basics);
  if (links.length) base.links = links;

  const customSections = buildCustomSections(resume);
  if (customSections.length) base.custom_sections = customSections;

  return base;
}

module.exports = { jsonResumeToBase, fmtDate, dateRange, slugify };
