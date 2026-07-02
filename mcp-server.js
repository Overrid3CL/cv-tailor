#!/usr/bin/env node
// mcp-server.js — MCP server (stdio) to read/edit the CV.
//
// Exposes base.json, variants/*.json, achievements.json and applications.json
// as tools, resources and prompts so any MCP client (the user's AI agent) can
// query and update the CV. Every write is validated against
// schemas/*.schema.json plus the semantic checks in lib/validate.js before
// touching disk. The server never calls an LLM and needs no API key: the
// intelligence comes from the MCP client.
//
// Registration (project .mcp.json or any MCP client config):
//   { "mcpServers": { "cv-tailor": { "command": "node", "args": ["mcp-server.js"] } } }

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const store = require("./lib/store");
const config = require("./lib/config");
const { supportedLangs, t } = require("./template");
const { themeNames, DEFAULT_THEME } = require("./templates");
const { jsonResumeToBase, slugify } = require("./lib/jsonresume");
const { matchJob, rankVariants, rankAchievements } = require("./lib/match");
const { lintCV } = require("./lib/lint");
const { findMissingTranslations } = require("./lib/i18n");

// Languages are derived from base.json in the data directory. If it does not
// exist yet (empty project), fall back to es/en so the server can still start.
let SUPPORTED_LANGS;
try {
  SUPPORTED_LANGS = supportedLangs(config.loadBase());
} catch {
  SUPPORTED_LANGS = ["es", "en"];
}
const SUPPORTED_DOCS = ["cv", "cover"];
const SUPPORTED_FORMATS = ["pdf", "md", "html", "docx"];

