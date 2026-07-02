// template.js — presentation + merge logic (data lives in base.json)
//
// All CV data is in base.json. Translatable strings are objects { es, en, ... };
// plain strings are language-neutral and used as-is. A variant may override ANY
// field, add new experience entries, add/override skills, define header links,
// add custom sections (projects, certifications, ...) and a cover letter.
//
// The HTML structure and class names here are shared by every visual theme
// (templates/*); a theme only swaps the CSS. buildData/buildCoverLetter accept
// an optional `base` argument (defaults to the repo's base.json) so the merge
// logic can be tested against fixtures.

const { getTheme } = require("./templates");

// This module is pure: the base document is always passed in by the caller
// (CLI, MCP server or tests). It does NOT read base.json from disk, so the code
// can live anywhere (global install, bunx cache) independent of the data.

// Supported languages are derived from the label sets defined in base.json.
// The FIRST key of labels acts as the pivot (authoring) language: it is the
// fallback when a text is missing the requested language.
function supportedLangs(base) {
  return Object.keys(base.labels);
}

// Resolve a translatable value (string or { es, en, ... }) to a plain string.
// Fallback chain: requested lang → "es" (historical pivot) → first available
// language. This keeps the tool usable for CVs authored in ANY language, not
// just Spanish.
function t(value, lang) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value[lang] !== undefined) return value[lang];
    if (value.es !== undefined) return value.es;
    const first = Object.values(value)[0];
    return first !== undefined ? first : "";
  }
  return value ?? "";
}

// Escape a value for interpolation into HTML markup
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Translate a date range string. base.dateTokens is keyed by language:
// { en: { "Ene": "Jan", ... }, fr: { ... } }. Dates are authored in Spanish;
// for any other language we replace the known tokens.
function translateDates(dates, lang, dateTokens) {
  const map = (dateTokens || {})[lang];
  if (!map || !dates) return dates;
  const tokens = Object.keys(map);
  if (!tokens.length) return dates;
  const re = new RegExp("\\b(" + tokens.join("|") + ")\\b", "g");
  return dates.replace(re, (m) => map[m] || m);
}

