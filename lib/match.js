// lib/match.js — análisis determinista de una oferta laboral contra el CV.
//
// Sin LLM: extracción de keywords por heurísticas (frecuencia de n-gramas,
// siglas, términos técnicos, cross-check con las skills del CV) y score de
// cobertura ponderada. Es la base de la tool MCP analyze_job_match y del CLI
// match.js; la redacción inteligente la pone el cliente MCP (Claude) guiado
// por los prompts del servidor.

const { buildData, t, supportedLangs } = require("../template");

// Stopwords es/en + boilerplate típico de ofertas laborales. Lista corta a
// propósito: filtra ruido sin arriesgar términos técnicos.
const STOPWORDS = new Set([
  // español
  "a", "al", "algo", "ante", "antes", "as", "asi", "aunque", "bajo", "bien", "cada", "casi",
  "como", "con", "contra", "cual", "cuales", "cuando", "de", "del", "desde", "donde", "dos",
  "el", "ella", "ellos", "en", "entre", "era", "eres", "es", "esa", "ese", "eso", "esta",
  "estamos", "estan", "estar", "este", "esto", "estos", "fue", "ha", "hace", "hacer", "hacia",
  "han", "hasta", "hay", "la", "las", "le", "les", "lo", "los", "mas", "me", "mi", "mientras",
  "muy", "nos", "nuestra", "nuestro", "nuestros", "o", "os", "otra", "otros", "para", "pero",
  "poder", "por", "porque", "que", "se", "segun", "ser", "si", "sin", "sobre", "son", "su",
  "sus", "tambien", "tanto", "te", "tener", "ti", "tiene", "tienes", "toda", "todas", "todo",
  "todos", "tu", "un", "una", "uno", "unos", "y", "ya",
  // inglés
  "an", "and", "any", "are", "as", "at", "be", "been", "being", "both", "but", "by", "can",
  "do", "does", "for", "from", "had", "has", "have", "if", "in", "into", "is", "it", "its",
  "may", "more", "most", "not", "of", "on", "or", "our", "out", "over", "such", "than", "that",
  "the", "their", "them", "then", "these", "they", "this", "those", "through", "to", "under",
  "up", "us", "was", "we", "well", "were", "what", "when", "where", "which", "while", "who",
  "will", "with", "within", "would", "you", "your",
  // boilerplate de ofertas (es/en)
  "anos", "años", "aptitudes", "beneficios", "buscamos", "candidato", "cargo", "cliente",
  "company", "conocimiento", "conocimientos", "deseable", "deseables", "empresa", "equipo",
  "experiencia", "excluyente", "excluyentes", "funciones", "habilidades", "important", "job",
  "manejo", "minimo", "nivel", "oferta", "ofrecemos", "plus", "posicion", "puesto", "renta",
  "requerimos", "requisitos", "responsabilidades", "responsibilities", "requirements", "rol",
  "role", "skills", "solido", "solidos", "strong", "team", "trabajar", "trabajo", "usando",
  "using", "vacante", "valoramos", "work", "working", "years",
]);

// Palabras funcionales distintivas por idioma (sin solaparse entre sí):
// bastan para detectar en qué idioma está redactada una oferta. Se comparan
// ya normalizadas (sin acentos), igual que tokenize().
const LANG_MARKERS = {
  es: new Set([
    "el", "la", "los", "las", "de", "del", "que", "para", "con", "una", "por",
    "como", "mas", "anos", "experiencia", "conocimientos", "buscamos",
    "requisitos", "habilidades", "equipo", "empresa", "desarrollo",
  ]),
  en: new Set([
    "the", "and", "with", "for", "you", "your", "our", "are", "will", "of",
    "to", "in", "is", "we", "experience", "skills", "team", "requirements",
    "years", "strong", "ability", "knowledge",
  ]),
};

// Detecta el idioma de un texto (p. ej. una oferta) contando marcadores por
// idioma. langs limita los candidatos (p. ej. los idiomas del CV); si se
// omite, compite todo LANG_MARKERS. Devuelve null si no hay señal clara
// (empate o cero marcadores) — el caller decide el fallback.
function detectLang(text, langs) {
  const candidates = (langs || Object.keys(LANG_MARKERS)).filter((l) => LANG_MARKERS[l]);
  if (!candidates.length) return null;
  const tokens = tokenize(text);
  const counts = candidates.map((lang) => {
    let n = 0;
    for (const tok of tokens) if (LANG_MARKERS[lang].has(tok)) n++;
    return { lang, n };
  });
  counts.sort((a, b) => b.n - a.n);
  if (!counts[0].n || (counts[1] && counts[1].n === counts[0].n)) return null;
  return counts[0].lang;
}

// Resuelve el idioma efectivo de un análisis: el explícito si viene; si no,
// el detectado en la oferta (entre los idiomas del CV); si no, el pivote.
function resolveLang(jobText, base, lang) {
  if (lang) return lang;
  const langs = supportedLangs(base);
  return detectLang(jobText, langs) || langs[0];
}

