// lib/lint.js — lint determinista del CV (sin LLM).
//
// Revisa el CV ya resuelto (variant + idioma, vía buildData) contra buenas
// prácticas medibles: largo de bullets, presencia de métricas, arranques
// débiles, repetición de términos. La crítica cualitativa (impacto, tono,
// tiempos verbales) la hace el cliente MCP con el prompt review_cv, usando
// este reporte como punto de partida.

const { buildData } = require("../template");
const { STOPWORDS, normalize, tokenize } = require("./match");

const LIMITS = {
  bulletMax: 240,
  bulletMin: 20,
  bulletsPerEntryMax: 6,
  recentEntryBulletsMin: 2,
  summaryMin: 40,
  summaryMax: 450,
  repeatedTokenMin: 6,
};

// Arranques que diluyen el logro (mejor verbo de acción directo).
const WEAK_STARTERS = [
  // español
  "ayude a", "participe en", "apoye en", "apoye a", "colabore en", "colabore con",
  "estuve a cargo", "fui responsable", "encargado de", "encargada de", "a cargo de",
  // inglés
  "helped", "worked on", "assisted", "participated in", "was responsible for",
  "responsible for", "involved in", "tasked with",
];

function hasMetric(text) {
  return /[0-9%]/.test(text);
}

function weakStarter(text, starters = WEAK_STARTERS) {
  const t = normalize(text).trim();
  return starters.find((w) => t.startsWith(w)) || null;
}

// Lint del CV resuelto. Devuelve { findings: [{ severity, where, message }] }.
// severity: "warn" (conviene arreglar) | "info" (sugerencia).
function lintCV(base, variant = {}, lang = "es") {
  const data = buildData(variant, lang, base);
  const findings = [];
  const add = (severity, where, message) => findings.push({ severity, where, message });

  // Built-in es/en weak openers + user extras (base.weak_starters) for other
  // languages or house style.
  const starters = base.weak_starters && base.weak_starters.length
    ? [...WEAK_STARTERS, ...base.weak_starters.map((w) => normalize(w))]
    : WEAK_STARTERS;

  // Header
  if (!data.headline) add("info", "headline", "No headline: a one-line positioning statement under the name helps the first glance.");
  if (!data.links.length) add("info", "links", "No header links (GitHub/portfolio give verifiable signal).");

  // Summary
  if (!data.summary) {
    add("info", "summary", "No professional summary: 2-3 role-oriented lines improve the first match.");
  } else {
    if (data.summary.length < LIMITS.summaryMin) add("warn", "summary", `Summary too short (${data.summary.length} chars; suggested minimum ${LIMITS.summaryMin}).`);
    if (data.summary.length > LIMITS.summaryMax) add("warn", "summary", `Summary too long (${data.summary.length} chars; suggested maximum ${LIMITS.summaryMax}).`);
  }

  // Experiencia
  let bulletsTotal = 0;
  let bulletsWithoutMetric = 0;
  data.experience.forEach((entry, i) => {
    const id = `experience "${entry.title}"`;
    const bullets = entry.bullets || [];
    bulletsTotal += bullets.length;

    if (bullets.length > LIMITS.bulletsPerEntryMax) {
      add("warn", id, `${bullets.length} bullets (suggested maximum ${LIMITS.bulletsPerEntryMax}: keep the highest-impact ones).`);
    }
    if (i === 0 && bullets.length < LIMITS.recentEntryBulletsMin) {
      add("info", id, `The most recent role has only ${bullets.length} bullet(s); it usually carries the most weight.`);
    }

    bullets.forEach((b, j) => {
      const where = `${id} bullet ${j + 1}`;
      if (b.length > LIMITS.bulletMax) add("warn", where, `Bullet is ${b.length} chars (suggested maximum ${LIMITS.bulletMax}: split or trim it).`);
      else if (b.length < LIMITS.bulletMin) add("info", where, `Bullet too short (${b.length} chars): add context or impact.`);
      if (!hasMetric(b)) bulletsWithoutMetric++;
      const weak = weakStarter(b, starters);
      if (weak) add("warn", where, `Weak opener ("${weak}…"): use a direct action verb (designed, led, reduced…).`);
    });
  });

  if (bulletsTotal && bulletsWithoutMetric / bulletsTotal > 0.5) {
    add(
      "info",
      "experience",
      `${bulletsWithoutMetric} of ${bulletsTotal} bullets have no numbers or metrics: quantified impact (%, volume, time) builds credibility.`,
    );
  }

  // Repetición de términos en bullets (diluye; conviene variar vocabulario)
  const freq = new Map();
  for (const entry of data.experience) {
    for (const b of entry.bullets || []) {
      for (const t of tokenize(b)) {
        if (t.length < 4 || STOPWORDS.has(t)) continue;
        freq.set(t, (freq.get(t) || 0) + 1);
      }
    }
  }
  for (const [t, f] of freq) {
    if (f >= LIMITS.repeatedTokenMin) {
      add("info", "experience", `"${t}" appears ${f} times across bullets: vary the vocabulary or consolidate.`);
    }
  }

  return { lang, findings };
}

module.exports = { lintCV, LIMITS };
