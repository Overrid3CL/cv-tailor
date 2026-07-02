# cv-tailor

<img src="docs/tailor.png" align="right" width="130" alt="cv-tailor">

🌐 [Español](README.md) · **English**

**Turn your AI agent into your job-application assistant.** Connected over MCP, your
agent tailors your CV to each job posting, critiques and improves it, generates the
ready-to-send PDF/Word and tracks every application through to the interview.
**Everything runs on your machine: your data is never uploaded to any server.** No API
keys, no paid services — it works with the agent you already use (Claude, Cursor,
VS Code… any MCP client).

<br clear="right">

![Example CV preview](docs/preview.png)

## What problem does it solve?

Applying well requires a different CV version per posting, in the right language, in
whatever format the process demands — and knowing afterwards which version you sent to
whom. Doing that by hand in Word means duplicating files and losing control; doing it
with a web service means handing your work history to a third party.

Here instead:

- **Your agent does the work**: you ask in plain language — *"tailor my CV to this
  posting"*, *"critique it"*, *"log that I applied"*, *"prep me for the interview"* —
  and it uses the MCP server's tools to actually do it, with validation and metrics,
  not just opinion.
- **Everything is local and yours**: your data lives in files in your folder (readable
  JSON, hand-editable); the MCP server runs on your machine and calls no external API.
- **No duplication**: you write your data once, and each application is a small variant
  with only what changes (headline, skill order, cover letter).
- **One command generates everything**: PDF, Word, HTML and Markdown, in any language
  you add — with or without AI, it also works as a plain CLI.

## Get started

You need [Node.js](https://nodejs.org) ≥ 18 (npm, pnpm, yarn or [Bun](https://bun.sh)).
There are three ways to use it, from the simplest to the most manual.

### 1. Install it as an MCP server — the recommended way (no repo download)

`cv-tailor` is published on npm, so your MCP client launches it with `npx` without you
cloning or installing anything by hand. Add this block to your client's config (Claude
Desktop/Code, Cursor, VS Code, Windsurf… any of them):

```json
{ "mcpServers": { "cv-tailor": {
  "command": "npx", "args": ["-y", "cv-tailor-mcp"],
  "env": { "CV_DIR": "/path/to/your-cv-folder" }
} } }
```

`npx -y cv-tailor-mcp` downloads the server the first time and caches it. Set **`CV_DIR`**
to your data folder (under `npx` the working directory is unpredictable, so be explicit).
No data yet? Copy the package's `examples/` folder as a starting point.

> The PDF format uses Chromium (Puppeteer downloads it the first time, ~150 MB); the other
> formats don't need it.

The intelligence comes from **the agent you already use** — the server never calls an LLM
and needs no API key, and everything runs on your machine. Then you work in plain language;
your agent uses the server's tools for real (with validation and metrics), not just opinion:

| You tell your agent… | What happens |
|---|---|
| *"Tailor my CV to this posting"* (+ paste the posting) | Measures the match, picks your relevant achievements, rewrites the variant **without inventing experience** and verifies the score improved |
| *"How well do I fit this posting?"* | 0–100 score with the keywords you cover and the ones you're missing |
| *"Critique my CV"* | Measurable checks + impact critique with proposed rewrites |
| *"Interview me to fill my achievements bank"* | Questions + stores each confirmed achievement, with its metric |
| *"I applied to Acme, log it"* | Records the application and **freezes the exact PDF you sent** |
| *"Which of my applications have stalled?"* | Reviews the log and drafts the follow-ups |
| *"Prep me for the Acme interview"* | Likely questions (incl. the uncomfortable ones about your gaps) with which achievement to answer |
| *"Translate my CV to French"* | Detects what's missing and completes it, validated |

Full cycle: **posting → tailored CV → logged application → follow-up → interview**.

### 2. …or download the code

Useful if you want to modify the tool, contribute, or run it without depending on npm:

```bash
git clone https://github.com/Overrid3CL/cv-tailor.git && cd cv-tailor
npm install        # or: pnpm install · yarn · bun install
```

> With **pnpm**: `pnpm approve-builds` for Puppeteer's postinstall.

To connect your agent to the local clone, point the MCP config at the file instead of `npx`:

```json
{ "mcpServers": { "cv-tailor": {
  "command": "node", "args": ["/path/to/cv-tailor/mcp-server.js"],
  "env": { "CV_DIR": "/path/to/your-cv-folder" }
} } }
```