const TOOLS = [
  {
    name: "get_base",
    description:
      "Returns the full base.json: the canonical CV (name, contact, labels, experience with ids, education, skills with keys, languages). Use it to learn the available experience ids and skill keys before editing variants.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_base",
    description:
      "Replaces the whole base.json. The document is validated against the schema and rejected if it would break references in existing variants. For targeted changes prefer update_base_section.",
    inputSchema: {
      type: "object",
      required: ["data"],
      additionalProperties: false,
      properties: {
        data: { type: "object", description: "The complete base document (see schemas/base.schema.json)." },
      },
    },
  },
  {
    name: "update_base_section",
    description:
      "Updates one top-level section of base.json (name, contact, labels, dateTokens, links, experience, education, skills, custom_sections, languages, stopwords or weak_starters) leaving the rest untouched. The resulting document is fully validated before writing.",
    inputSchema: {
      type: "object",
      required: ["section", "value"],
      additionalProperties: false,
      properties: {
        section: {
          type: "string",
          enum: [
            "name",
            "contact",
            "labels",
            "dateTokens",
            "links",
            "experience",
            "education",
            "skills",
            "custom_sections",
            "languages",
            "stopwords",
            "weak_starters",
          ],
        },
        value: { description: "New value for the section (in the shape required by the schema for that section)." },
      },
    },
  },
  {
    name: "import_json_resume",
    description:
      "Converts a JSON Resume CV (https://jsonresume.org/schema) into base.json and writes it (validated). Replaces the whole base.json; use it to start from an existing CV in that format.",
    inputSchema: {
      type: "object",
      required: ["resume"],
      additionalProperties: false,
      properties: {
        resume: { type: "object", description: "The complete JSON Resume document." },
      },
    },
  },
  {
    name: "list_variants",
    description: "Lists the available variants with a summary (headline and which fields they override).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_variant",
    description: "Returns the content of variants/<name>.json.",
    inputSchema: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string", description: "Variant name (without .json)." } },
    },
  },
  {
    name: "upsert_variant",
    description:
      "Creates or replaces variants/<name>.json. Validated against the variant schema and against base.json (referenced experience ids and skill keys must exist; new entries must be complete). Include only the fields the variant overrides.",
    inputSchema: {
      type: "object",
      required: ["name", "data"],
      additionalProperties: false,
      properties: {
        name: { type: "string", description: "Kebab-case variant name (without .json)." },
        data: { type: "object", description: "The variant overrides (see schemas/variant.schema.json)." },
      },
    },
  },
  {
    name: "delete_variant",
    description: "Deletes variants/<name>.json.",
    inputSchema: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string" } },
    },
  },
  {
    name: "validate",
    description:
      "Validates base.json and every variant (schema + semantic checks) and returns a per-file report. Useful after manual edits outside the MCP.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "generate_cv",
    description:
      "Generates documents for one or more variants by running generate.js. doc: cv (default), cover (requires cover_letter) or all. format: pdf, md, html, docx or all (default: pdf+md). template: visual theme. Returns the paths of the generated files. For SEVERAL variants, prefer ONE call with a comma-separated list (or \"all\") over many single calls: the whole batch shares one browser instance. Concurrent calls are queued, not parallel.",
    inputSchema: {
      type: "object",
      required: ["variant"],
      additionalProperties: false,
      properties: {
        variant: { type: "string", description: "Variant name (without .json), a comma-separated list (\"acme,globex\") or \"all\" for every variant — batches run in a single pass." },
        lang: {
          type: "string",
          enum: [...SUPPORTED_LANGS, "all"],
          description: "Language to generate (default: es).",
        },
        doc: {
          type: "string",
          enum: [...SUPPORTED_DOCS, "all"],
          description: "Document to generate: cv (default), cover or all.",
        },
        format: {
          type: "string",
          enum: [...SUPPORTED_FORMATS, "all"],
          description: "Output format (default: pdf+md).",
        },
        template: {
          type: "string",
          enum: themeNames(),
          description: `Visual theme (default: ${DEFAULT_THEME}).`,
        },
      },
    },
  },
  {
    name: "analyze_job_match",
    description:
      "Analyzes a job posting against the CV (deterministic, no LLM): 0-100 weighted-coverage score, covered keywords (and where) and missing ones. With variant it evaluates that variant; without it, it evaluates the base and also ranks every variant. Use it BEFORE tailoring the CV to a posting and AFTER to verify the improvement.",
    inputSchema: {
      type: "object",
      required: ["job"],
      additionalProperties: false,
      properties: {
        job: { type: "string", description: "Full job posting text." },
        variant: { type: "string", description: "Variant to evaluate (omit to evaluate the base and rank all)." },
        lang: { type: "string", enum: SUPPORTED_LANGS, description: "CV language to evaluate. Omit to auto-detect from the posting's language (recommended): an English posting is matched against the English CV. The report includes the language used." },
      },
    },
  },
  {
    name: "list_achievements",
    description:
      "Lists the achievements bank (achievements.json): granular achievements with tags, skills and metrics — more material than fits in the CV. Optional filter by tag or skill. Optional file: returns an empty list if it does not exist.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        tag: { type: "string", description: "Filter by tag (exact, case-insensitive)." },
        skill: { type: "string", description: "Filter by skill (exact, case-insensitive)." },
      },
    },
  },
  {
    name: "upsert_achievement",
    description:
      "Creates or updates one achievement in the bank (by id). Validated against the schema (kebab-case id, translatable text) and against base.json (source must be an existing experience id).",
    inputSchema: {
      type: "object",
      required: ["achievement"],
      additionalProperties: false,
      properties: {
        achievement: {
          type: "object",
          description: "Full achievement: { id, text, tags?, skills?, metric?, source? } (see schemas/achievements.schema.json).",
        },
      },
    },
  },
  {
    name: "delete_achievement",
    description: "Deletes one achievement from the bank by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "suggest_achievements",
    description:
      "Ranks (deterministically) the bank achievements most relevant to a job posting, by keyword overlap with each achievement's text/skills/tags. Use it while tailoring the CV to pick which real material to highlight.",
    inputSchema: {
      type: "object",
      required: ["job"],
      additionalProperties: false,
      properties: {
        job: { type: "string", description: "Full job posting text." },
        top: { type: "number", description: "How many achievements to return (default: 10)." },
        lang: { type: "string", enum: SUPPORTED_LANGS, description: "Language of the achievement texts. Omit to auto-detect from the posting's language." },
      },
    },
  },
  {
    name: "lint_cv",
    description:
      "Checks the resolved CV (variant + language) against measurable best practices, no LLM: bullet/summary lengths, bullets without metrics, weak openers, repeated terms. The starting point for the review_cv prompt.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        variant: { type: "string", description: "Variant to check (omit to check the base)." },
        lang: { type: "string", enum: SUPPORTED_LANGS, description: "Language to check (default: es)." },
      },
    },
  },
  {
    name: "find_missing_translations",
    description:
      "Finds the translatable fields missing a given language, with their exact path and the source text (pivot language). Use it with the translate_cv prompt to complete a new or partial language.",
    inputSchema: {
      type: "object",
      required: ["lang"],
      additionalProperties: false,
      properties: {
        lang: { type: "string", description: "Language to check (e.g. \"en\", \"fr\")." },
        scope: {
          type: "string",
          enum: ["base", "variants", "all"],
          description: "Which documents to inspect (default: all).",
        },
      },
    },
  },
  {
    name: "log_application",
    description:
      "Logs a job application in applications.json (in the user's data directory) and freezes a snapshot in applications/<id>/: the exact PDF sent, the variant at that moment and the job posting. If job_text is given, it computes and stores the match_score. Use it at the end of the tailoring flow, once the user confirms they applied.",
    inputSchema: {
      type: "object",
      required: ["company", "role", "variant"],
      additionalProperties: false,
      properties: {
        company: { type: "string" },
        role: { type: "string", description: "Role applied for." },
        variant: { type: "string", description: "Variant sent (must exist)." },
        lang: { type: "string", enum: SUPPORTED_LANGS, description: "Language of the CV sent (default: es)." },
        date: { type: "string", description: "Date sent, ISO YYYY-MM-DD (default: today)." },
        job_url: { type: "string" },
        job_text: { type: "string", description: "Job posting text: stores the match_score and feeds interview_prep." },
        notes: { type: "string" },
        id: { type: "string", description: "Kebab-case id (default: YYYY-MM-company-variant)." },
      },
    },
  },
  {
    name: "update_application",
    description:
      "Updates an application: status (sent|interview|offer|rejected|ghosted), notes or job link. Sets the last-updated date automatically.",
    inputSchema: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["sent", "interview", "offer", "rejected", "ghosted"] },
        notes: { type: "string" },
        job_url: { type: "string" },
      },
    },
  },
  {
    name: "list_applications",
    description:
      "Lists applications (ordered by date desc), each with a computed days_since_update — useful to detect stalled applications. Optional filter by status.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["sent", "interview", "offer", "rejected", "ghosted"] },
      },
    },
  },
  {
    name: "delete_application",
    description:
      "Removes an application from the log. The snapshot in applications/<id>/ is kept unless delete_snapshot is true.",
    inputSchema: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        delete_snapshot: { type: "boolean", description: "Also delete applications/<id>/ (default: false)." },
      },
    },
  },
];