// Combina las stopwords embebidas (es/en) con extras del usuario
// (base.stopwords): así el match funciona bien en otros idiomas o dominios.
function withExtraStopwords(extra) {
  if (!extra || !extra.length) return STOPWORDS;
  return new Set([...STOPWORDS, ...extra.map((w) => normalize(w))]);
}

// Quita acentos y baja a minúsculas para comparar de forma robusta.
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Tokeniza texto normalizado conservando separadores técnicos internos
// (c++, c#, .net, node.js, ci/cd, angular-12).
function tokenize(text) {
  const cleaned = normalize(text).replace(/[^a-z0-9+#./-]+/g, " ");
  return cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, "")) // puntuación colgante, no la interna
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

// Siglas del texto original (AWS, CI/CD, K8S…): 2–6 mayúsculas/dígitos.
function extractAcronyms(rawText, stop = STOPWORDS) {
  const out = new Set();
  for (const m of String(rawText || "").matchAll(/\b[A-Z][A-Z0-9/]{1,5}\b/g)) {
    const tok = normalize(m[0]).replace(/^[/]+|[/]+$/g, "");
    if (tok.length >= 2 && !stop.has(tok) && !/^\d+$/.test(tok)) out.add(tok);
  }
  return out;
}

// Un token "parece técnico" si lleva dígitos o símbolos de stack (.net, c++).
function looksTechnical(token) {
  return /[0-9+#./]/.test(token);
}

// Palabras que en el texto original SOLO aparecen capitalizadas (Terraform,
// Kafka): suelen ser nombres propios de tecnologías, valen aunque se
// mencionen una sola vez. Si la misma palabra aparece también en minúsculas
// en el texto, se descarta (es una palabra común capitalizada por posición).
function extractProperNouns(rawText, stop = STOPWORDS) {
  const raw = String(rawText || "");
  const lowerWords = new Set();
  for (const m of raw.matchAll(/\b[a-z][a-z0-9.+#]{2,}\b/g)) lowerWords.add(normalize(m[0]));

  const out = new Set();
  for (const m of raw.matchAll(/\b[A-Z][a-z][a-zA-Z0-9.+#]{1,}\b/g)) {
    const tok = normalize(m[0]);
    if (tok.length >= 3 && !lowerWords.has(tok) && !stop.has(tok)) out.add(tok);
  }
  return out;
}

// Extrae keywords ponderadas de una oferta. opts.knownTerms (Set de términos
// normalizados, p. ej. las skills del CV) sube el peso de los términos que el
// candidato ya cubre — cross-check bidireccional oferta↔CV.
function extractKeywords(jobText, opts = {}) {
  const knownTerms = opts.knownTerms || new Set();
  const top = opts.top || 40;
  const stop = withExtraStopwords(opts.extraStopwords);
  const tokens = tokenize(jobText);
  const acronyms = extractAcronyms(jobText, stop);
  const properNouns = extractProperNouns(jobText, stop);

  const weights = new Map();
  const bump = (kw, w) => weights.set(kw, (weights.get(kw) || 0) + w);

  // Unigramas por frecuencia
  const freq = new Map();
  for (const t of tokens) {
    if (stop.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  for (const [t, f] of freq) {
    const isAcronym = acronyms.has(t);
    const isKnown = knownTerms.has(t);
    const isProperNoun = properNouns.has(t);
    // Un término mencionado una sola vez entra solo si tiene señal técnica
    // (dígitos/símbolos), es sigla, nombre propio o skill conocida del CV.
    if (f < 2 && !isAcronym && !isKnown && !isProperNoun && !looksTechnical(t)) continue;
    let w = f;
    if (isAcronym) w *= 2;
    if (isKnown) w *= 2;
    bump(t, w);
  }

  // Bigramas frecuentes o conocidos ("spring boot", "machine learning")
  const bigramFreq = new Map();
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (stop.has(a) || stop.has(b)) continue;
    const bg = `${a} ${b}`;
    bigramFreq.set(bg, (bigramFreq.get(bg) || 0) + 1);
  }
  for (const [bg, f] of bigramFreq) {
    const isKnown = knownTerms.has(bg);
    if (f < 2 && !isKnown) continue;
    let w = f * 1.5;
    if (isKnown) w *= 2;
    bump(bg, w);
  }

  return [...weights.entries()]
    .map(([keyword, weight]) => ({ keyword, weight: Math.round(weight * 10) / 10 }))
    .sort((x, y) => y.weight - x.weight)
    .slice(0, top);
}

// Términos de las skills del CV (normalizados): valores separados por comas,
// como unigramas y frase completa ("spring boot").
function skillTerms(data, stop = STOPWORDS) {
  const terms = new Set();
  for (const s of Object.values(data.skills || {})) {
    for (const part of String(s.value || "").split(/[,;·]/)) {
      const toks = tokenize(part);
      if (!toks.length) continue;
      for (const tok of toks) if (!stop.has(tok)) terms.add(tok);
      if (toks.length > 1) terms.add(toks.join(" "));
    }
  }
  return terms;
}

// Secciones de texto del CV resuelto (para reportar dónde matchea cada keyword).
function cvSections(data) {
  const sections = [];
  const add = (name, texts) => {
    const text = texts.filter(Boolean).join(" \n ");
    const tokens = tokenize(text);
    sections.push({ name, tokens: new Set(tokens), text: tokens.join(" ") });
  };

  add("headline", [data.headline]);
  add("summary", [data.summary]);
  add(
    "experience",
    data.experience.flatMap((e) => [e.title, e.subtitle, ...(e.bullets || [])]),
  );
  add("skills", Object.values(data.skills || {}).flatMap((s) => [s.label, s.value]));
  add("education", data.education.flatMap((e) => [e.degree, e.institution]));
  add(
    "custom_sections",
    (data.customSections || []).flatMap((s) => [
      s.label,
      ...s.items.flatMap((it) =>
        typeof it === "string" ? [it] : [it.title, it.subtitle, it.description, it.label, it.value, ...(it.bullets || [])],
      ),
    ]),
  );
  add("languages", data.languages || []);
  return sections;
}

// ¿La keyword (uni o multi-palabra) aparece en la sección? Para unigramas se
// exige token exacto (evita que "java" matchee dentro de "javascript").
function sectionHas(section, keyword) {
  if (!keyword.includes(" ")) return section.tokens.has(keyword);
  return section.text.includes(keyword);
}

// Texto plano del CV resuelto (variant + idioma), útil para debugging y tests.
function cvCorpus(base, variant = {}, lang = "es") {
  const data = buildData(variant, lang, base);
  return cvSections(data)
    .map((s) => s.text)
    .join(" \n ");
}

// Reporte de match: score 0–100 de cobertura ponderada + detalle por keyword.
// Sin lang explícito, se evalúa el CV en el idioma detectado de la oferta
// (una oferta en inglés se compara contra la versión en inglés del CV): si
// no, los términos descriptivos nunca cruzan y el score se desploma.
function matchJob(jobText, base, variant = {}, lang = null) {
  lang = resolveLang(jobText, base, lang);
  const data = buildData(variant, lang, base);
  const stop = withExtraStopwords(base.stopwords);
  const keywords = extractKeywords(jobText, {
    knownTerms: skillTerms(data, stop),
    extraStopwords: base.stopwords,
  });
  const sections = cvSections(data);

  const matched = [];
  const missing = [];
  let total = 0;
  let covered = 0;

  for (const { keyword, weight } of keywords) {
    total += weight;
    const where = sections.filter((s) => sectionHas(s, keyword)).map((s) => s.name);
    if (where.length) {
      covered += weight;
      matched.push({ keyword, weight, where });
    } else {
      missing.push({ keyword, weight });
    }
  }

  return {
    lang,
    score: total ? Math.round((covered / total) * 100) : 0,
    keywords: keywords.length,
    matched,
    missing,
  };
}

// Rankea variants por score contra la oferta. variantsMap: { nombre: variant }.
// El idioma se resuelve una vez (explícito → detectado → pivote) para que
// todas las variants compitan en igualdad de condiciones.
function rankVariants(jobText, base, variantsMap, lang = null) {
  lang = resolveLang(jobText, base, lang);
  return Object.entries(variantsMap)
    .map(([name, variant]) => {
      const report = matchJob(jobText, base, variant, lang);
      return { name, score: report.score, missingTop: report.missing.slice(0, 5).map((m) => m.keyword) };
    })
    .sort((a, b) => b.score - a.score);
}

// Rankea logros del banco (achievements.json) contra una oferta: para cada
// logro suma el peso de las keywords de la oferta presentes en su texto,
// skills y tags. Devuelve [{ id, score, matched }] ordenado, solo los > 0
// (salvo que top pida más de los disponibles).
function rankAchievements(jobText, achievements, lang = null, opts = {}) {
  lang = lang || detectLang(jobText, opts.langs) || "es";
  const top = opts.top || 10;
  const keywords = extractKeywords(jobText, { extraStopwords: opts.extraStopwords });

  const scored = achievements.map((a) => {
    const text = [
      t(a.text, lang),
      a.metric,
      ...(a.skills || []),
      ...(a.tags || []),
    ]
      .filter(Boolean)
      .join(" ");
    const tokens = new Set(tokenize(text));
    const joined = [...tokenize(text)].join(" ");

    let score = 0;
    const matched = [];
    for (const { keyword, weight } of keywords) {
      const hit = keyword.includes(" ") ? joined.includes(keyword) : tokens.has(keyword);
      if (hit) {
        score += weight;
        matched.push(keyword);
      }
    }
    return { id: a.id, score: Math.round(score * 10) / 10, matched };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

module.exports = { STOPWORDS, normalize, tokenize, detectLang, extractKeywords, cvCorpus, matchJob, rankVariants, rankAchievements };