(Claude Code reads the repo's `.mcp.json` automatically when you open it.)

### 3. …or use it from the command line (no AI)

Installed globally (`npm install -g cv-tailor`) you get the `cv-tailor` command; from the
clone, use `node generate.js`:

```bash
# Installed globally: work in your data folder
cd ~/my-cv && cv-tailor --variant tailored

# From the clone: try it now with the example CV (fictional)
CV_DIR=examples node generate.js --variant tailored

# Make it yours: copy the example to your private folder and edit it
cp -r examples ~/my-cv && CV_DIR=~/my-cv node generate.js --variant tailored
```

The CV lands in `<folder>/output/tailored/` (PDF + Markdown). Also AI-free: `match.js`
(analyze a posting) and `lint.js` (CV quality) — see [Daily use](#daily-use-cli).

> Your data lives in **your folder** (`CV_DIR`), never in the repo — that's why the root
> `base.json`, `variants/`, `achievements.json` and `applications.json` are in
> `.gitignore`. `examples/` is a ready-to-copy data folder.

## How it works

```
base.json          ←  your full CV (data, written once)
variants/          ←  one file per application, with ONLY what changes
achievements.json  ←  (optional) achievements bank: raw material for the AI
applications.json  ←  (optional) application log + snapshots
        │
        ▼
node generate.js --variant <name> [--lang es|en|all] [--format pdf,docx,html,md]
        │
        ▼
output/<variant>/cv-... .pdf .docx .html .md   (+ cover letter)
```

Three key ideas:

1. **Data ≠ code.** Everything of yours is JSON; the render logic contains no personal
   content. Multilingual texts are written as `{ "es": "...", "en": "..." }` (or just
   `{ "en": "..." }` — no language is mandatory) and adding a language requires no code.
2. **Variants inherit from `base.json`** and override the minimum: which experience to
   show and in what order, headline, skills, letter. Nothing is duplicated.
3. **Every write is validated** (JSON Schema + reference checks): invalid JSON never
   reaches disk, whether you edit it or the AI does.

## Daily use (CLI)

Every command runs with `node` (or `bun`, if that's your thing — both work):

```bash
node generate.js --list                                  # list variants
node generate.js --variant tailored --lang all           # every language
node generate.js --variant tailored --doc all            # CV + cover letter
node generate.js --variant tailored --format docx        # Word
node generate.js --variant all --lang all                # everything at once
node generate.js --variant tailored --template modern    # another design

node match.js --job posting.txt --variant all   # which variant fits this posting best?
node lint.js --variant tailored                 # CV quality check (metrics, lengths…)
node import.js my-resume.json                   # import from JSON Resume
npm run validate                                # validate all the data
```

`match.js` and `lint.js` are 100% deterministic (no AI): they score a posting's keyword
coverage and check measurable best practices.

---

## Reference

<details>
<summary><b>📄 Formats and PDF</b></summary>

| Format | Needs Chromium | Use |
|---|---|---|
| `pdf` | Yes | Final delivery (clean page breaks and a "page N of M" footer on 2+ pages) |
| `docx` | No | Processes that ask for Word |
| `html` | No | Quick preview / publishing |
| `md` | No | Plain text / version control |

`--format` takes a list (`pdf,docx`) or `all`. To use an already-installed Chrome
instead of the one Puppeteer downloads: install with `PUPPETEER_SKIP_DOWNLOAD=1` and set
`PUPPETEER_EXECUTABLE_PATH` when generating (`PUPPETEER_LAUNCH_ARGS="--no-sandbox"` in
Docker/CI). Visual themes: `--template classic|modern` (CSS in `templates/`; adding a
theme = one new file).

</details>

<details>
<summary><b>🗂 Structure of <code>base.json</code></b></summary>

| Field | Description |
|---|---|
| `name` / `contact` | Name and contact line |
| `labels` | Section titles per language (the keys of `labels` define the supported languages; **the first one is the pivot/authoring language**) + optional `closing` for the letter |
| `dateTokens` | Date-token replacements per target language: `{ "en": { "Ene": "Jan", "Presente": "Present" } }` (dates are authored in the pivot language) |
| `links` | Header links: `[{ "label": "GitHub", "url": "…" }]` |
| `experience[]` | `{ id, title, company, dates, bullets[] }` — each text `{es,en,…}` or a plain string |
| `education[]` / `languages[]` / `skills` | Education, languages and skills (`{ key: { label, value } }`) |
| `custom_sections[]` | Extra sections (projects, certifications…) with three layouts: `entries` (like experience), `list` (bullets) and `inline` (`label: value`) |
| `stopwords` / `weak_starters` | Optional: extend the built-in es/en lists used by the match and the lint, for other languages or domains |

A translatable string is an object keyed by language (`{ "es": "…", "en": "…" }`, or just
`{ "en": "…" }` for an English-only CV — **no language is mandatory**); a plain string is
used as-is in every language. To add a language: add its key to `labels` (and to
`dateTokens` if needed) and to the texts — the CLI, the MCP and the dates (`Intl`) pick
it up automatically. The `translate_cv` prompt can fill in the translations for you.

</details>

<details>
<summary><b>🧩 Variants and cover letters</b></summary>

Create `variants/<name>.json` with only what changes relative to `base.json`:

| Variant field | Effect |
|---|---|
| `headline` / `summary` | Positioning for that role |
| `experience_ids` | Which entries to show, and in what order |
| `experience.<id>` | Overrides fields of an entry (or defines a new one) |
| `skills_order` / `skills.<key>` | Skill ordering/filtering and overrides |
| `custom_sections.<id>` / `custom_sections_order` | Overrides and ordering of extra sections |
| `links` / `education` / `languages` | Replace the whole array |
| `cover_letter` | Cover letter (below) |

The letter only requires `body` (paragraphs); `recipient`, `company`, `subject` and
`closing` are optional, and the date is filled automatically (localized) if you omit it:

```json
{
  "cover_letter": {
    "recipient": { "es": "Equipo de Selección", "en": "Hiring Team" },
    "company": "Example Inc.",
    "body": [ { "es": "Primer párrafo…", "en": "First paragraph…" } ]
  }
}
```

Generate with `--doc cover` or `--doc all`. Full example in `examples/variants/tailored.json`.

</details>

<details>
<summary><b>🏆 Achievements bank and 📌 application tracker</b></summary>

**`achievements.json`** (optional): granular achievements with tags, skills, the metric
and the originating experience — more material than fits in a CV. The AI uses them as
raw material when tailoring variants (`suggest_achievements` ranks them against each
posting) and the `mine_achievements` prompt fills the bank by interviewing you. Example
in `examples/achievements.json`.

**`applications.json`** (optional): application log — company, role, date, variant sent,
match score and status (`sent` → `interview`/`offer`/`rejected`/`ghosted`). Logging with
`log_application` freezes a snapshot under `applications/<id>/`: the **exact PDF you
sent**, the variant at that moment and the posting. Even if you edit your CV later, you
will always know what that company saw.

Both files live in **your data folder** (see next section); they are yours and can be
edited by hand. In this repo they are in `.gitignore` because they are personal data.

</details>

<details>
<summary><b>📁 Where your data lives (global install / bunx)</b></summary>

The code (schemas, themes, scripts) travels with the package; **your data does not**.
The files (`base.json`, `variants/`, `achievements.json`, `applications.json`,
`output/`) are resolved from the **current directory**, or from `CV_DIR` if you set it:

```bash
cd ~/my-cv && cv-tailor --variant tailored     # data in ~/my-cv
CV_DIR=~/my-cv cv-tailor --variant tailored    # from anywhere
```

For the global binary: `npm install -g cv-tailor` (or `npm link` / `bun link` inside the
clone). Running from the repo itself (`node generate.js …`), the data
folder is the repo root.

</details>

<details>
<summary><b>🔌 MCP reference: tools, prompts and resources</b></summary>

**Tools** (all deterministic; every write validated):

| Tool | Description |
|---|---|
| `get_base` / `update_base` / `update_base_section` | Read and update `base.json` |
| `list_variants` / `get_variant` / `upsert_variant` / `delete_variant` | Manage variants |
| `import_json_resume` | Import a CV in [JSON Resume](https://jsonresume.org) format |
| `validate` | Validation report for all the data |
| `generate_cv` | Generate documents (`doc`, `lang`, `format`, `template`) |
| `analyze_job_match` | Posting↔CV score, covered/missing keywords, variant ranking |
| `list/upsert/delete_achievement` + `suggest_achievements` | Achievements bank + per-posting ranking |
| `lint_cv` | Measurable CV quality |
| `find_missing_translations` | Fields missing a language, with exact paths |
| `log/update/list/delete_application` | Application tracker + snapshots |

**Prompts** (they orchestrate your agent step by step; the intelligence comes from the
agent/LLM you already use): `tailor_cv`, `review_cv`, `translate_cv`,
`mine_achievements`, `interview_prep`, `follow_up_applications`. Each prompt instructs
the agent to **reply to you in your language**.

**Resources**: `cv://base`, `cv://variants/<name>`, `cv://achievements`,
`cv://applications`, `cv://schemas/base`, `cv://schemas/variant`.

**Registering the server** — it is standard stdio (`node /path/to/repo/mcp-server.js`),
so any MCP client accepts the `mcpServers` block shown above. Examples: Claude Code:
`claude mcp add cv-tailor -- node /path/to/repo/mcp-server.js` (add `--scope user`
for all projects); Claude Desktop: add the block to `claude_desktop_config.json` and
restart; Cursor/VS Code/Windsurf: the same block in each one's MCP config. Set `CV_DIR`
in the server's `env` if your data is not in the client's working directory.

</details>

<details>
<summary><b>🧪 Tests and validation</b></summary>

```bash
npm run validate   # validates base.json and every variant (works with node)
bun test           # 100+ unit tests (the development test runner is bun)
```

To **use** the tool you only need Node ≥ 18; Bun is only required to run the tests while
developing. CI checks both paths: bun (tests) and node+npm (real install, validation and
generation).

CI (GitHub Actions) runs both on every push and pull request. The data has JSON Schema
(`schemas/`) plus semantic checks: references must exist, new entries must be complete,
ids must be unique.

</details>

## Contributing

Ideas, issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