// Prompts: conversation templates the MCP client can insert. The intelligence
// comes from the client agent (the user's own subscription); the prompts
// orchestrate the server's deterministic tools step by step. Every prompt
// instructs the agent to interact with the user in the user's language.
const PROMPTS = [
  {
    name: "tailor_cv",
    description:
      "Tailors a CV variant (and optionally a cover letter) to a job posting: analyzes the match, picks real achievements, rewrites the variant and verifies the score improvement.",
    arguments: [
      { name: "job", description: "Job posting text.", required: true },
      { name: "variant", description: "Variant name to create/update (default: tailored).", required: false },
      { name: "cover_letter", description: "If 'true', also include a cover letter.", required: false },
      { name: "lang", description: "Main working language (default: es).", required: false },
    ],
  },
  {
    name: "review_cv",
    description:
      "Reviews the CV with the deterministic lint + a qualitative critique (impact, specificity, consistency) and proposes concrete rewrites.",
    arguments: [
      { name: "variant", description: "Variant to review (omit to review the base).", required: false },
      { name: "lang", description: "Language to review (default: es).", required: false },
    ],
  },
  {
    name: "translate_cv",
    description:
      "Completes the missing translations for a language across base.json and the variants (or adds a new language), always writing validated.",
    arguments: [
      { name: "lang", description: "Target language (e.g. \"en\", \"fr\").", required: true },
    ],
  },
  {
    name: "mine_achievements",
    description:
      "Interviews the user to extract concrete achievements (with metrics) and populate the achievements bank — the raw material for tailoring.",
    arguments: [
      { name: "focus", description: "Topic or role to mine (e.g. \"leadership\", \"backend\").", required: false },
      { name: "source", description: "Id of a specific base.json experience entry to dig into.", required: false },
    ],
  },
  {
    name: "interview_prep",
    description:
      "Prepares an interview: likely questions (technical, behavioral and about the match gaps) with which achievement to use in each answer (STAR format).",
    arguments: [
      { name: "job", description: "Job posting text.", required: false },
      { name: "application", description: "Id of a tracked application (uses its stored posting and variant).", required: false },
      { name: "lang", description: "Working language (default: es).", required: false },
    ],
  },
  {
    name: "follow_up_applications",
    description:
      "Reviews the application tracker: detects stalled applications and proposes the next action for each one.",
    arguments: [],
  },
];

function json(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function toolError(err) {
  const lines = [err.message];
  if (err.errors && err.errors.length) lines.push(...err.errors.map((e) => `  - ${e}`));
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

// Cola de generación: cada corrida de generate.js con PDF lanza un Chromium
// (~cientos de MB); llamadas concurrentes se serializan para no saturar la
// máquina cuando el cliente dispara muchos generate_cv seguidos.
let generateChain = Promise.resolve();
function enqueueGenerate(task) {
  const run = generateChain.then(task, task);
  generateChain = run.then(() => undefined, () => undefined);
  return run;
}

function runGenerate(variant, lang, doc, format, template) {
  return enqueueGenerate(() => new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, "generate.js"), // the code travels with the package
      "--variant", variant,
      "--lang", lang,
      "--doc", doc,
      "--format", format,
      "--template", template,
    ];
    // The child must operate on the same data directory as this server.
    const opts = { cwd: config.DATA_DIR, env: { ...process.env, CV_DIR: config.DATA_DIR }, timeout: 120000 };
    execFile(process.execPath, args, opts, (err, stdout, stderr) => {
      if (err) reject(new Error(`generate.js failed: ${stderr || stdout || err.message}`));
      else resolve(stdout);
    });
  }));
}

