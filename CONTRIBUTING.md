# Contribuir a cv-tailor

¡Gracias por tu interés! Este proyecto es pequeño y las contribuciones son bienvenidas.

## Setup

Para **usar** la herramienta basta Node.js ≥ 18 con cualquier gestor (npm/pnpm/yarn) o
Bun. Para **desarrollar** necesitas [Bun](https://bun.sh) ≥ 1.1, porque el runner de
tests es `bun test`.

```bash
bun install
```

Para desarrollar sin descargar Chromium (los tests no lo necesitan):

```bash
PUPPETEER_SKIP_DOWNLOAD=1 bun install
```

## Flujo

1. Haz un fork y crea una rama descriptiva.
2. Haz tus cambios. Si tocas la lógica de datos (`template.js`, `lib/`, schemas),
   agrega o actualiza tests.
3. Antes de abrir el PR, asegúrate de que pase todo:

   ```bash
   bun run validate   # base.json + variants contra el schema
   bun test           # tests unitarios
   ```

4. Abre el PR. CI corre dos jobs: `test` (bun: validate + tests) y `node` (npm install +
   validación + generación reales con Node puro — la ruta de un usuario npm/pnpm).

## Estructura

| Archivo/carpeta | Rol |
|---|---|
| `base.json` | Datos del CV (fuente canónica). |
| `variants/` | Overrides por variante. |
| `achievements.json` | Banco de logros (opcional). |
| `applications.json` + `applications/` | Tracker de postulaciones + snapshots (opcional; en `.gitignore` por ser datos personales). |
| `examples/` | Datos de ejemplo (`base.json`, `tailored.json`, `achievements.json`, `applications.json`) para arrancar. |
| `template.js` | Lógica de merge y render (HTML/Markdown). Sin datos personales. |
| `templates/` | Temas visuales (solo CSS). |
| `lib/` | `config.js` (directorio de datos: cwd/`CV_DIR`), `store.js` (I/O), `validate.js` (schema + semántica), `docx.js`, `jsonresume.js`, `match.js` (keywords/score de ofertas), `lint.js` (calidad del CV), `i18n.js` (traducciones faltantes). Todo determinista, sin LLM. |
| `schemas/` | JSON Schema de `base`, `variant`, `achievements` y `applications`. |
| `generate.js` / `import.js` / `match.js` / `lint.js` / `validate.js` | CLIs. |
| `mcp-server.js` | Servidor MCP (tools, resources, prompts). La IA la pone el cliente (suscripción del usuario); el servidor nunca llama a un LLM. |
| `test/` | Tests (`bun test`). |

## Guías

- Los strings traducibles son objetos por idioma (`{ es, en, ... }` — ningún idioma es
  obligatorio; el pivote es la primera clave de `labels`) o un string plano. Nunca
  hardcodees contenido personal en `template.js` ni en `templates/`.
- Toda escritura de datos pasa por el validador: si agregas un campo nuevo,
  actualiza el schema y los chequeos semánticos en `lib/validate.js`.
- Los mensajes de usuario (errores de CLI, descripciones de tools MCP, prompts,
  hallazgos del lint) van en **inglés** — el agente le responde al usuario en su idioma.
- Mantén el estilo del código existente (2 espacios, sin punto y coma opcional
  inconsistente — mira los archivos vecinos).