// Localized long date (e.g. "1 de julio de 2026" / "July 1, 2026") via Intl,
// which supports any language tag. Falls back to ISO if the runtime can't.
function formatDate(date, lang) {
  try {
    return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// Resolve one custom section to a single language. Layouts:
//   "entries" (default) -> [{ title, subtitle?, dates?, url?, description?, bullets[] }]
//   "list"              -> [ string ]
//   "inline"            -> [{ label, value }]  (like skills)
function resolveSection(section, lang, dateTokens) {
  const layout = section.layout || "entries";
  const label = t(section.label, lang);
  const rawItems = section.items || [];
  let items;
  if (layout === "list") {
    items = rawItems.map((it) => t(it, lang));
  } else if (layout === "inline") {
    items = rawItems.map((it) => ({ label: t(it.label, lang), value: t(it.value, lang) }));
  } else {
    items = rawItems.map((it) => ({
      title: t(it.title, lang),
      subtitle: t(it.subtitle, lang),
      dates: translateDates(t(it.dates, lang), lang, dateTokens),
      url: it.url || "",
      description: t(it.description, lang),
      bullets: (it.bullets || []).map((b) => t(b, lang)),
    }));
  }
  return { id: section.id, label, layout, items };
}

// Deep-merge a variant onto base and resolve to a single language.
// lang: "es" (default) or any language defined in base.labels.
//
// Variant capabilities:
//   name, contact, headline, summary   -> replace if present
//   links                              -> replace the whole header-links array
//   experience: { <id>: { title?, company?, dates?, bullets? } }
//       -> shallow-merges onto the base entry with that id (override any field),
//          or defines a brand-new entry if the id is not in base.
//   experience_ids                      -> which entries to show and in what order.
//   skills: { <key>: { label?, value? } } -> override or add a skill section.
//   skills_order                        -> order/filter skill sections.
//   custom_sections: { <id>: { label?, layout?, items? } }
//       -> merge onto the base section with that id, or add a new one.
//   custom_sections_order               -> order/filter custom sections.
//   education, languages                -> replace the whole array if present.
function buildData(variant, lang = "es", base) {
  const src = JSON.parse(JSON.stringify(base)); // deep clone
  const dateTokens = src.dateTokens || {};

  // Scalars
  const name = t(variant.name ?? src.name, lang);
  const contact = t(variant.contact ?? src.contact, lang);
  const headline = variant.headline ? t(variant.headline, lang) : "";
  const summary = variant.summary ? t(variant.summary, lang) : "";

  // Header links (variant replaces the whole array)
  const links = (variant.links || src.links || []).map((l) => ({
    label: t(l.label, lang),
    url: l.url || "",
  }));

  // Experience: merge by id (override fields or add new)
  const expMap = new Map(src.experience.map((e) => [e.id, e]));
  if (variant.experience) {
    for (const [id, ov] of Object.entries(variant.experience)) {
      const existing = expMap.get(id) || { id };
      expMap.set(id, { ...existing, ...ov, id });
    }
  }
  let ids;
  if (variant.experience_ids) {
    ids = variant.experience_ids;
  } else {
    ids = src.experience.map((e) => e.id);
    for (const id of expMap.keys()) if (!ids.includes(id)) ids.push(id);
  }
  const experience = ids
    .map((id) => expMap.get(id))
    .filter(Boolean)
    .map((e) => ({
      title: t(e.title, lang),
      subtitle: t(e.company, lang),
      dates: translateDates(t(e.dates, lang), lang, dateTokens),
      url: "",
      description: "",
      bullets: (e.bullets || []).map((b) => t(b, lang)),
    }));

  // Education (variant may replace the whole array)
  const education = (variant.education || src.education).map((e) => ({
    degree: t(e.degree, lang),
    institution: t(e.institution, lang),
    dates: translateDates(t(e.dates, lang), lang, dateTokens),
  }));

  // Skills: merge by key (override label/value or add), then order/filter
  const skillsMerged = JSON.parse(JSON.stringify(src.skills));
  if (variant.skills) {
    for (const [key, ov] of Object.entries(variant.skills)) {
      skillsMerged[key] = { ...(skillsMerged[key] || {}), ...ov };
    }
  }
  const order = variant.skills_order || Object.keys(skillsMerged);
  const skills = {};
  for (const key of order) {
    if (skillsMerged[key]) {
      skills[key] = { label: t(skillsMerged[key].label, lang), value: t(skillsMerged[key].value, lang) };
    }
  }

  // Custom sections: merge by id (override or add), then order/filter
  const csMap = new Map((src.custom_sections || []).map((s) => [s.id, s]));
  if (variant.custom_sections) {
    for (const [id, ov] of Object.entries(variant.custom_sections)) {
      const existing = csMap.get(id) || { id };
      csMap.set(id, { ...existing, ...ov, id });
    }
  }
  let csIds;
  if (variant.custom_sections_order) {
    csIds = variant.custom_sections_order;
  } else {
    csIds = (src.custom_sections || []).map((s) => s.id);
    for (const id of csMap.keys()) if (!csIds.includes(id)) csIds.push(id);
  }
  const customSections = csIds
    .map((id) => csMap.get(id))
    .filter(Boolean)
    .map((s) => resolveSection(s, lang, dateTokens));

  // Languages (variant may replace the whole array)
  const languages = (variant.languages || src.languages).map((l) => t(l, lang));

  return {
    lang,
    labels: src.labels[lang] || src.labels.es || Object.values(src.labels)[0],
    name,
    contact,
    headline,
    summary,
    links,
    experience,
    education,
    skills,
    customSections,
    languages,
  };
}

// Built-in fallbacks for the cover letter closing when neither the variant
// nor base.labels.<lang>.closing define one.
const DEFAULT_CLOSINGS = { es: "Atentamente,", en: "Sincerely," };

// Resolve a variant's cover_letter to a single language.
//
// cover_letter fields (all translatable, only `body` required):
//   date       -> letter date line (default: today, localized to `lang`)
//   recipient  -> addressee (e.g. "Equipo de Selección")
//   company    -> company name
//   subject    -> subject/reference line
//   body       -> array of paragraphs
//   closing    -> sign-off (default: labels.closing, or "Atentamente,"/"Sincerely,")
//
// opts.today (Date) overrides the date used for the default date line.
function buildCoverLetter(variant, lang = "es", base, opts = {}) {
  const cl = variant.cover_letter;
  if (!cl) {
    throw new Error("The variant does not define cover_letter");
  }
  const labels = base.labels[lang] || base.labels.es || Object.values(base.labels)[0];
  const closing =
    t(cl.closing, lang) || labels.closing || DEFAULT_CLOSINGS[lang] || DEFAULT_CLOSINGS.en;
  const date = cl.date ? t(cl.date, lang) : formatDate(opts.today || new Date(), lang);

  return {
    lang,
    name: t(variant.name ?? base.name, lang),
    contact: t(variant.contact ?? base.contact, lang),
    date,
    recipient: t(cl.recipient, lang),
    company: t(cl.company, lang),
    subject: t(cl.subject, lang),
    body: (cl.body || []).map((p) => t(p, lang)),
    closing,
  };
}

// --- HTML rendering ------------------------------------------------------

function linksHTML(links) {
  if (!links.length) return "";
  const parts = links.map((l) =>
    l.url ? `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label || l.url)}</a>` : escapeHtml(l.label),
  );
  return `<div class="links">${parts.join(" · ")}</div>`;
}

// Render a list of "entry" items (experience or a custom entries section)
function entriesHTML(items) {
  return items
    .map((e) => {
      const titleInner = e.url
        ? `<a href="${escapeHtml(e.url)}">${escapeHtml(e.title)}</a>`
        : escapeHtml(e.title);
      const bullets = e.bullets && e.bullets.length
        ? `<ul>\n        ${e.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("\n        ")}\n      </ul>`
        : "";
      return `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${titleInner}</span>
        <span class="entry-dates">${escapeHtml(e.dates)}</span>
      </div>
      ${e.subtitle ? `<div class="entry-subtitle">${escapeHtml(e.subtitle)}</div>` : ""}
      ${e.description ? `<div class="entry-desc">${escapeHtml(e.description)}</div>` : ""}
      ${bullets}
    </div>`;
    })
    .join("");
}

function customSectionHTML(section) {
  let inner;
  if (section.layout === "list") {
    inner = `<ul>\n        ${section.items
      .map((it) => `<li class="list-item">${escapeHtml(it)}</li>`)
      .join("\n        ")}\n      </ul>`;
  } else if (section.layout === "inline") {
    inner = section.items
      .map(
        (it) =>
          `\n    <div class="inline-row"><span class="inline-label">${escapeHtml(it.label)}:</span> <span class="inline-value">${escapeHtml(it.value)}</span></div>`,
      )
      .join("");
  } else {
    inner = entriesHTML(section.items);
  }
  return `
<div class="section">
  <div class="section-title">${escapeHtml(section.label)}</div>
  ${inner}
</div>`;
}

// Render CV data to HTML string. themeName selects the visual theme (CSS).
function renderHTML(data, themeName) {
  const L = data.labels;
  const theme = getTheme(themeName);

  const skillsHTML = Object.values(data.skills)
    .map(
      (s) =>
        `\n    <div class="inline-row"><span class="inline-label">${escapeHtml(s.label)}:</span> <span class="inline-value">${escapeHtml(s.value)}</span></div>`,
    )
    .join("");

  const eduHTML = data.education
    .map(
      (e) =>
        `\n    <div class="edu-row"><strong>${escapeHtml(e.degree)}</strong> · ${escapeHtml(e.institution)} · ${escapeHtml(e.dates)}</div>`,
    )
    .join("");

  const customHTML = data.customSections.map(customSectionHTML).join("");

  return `<!DOCTYPE html>
<html lang="${escapeHtml(data.lang)}">
<head>
<meta charset="UTF-8">
<style>${theme.cv}</style>
</head>
<body>

<div class="header">
  <h1>${escapeHtml(data.name)}</h1>
  ${data.headline ? `<div class="headline">${escapeHtml(data.headline)}</div>` : ""}
  <div class="contact">${escapeHtml(data.contact)}</div>
  ${linksHTML(data.links)}
</div>

${
  data.summary
    ? `<div class="section">
  <div class="section-title">${escapeHtml(L.summary)}</div>
  <p class="summary">${escapeHtml(data.summary)}</p>
</div>`
    : ""
}

<div class="section">
  <div class="section-title">${escapeHtml(L.experience)}</div>
  ${entriesHTML(data.experience)}
</div>

<div class="section">
  <div class="section-title">${escapeHtml(L.education)}</div>
  ${eduHTML}
</div>

<div class="section">
  <div class="section-title">${escapeHtml(L.skills)}</div>
  ${skillsHTML}
</div>

<div class="section">
  <div class="section-title">${escapeHtml(L.languages)}</div>
  ${data.languages.map((l) => `<div class="lang">${escapeHtml(l)}</div>`).join("")}
</div>
${customHTML}

</body>
</html>`;
}

// --- Markdown rendering --------------------------------------------------

function entriesMarkdown(items, lines) {
  for (const e of items) {
    const title = e.url ? `[${e.title}](${e.url})` : e.title;
    lines.push(`\n### ${title}${e.dates ? ` — ${e.dates}` : ""}`);
    if (e.subtitle) lines.push(`*${e.subtitle}*\n`);
    if (e.description) lines.push(`${e.description}\n`);
    for (const b of e.bullets) lines.push(`- ${b}`);
  }
}

function customSectionMarkdown(section, lines) {
  lines.push(`\n## ${section.label}\n`);
  if (section.layout === "list") {
    for (const it of section.items) lines.push(`- ${it}`);
  } else if (section.layout === "inline") {
    for (const it of section.items) lines.push(`- **${it.label}:** ${it.value}`);
  } else {
    entriesMarkdown(section.items, lines);
  }
}

// Render CV data to Markdown string
function renderMarkdown(data) {
  const L = data.labels;
  const lines = [];

  lines.push(`# ${data.name}`);
  if (data.headline) lines.push(`\n**${data.headline}**`);
  lines.push(`\n${data.contact}`);
  if (data.links.length) {
    lines.push(`\n${data.links.map((l) => (l.url ? `[${l.label || l.url}](${l.url})` : l.label)).join(" · ")}`);
  }

  if (data.summary) {
    lines.push(`\n## ${L.summary}\n`);
    lines.push(data.summary);
  }

  lines.push(`\n## ${L.experience}`);
  entriesMarkdown(data.experience, lines);

  lines.push(`\n## ${L.education}\n`);
  for (const e of data.education) {
    lines.push(`- **${e.degree}** · ${e.institution} · ${e.dates}`);
  }

  lines.push(`\n## ${L.skills}\n`);
  for (const s of Object.values(data.skills)) {
    lines.push(`- **${s.label}:** ${s.value}`);
  }

  lines.push(`\n## ${L.languages}\n`);
  for (const l of data.languages) lines.push(`- ${l}`);

  for (const section of data.customSections) customSectionMarkdown(section, lines);

  return lines.join("\n") + "\n";
}

// --- Cover letter rendering ---------------------------------------------

function renderCoverLetterHTML(data, themeName) {
  const theme = getTheme(themeName);
  const paragraphs = data.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const recipientLines = [data.recipient, data.company]
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("\n  ");

  return `<!DOCTYPE html>
<html lang="${escapeHtml(data.lang)}">
<head>
<meta charset="UTF-8">
<style>${theme.cover}</style>
</head>
<body>

<div class="header">
  <h1>${escapeHtml(data.name)}</h1>
  <div class="contact">${escapeHtml(data.contact)}</div>
</div>

${data.date ? `<div class="date">${escapeHtml(data.date)}</div>` : ""}
${recipientLines ? `<div class="recipient">\n  ${recipientLines}\n</div>` : ""}
${data.subject ? `<div class="subject">${escapeHtml(data.subject)}</div>` : ""}

<div class="body">
${paragraphs}
</div>

<div class="closing">${escapeHtml(data.closing)}</div>
<div class="signature">${escapeHtml(data.name)}</div>

</body>
</html>`;
}

function renderCoverLetterMarkdown(data) {
  const lines = [];

  lines.push(`# ${data.name}`);
  lines.push(`\n${data.contact}`);
  if (data.date) lines.push(`\n${data.date}`);

  const recipient = [data.recipient, data.company].filter(Boolean);
  if (recipient.length) lines.push(`\n${recipient.join("  \n")}`);

  if (data.subject) lines.push(`\n**${data.subject}**`);

  lines.push("");
  for (const p of data.body) lines.push(`${p}\n`);

  lines.push(data.closing);
  lines.push(`\n**${data.name}**`);

  return lines.join("\n") + "\n";
}

module.exports = {
  supportedLangs,
  t,
  escapeHtml,
  formatDate,
  translateDates,
  resolveSection,
  buildData,
  buildCoverLetter,
  renderHTML,
  renderMarkdown,
  renderCoverLetterHTML,
  renderCoverLetterMarkdown,
};