function variantSummary(name) {
  const v = store.readVariant(name);
  return {
    name,
    headline: v.headline !== undefined ? t(v.headline, "es") : undefined,
    overrides: Object.keys(v),
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function handleTool(name, args) {
  switch (name) {
    case "get_base":
      return json(store.readBase());

    case "update_base":
      store.writeBase(args.data);
      return json({ ok: true, message: "base.json updated" });

    case "update_base_section": {
      const base = store.readBase();
      base[args.section] = args.value;
      store.writeBase(base);
      return json({ ok: true, message: `base.json: section "${args.section}" updated` });
    }

    case "import_json_resume": {
      const base = jsonResumeToBase(args.resume);
      store.writeBase(base);
      return json({
        ok: true,
        message: "base.json imported from JSON Resume",
        summary: {
          experience: base.experience.length,
          skills: Object.keys(base.skills).length,
          education: base.education.length,
        },
      });
    }

    case "list_variants":
      return json(store.listVariantNames().map(variantSummary));

    case "get_variant":
      return json(store.readVariant(args.name));

    case "upsert_variant": {
      const existed = store.variantExists(args.name);
      store.writeVariant(args.name, args.data);
      return json({ ok: true, message: `variants/${args.name}.json ${existed ? "updated" : "created"}` });
    }

    case "delete_variant":
      store.deleteVariant(args.name);
      return json({ ok: true, message: `variants/${args.name}.json deleted` });

    case "validate":
      return json(store.validateAll());

    case "generate_cv": {
      const lang = args.lang || "es";
      const doc = args.doc || "cv";
      const format = args.format || "pdf,md";
      const template = args.template || DEFAULT_THEME;
      // variant: nombre, lista "a,b,c" o "all". El lote corre en UNA pasada
      // de generate.js — un único Chromium para todos los PDFs.
      const names =
        args.variant === "all"
          ? store.listVariantNames()
          : [...new Set(String(args.variant).split(",").map((v) => v.trim()).filter(Boolean))];
      if (!names.length) throw new Error("No variants to generate.");
      for (const n of names) {
        if (!store.variantExists(n)) throw new Error(`Variant not found: ${n}`);
      }
      const variantsByName = new Map(names.map((n) => [n, store.readVariant(n)]));
      if (doc === "cover") {
        for (const [n, v] of variantsByName) {
          if (!v.cover_letter) throw new Error(`Variant "${n}" does not define cover_letter (required by doc: cover)`);
        }
      }
      const stdout = await runGenerate(args.variant === "all" ? "all" : names.join(","), lang, doc, format, template);
      const langs = lang === "all" ? SUPPORTED_LANGS : [lang];
      const exts = format === "all" ? SUPPORTED_FORMATS : format.split(",").map((f) => f.trim()).filter(Boolean);
      const files = names.flatMap((name) => {
        const variant = variantsByName.get(name);
        const docs = doc === "all" ? (variant.cover_letter ? SUPPORTED_DOCS : ["cv"]) : [doc];
        const dir = path.join(config.outputDir(), name);
        return docs.flatMap((d) => {
          const prefix = d === "cover" ? "cover-letter" : "cv";
          return langs.flatMap((l) =>
            exts.map((ext) => path.join(dir, `${prefix}-${name}-${l}.${ext}`)),
          );
        });
      });
      return json({ ok: true, files, log: stdout.trim() });
    }

    case "analyze_job_match": {
      // lang null → matchJob/rankVariants detectan el idioma de la oferta y
      // evalúan el CV en ese idioma (el reporte incluye cuál se usó).
      const lang = args.lang || null;
      const base = store.readBase();
      if (args.variant) {
        const variant = store.readVariant(args.variant);
        return json({ variant: args.variant, ...matchJob(args.job, base, variant, lang) });
      }
      const variantsMap = Object.fromEntries(store.listVariantNames().map((n) => [n, store.readVariant(n)]));
      return json({
        base: matchJob(args.job, base, {}, lang),
        ranking: rankVariants(args.job, base, variantsMap, lang),
      });
    }

    case "list_achievements": {
      let list = store.readAchievements();
      const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
      if (args.tag) list = list.filter((a) => (a.tags || []).some((x) => eq(x, args.tag)));
      if (args.skill) list = list.filter((a) => (a.skills || []).some((s) => eq(s, args.skill)));
      return json(list);
    }

    case "upsert_achievement": {
      const list = store.readAchievements();
      const idx = list.findIndex((a) => a.id === args.achievement.id);
      if (idx >= 0) list[idx] = args.achievement;
      else list.push(args.achievement);
      store.writeAchievements(list);
      return json({ ok: true, message: `achievement "${args.achievement.id}" ${idx >= 0 ? "updated" : "created"}` });
    }

    case "delete_achievement": {
      const list = store.readAchievements();
      const next = list.filter((a) => a.id !== args.id);
      if (next.length === list.length) throw new Error(`Achievement not found: ${args.id}`);
      store.writeAchievements(next);
      return json({ ok: true, message: `achievement "${args.id}" deleted` });
    }

    case "suggest_achievements": {
      const list = store.readAchievements();
      if (!list.length) {
        return json({ achievements: [], note: "No achievements.json in the data directory (it is optional)." });
      }
      let extraStopwords;
      try {
        extraStopwords = store.readBase().stopwords;
      } catch {
        extraStopwords = undefined;
      }
      const ranking = rankAchievements(args.job, list, args.lang || null, { top: args.top || 10, extraStopwords, langs: SUPPORTED_LANGS });
      const byId = new Map(list.map((a) => [a.id, a]));
      return json(ranking.map((r) => ({ ...r, achievement: byId.get(r.id) })));
    }

    case "lint_cv": {
      const base = store.readBase();
      const variant = args.variant ? store.readVariant(args.variant) : {};
      return json({ variant: args.variant || null, ...lintCV(base, variant, args.lang || "es") });
    }

    case "find_missing_translations": {
      const scope = args.scope || "all";
      const result = {};
      if (scope === "base" || scope === "all") {
        result.base = findMissingTranslations(store.readBase(), args.lang);
      }
      if (scope === "variants" || scope === "all") {
        result.variants = {};
        for (const name of store.listVariantNames()) {
          const missing = findMissingTranslations(store.readVariant(name), args.lang);
          if (missing.length) result.variants[name] = missing;
        }
      }
      return json(result);
    }

    case "log_application": {
      if (!store.variantExists(args.variant)) throw new Error(`Variant not found: ${args.variant}`);
      const variant = store.readVariant(args.variant);
      const lang = args.lang || "es";
      const date = args.date || todayISO();
      const list = store.readApplications();

      // Unique id: the requested one, or YYYY-MM-company-variant with a
      // numeric suffix on collision.
      const baseId = args.id || slugify(`${date.slice(0, 7)}-${args.company}-${args.variant}`, "application");
      let id = baseId;
      let n = 2;
      while (list.some((a) => a.id === id)) id = `${baseId}-${n++}`;

      const entry = { id, company: args.company, role: args.role, date, variant: args.variant, lang, status: "sent" };
      if (args.job_url) entry.job_url = args.job_url;
      if (args.notes) entry.notes = args.notes;
      if (args.job_text) {
        entry.job_text = args.job_text;
        entry.match_score = matchJob(args.job_text, store.readBase(), variant, lang).score;
      }

      // Snapshot: frozen variant + job posting always; PDF if rendering works.
      // A render failure (e.g. no Chromium) does NOT prevent logging.
      const snapDir = path.join(config.applicationsDir(), id);
      fs.mkdirSync(snapDir, { recursive: true });
      fs.writeFileSync(path.join(snapDir, "variant.json"), JSON.stringify(variant, null, 2) + "\n", "utf-8");
      if (args.job_text) fs.writeFileSync(path.join(snapDir, "job.txt"), args.job_text, "utf-8");

      let snapshotError = null;
      const snapshotFiles = [path.join(snapDir, "variant.json")];
      try {
        await runGenerate(args.variant, lang, "all", "pdf", DEFAULT_THEME);
        const outDir = path.join(config.outputDir(), args.variant);
        const prefixes = variant.cover_letter ? ["cv", "cover-letter"] : ["cv"];
        for (const prefix of prefixes) {
          const src = path.join(outDir, `${prefix}-${args.variant}-${lang}.pdf`);
          if (fs.existsSync(src)) {
            const dest = path.join(snapDir, `${prefix}-${lang}.pdf`);
            fs.copyFileSync(src, dest);
            snapshotFiles.push(dest);
          }
        }
      } catch (err) {
        snapshotError = err.message;
      }

      list.push(entry);
      store.writeApplications(list);

      return json({
        ok: true,
        application: entry,
        file: config.applicationsPath(),
        snapshot: { dir: snapDir, files: snapshotFiles },
        ...(snapshotError ? { snapshot_error: `PDF not generated (the application was logged anyway): ${snapshotError}` } : {}),
      });
    }

    case "update_application": {
      const list = store.readApplications();
      const entry = list.find((a) => a.id === args.id);
      if (!entry) throw new Error(`Application not found: ${args.id}`);
      if (args.status) entry.status = args.status;
      if (args.notes !== undefined) entry.notes = args.notes;
      if (args.job_url !== undefined) entry.job_url = args.job_url;
      entry.updated = todayISO();
      store.writeApplications(list);
      return json({ ok: true, application: entry, file: config.applicationsPath() });
    }

    case "list_applications": {
      let list = store.readApplications();
      if (args.status) list = list.filter((a) => a.status === args.status);
      const now = new Date(todayISO());
      const withAge = list
        .map((a) => ({
          ...a,
          days_since_update: Math.max(0, Math.round((now - new Date(a.updated || a.date)) / 86400000)),
        }))
        .sort((x, y) => (x.date < y.date ? 1 : -1));
      return json({ applications: withAge, file: config.applicationsPath() });
    }

    case "delete_application": {
      const list = store.readApplications();
      const next = list.filter((a) => a.id !== args.id);
      if (next.length === list.length) throw new Error(`Application not found: ${args.id}`);
      store.writeApplications(next);
      let snapshotNote = "snapshot kept";
      if (args.delete_snapshot) {
        const snapDir = path.join(config.applicationsDir(), args.id);
        if (fs.existsSync(snapDir)) fs.rmSync(snapDir, { recursive: true, force: true });
        snapshotNote = "snapshot deleted";
      }
      return json({ ok: true, message: `Application "${args.id}" removed (${snapshotNote}).` });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Resources: base.json, each variant, the achievements bank and the
// applications log, under cv:// URIs.
function listResources() {
  const resources = [
    {
      uri: "cv://base",
      name: "base.json",
      description: "Full CV (canonical data source)",
      mimeType: "application/json",
    },
    {
      uri: "cv://schemas/base",
      name: "base.schema.json",
      description: "JSON Schema for base.json",
      mimeType: "application/json",
    },
    {
      uri: "cv://schemas/variant",
      name: "variant.schema.json",
      description: "JSON Schema for variants",
      mimeType: "application/json",
    },
  ];
  for (const name of store.listVariantNames()) {
    resources.push({
      uri: `cv://variants/${name}`,
      name: `variants/${name}.json`,
      description: `Overrides for variant "${name}"`,
      mimeType: "application/json",
    });
  }
  resources.push({
    uri: "cv://achievements",
    name: "achievements.json",
    description: "Achievements bank (empty if the file does not exist)",
    mimeType: "application/json",
  });
  resources.push({
    uri: "cv://applications",
    name: "applications.json",
    description: "Applications log (empty if the file does not exist)",
    mimeType: "application/json",
  });
  return resources;
}

function readResource(uri) {
  if (uri === "cv://base") return store.readBase();
  if (uri === "cv://achievements") return store.readAchievements();
  if (uri === "cv://applications") return store.readApplications();
  if (uri === "cv://schemas/base") return require("./schemas/base.schema.json");
  if (uri === "cv://schemas/variant") return require("./schemas/variant.schema.json");
  const m = uri.match(/^cv:\/\/variants\/([a-z0-9-]+)$/);
  if (m) return store.readVariant(m[1]);
  throw new Error(`Unknown resource: ${uri}`);
}

function userMessage(text) {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

// Shared instruction: the agent talks to the user in the user's language.
const SPEAK_USER_LANGUAGE =
  "Interact with the user in THEIR language (the language they write in / the CV's main language), regardless of these instructions being in English.";

// tailor_cv v2: orchestrates the deterministic tools in a measurable loop
// (analyze → pick real material → rewrite → verify score).
function tailorPrompt(args) {
  const job = args.job || "(paste the job posting text here)";
  const variantName = args.variant || "tailored";
  const withCover = String(args.cover_letter || "").toLowerCase() === "true";
  // Sin lang explícito, el idioma de trabajo sigue al de la oferta: se omite
  // lang en analyze_job_match (autodetección) y se usa el que reporte.
  const lang = args.lang || null;
  const langLabel = lang || "the posting's language, as reported by analyze_job_match";
  const text = [
    "You are an expert CV assistant connected to this project via MCP. " + SPEAK_USER_LANGUAGE,
    `Goal: tailor my CV to the job posting below by creating/updating the variant "${variantName}" (working language: ${langLabel}), with a measurable match improvement.`,
    "",
    "HARD RULE: do not invent experience, technologies or metrics. Everything you write must come from base.json or the achievements bank. A job keyword I do not cover does NOT get added to the CV; it simply stays out.",
    "",
    "Process:",
    `1. DIAGNOSIS — call analyze_job_match with the posting (no variant${lang ? `, lang: "${lang}"` : ", omit lang so it is auto-detected from the posting"}): get the base score, the language used (reuse it in every later call), the ranking of existing variants (if the best variant beats the base, start from it) and the covered/missing keywords.`,
    "2. MATERIAL — call get_base (experience ids, skill keys) and suggest_achievements with the posting: those are the most relevant real achievements (if the bank is empty, continue with base only). That is the raw material for the bullets.",
    `3. REWRITE — call upsert_variant with name "${variantName}": headline and summary aimed at the role; experience_ids and skills_order prioritizing what matters; bullets rewritten using the posting keywords THAT ARE actually covered by my experience (use the posting's exact vocabulary when it is the same concept, e.g. "microservices" ↔ "microservicios").`,
    withCover
      ? "4. LETTER — include a cover_letter in the same variant (3-4 paragraphs, professional and warm) connecting my concrete achievements with what the posting asks for."
      : "4. (No cover letter unless I ask for one.)",
    `5. VERIFY — call analyze_job_match again with variant: "${variantName}". Report initial → final score. If the score did not improve or is below another variant, check which covered keywords were left out of the writing and iterate ONCE more (step 3).`,
    `6. DELIVER — call generate_cv (variant: "${variantName}"${withCover ? ', doc: "all"' : ""}, lang: ${lang ? `"${lang}"` : "the working language from step 1"}) and give me the paths + a summary of what you changed and why.`,
    `7. LOG — when I confirm I applied, log it with log_application (company, role, variant: "${variantName}", job_text with the posting): it freezes the snapshot of the exact PDF sent and stores the match_score.`,
    "",
    "Job posting:",
    "---",
    job,
    "---",
  ].join("\n");
  return userMessage(text);
}

// review_cv: deterministic lint + qualitative critique with a rubric.
function reviewPrompt(args) {
  const variantName = args.variant || "";
  const lang = args.lang || "es";
  const target = variantName ? `variant "${variantName}"` : "the base CV";
  const text = [
    "You are a demanding technical-CV reviewer connected to this project via MCP. " + SPEAK_USER_LANGUAGE,
    `Goal: review ${target} (language: ${lang}) and propose concrete improvements.`,
    "",
    "Process:",
    `1. Call lint_cv (${variantName ? `variant: "${variantName}", ` : ""}lang: "${lang}"): those are the measurable findings (lengths, metrics, weak openers, repetition).`,
    `2. Read the actual content with get_base${variantName ? ` and get_variant ("${variantName}")` : ""}.`,
    "3. Qualitative critique against this rubric, point by point:",
    "   - IMPACT: does each bullet show a result/consequence, or only describe tasks?",
    "   - SPECIFICITY: is measurable context (volume, scale, timeframe) missing anywhere?",
    "   - CONSISTENCY: uniform tense and voice; coherent terminology across sections.",
    "   - ORDER: do the strongest bullets come first in each entry? does the summary reflect the best of the CV?",
    "4. Deliver: a prioritized list of problems (worst first) and, for each weak bullet, a proposed rewrite faithful to the facts (do not invent metrics: if the number is missing, mark it as [DATA]).",
    "5. Do NOT apply changes yet: wait for my confirmation and only then use upsert_variant / update_base_section.",
  ].join("\n");
  return userMessage(text);
}

// translate_cv: complete a language using the deterministic gap detection.
function translatePrompt(args) {
  const lang = args.lang || "en";
  const text = [
    "You are a technical CV translator connected to this project via MCP. " + SPEAK_USER_LANGUAGE,
    `Goal: make the "${lang}" language complete across base.json and the variants.`,
    "",
    "Process:",
    `1. Call get_base and check whether "${lang}" exists in labels. If NOT: it is a new language — first add labels.${lang} (translate the section titles and closing) and, if its dates differ from the pivot language, dateTokens.${lang} (map of abbreviated months and the "present" word), via update_base_section. NOTE: adding the language to labels is what enables it across the whole tool.`,
    `2. Call find_missing_translations (lang: "${lang}", scope: "all"): exact paths and source text of everything missing.`,
    "3. Translate faithfully and professionally: keep technology/product names as-is, keep metrics and formatting (adapt numeric separators if the language requires it), and CV tone (action verbs, concise).",
    `4. Write the results: in base.json via update_base_section (section by section, adding the "${lang}" key to each translatable object WITHOUT touching the other languages); in variants via upsert_variant (the full variant document with the new keys).`,
    "5. Verify with validate and with find_missing_translations again (it must return empty). Report how many fields you translated.",
    "6. If any text is ambiguous or has local jargon, translate it anyway and flag it at the end for my review.",
  ].join("\n");
  return userMessage(text);
}

// mine_achievements: interview the user to populate the achievements bank.
function minePrompt(args) {
  const focus = args.focus || "";
  const source = args.source || "";
  const text = [
    "You are an expert interviewer at extracting professional achievements, connected to this project via MCP. " + SPEAK_USER_LANGUAGE,
    `Goal: populate my achievements bank (achievements.json) with concrete, measurable material${focus ? `, focused on: ${focus}` : ""}${source ? `, digging into my "${source}" experience` : ""}.`,
    "",
    "HARD RULE: record only what I state. Do not embellish, do not invent metrics; if I do not have the exact number, store the order of magnitude I confirm, or leave metric out.",
    "",
    "Process:",
    "1. Call get_base (my experience, with ids) and list_achievements (what already exists, to avoid duplicates).",
    "2. Interview me ONE QUESTION AT A TIME, starting with the most recent experience" + (source ? ` (starting with "${source}")` : "") + ". Look for situation → action → result, and chase the number: \"how much? what % improved? how many people/transactions/hours?\". Good questions: what was the hardest thing you solved there, which achievement are you proudest of, what would have broken without you, what did you improve that someone measured.",
    "3. When an achievement is clear, propose the wording (text in the CV's languages, 1-2 sentences with the metric embedded) and, once I confirm, call upsert_achievement with: a descriptive kebab-case id, text, topical tags, the skills involved, metric if any, and source pointing to the originating experience id.",
    "4. Continue with the next question until I say stop.",
    "5. Close with a summary: how many new achievements, and which areas of the bank are still thin.",
  ].join("\n");
  return userMessage(text);
}

// interview_prep: likely questions + STAR answers from real achievements.
function interviewPrompt(args) {
  const lang = args.lang || null;
  const hasApplication = Boolean(args.application);
  const jobSource = hasApplication
    ? `the tracked application "${args.application}" (call list_applications and use its stored job_text, variant and match_score)`
    : "the job posting included below";
  const text = [
    "You are a technical interview coach connected to this project via MCP. " + SPEAK_USER_LANGUAGE,
    `Goal: prepare me for the interview of ${jobSource} (language: ${lang || "the posting's language"}). Analysis only — do not write anything.`,
    "",
    "Process:",
    `1. Get the posting: ${hasApplication ? "list_applications → the entry with that id (if it has no job_text, ask me for it)" : "the text below"}.`,
    `2. Call analyze_job_match (${lang ? `lang: "${lang}"` : "omit lang so it is auto-detected from the posting"}${hasApplication ? ", with the application's variant" : ""}), get_base and suggest_achievements with the posting.`,
    "3. Deliver the preparation in four blocks:",
    "   A. Likely TECHNICAL QUESTIONS (from the posting's highest-weight keywords): for each one, which experience or achievement I answer with, in STAR format (situation, task, action, result with metric).",
    "   B. Likely BEHAVIORAL QUESTIONS for the role's seniority (leadership, conflict, priorities): same format, anchored to my real achievements.",
    "   C. UNCOMFORTABLE QUESTIONS from the gaps: for each relevant MISSING keyword of the match, the question they will probably ask and a suggested honest answer (adjacent experience + willingness to learn; never fake mastery).",
    "   D. 3-5 smart questions for ME to ask the interviewer, specific to this company/posting.",
    "4. Close with the 3 achievements I must mention in the interview no matter what.",
    ...(hasApplication
      ? []
      : ["", "Job posting:", "---", args.job || "(paste the job posting text here)", "---"]),
  ].join("\n");
  return userMessage(text);
}

// follow_up_applications: detect stalled applications and propose actions.
function followUpPrompt() {
  const text = [
    "You are my job-search assistant connected to this project via MCP. " + SPEAK_USER_LANGUAGE,
    "Goal: review the state of my applications and propose the next action for each one.",
    "",
    "Process:",
    "1. Call list_applications (no filter).",
    "2. Classify: STALLED (status sent with days_since_update > 7), ACTIVE (interview/offer), CLOSED (rejected/ghosted).",
    "3. For each stalled one propose a concrete action: a short follow-up message (draft it, ready to send), mark as ghosted if it has gone too long (>21 days with no signal), or re-apply with another variant if the match_score was low.",
    "4. For the active ones, remind me of the next step (e.g. prepare the interview with the interview_prep prompt using the application id).",
    "5. Do NOT change any status without my confirmation; once I confirm, use update_application.",
    "6. Close with a summary: totals per status and response rate.",
  ].join("\n");
  return userMessage(text);
}

const PROMPT_BUILDERS = {
  tailor_cv: tailorPrompt,
  review_cv: reviewPrompt,
  translate_cv: translatePrompt,
  mine_achievements: minePrompt,
  interview_prep: interviewPrompt,
  follow_up_applications: followUpPrompt,
};

async function main() {
  const server = new Server(
    { name: "cv-tailor", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const builder = PROMPT_BUILDERS[req.params.name];
    if (!builder) throw new Error(`Unknown prompt: ${req.params.name}`);
    return builder(req.params.arguments || {});
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return await handleTool(req.params.name, req.params.arguments || {});
    } catch (err) {
      return toolError(err);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listResources() }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => ({
    contents: [
      {
        uri: req.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(readResource(req.params.uri), null, 2),
      },
    ],
  }));

  await server.connect(new StdioServerTransport());
  console.error("cv-tailor MCP server running (stdio)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
