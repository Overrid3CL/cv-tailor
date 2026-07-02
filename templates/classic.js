// templates/classic.js — tema por defecto: sobrio, Arial, bordes negros.
// Exporta el CSS para CV y cover letter. La estructura HTML (clases) vive en
// template.js y es común a todos los temas; los temas solo cambian el CSS.

const cv = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* Margen real de página: aplica en TODAS las páginas del PDF (un padding en
     body solo afecta la primera/última). En pantalla (preview HTML) se emula
     con padding vía @media screen. */
  @page { margin: 28px 36px; }

  body {
    font-family: Arial, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    line-height: 1.45;
  }

  @media screen {
    body { padding: 28px 36px; }
  }

  /* HEADER */
  .header { text-align: center; margin-bottom: 14px; }
  .header h1 { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
  .header .headline { font-size: 10.5px; color: #000000; margin: 4px 0 5px; }
  .header .contact { font-size: 9.5px; color: #666; }
  .header .links { font-size: 9.5px; color: #666; margin-top: 3px; }
  .header .links a { color: #666; text-decoration: none; }

  /* SECTION */
  .section { margin-bottom: 12px; }
  .section-title {
    font-size: 11px;
    font-weight: bold;
    color: #000000;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1.5px solid #000000;
    padding-bottom: 2px;
    margin-bottom: 8px;
    break-after: avoid;
    page-break-after: avoid;
  }

  /* PAGE BREAKS: una entrada/fila nunca queda cortada entre páginas
     (si es más alta que una página, el navegador la parte igual). */
  .entry, .edu-row, .inline-row, .list-item, .lang {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* SUMMARY */
  .summary { font-size: 10.5px; line-height: 1.5; }

  /* ENTRIES (experience + custom "entries" sections) */
  .entry { margin-bottom: 10px; }
  .entry-header { display: flex; justify-content: space-between; align-items: baseline; }
  .entry-title { font-weight: bold; font-size: 11px; }
  .entry-title a { color: inherit; text-decoration: none; }
  .entry-dates { font-size: 9.5px; color: #666; }
  .entry-subtitle { font-size: 10px; color: #555; font-style: italic; margin: 1px 0 4px; }
  .entry-desc { font-size: 10.5px; margin: 1px 0 3px; }
  ul { padding-left: 14px; }
  li { margin-bottom: 2px; font-size: 10.5px; line-height: 1.4; }

  /* INLINE rows (skills + custom "inline" sections) */
  .inline-row { margin-bottom: 4px; font-size: 10.5px; }
  .inline-label { font-weight: bold; }

  /* LIST sections + languages */
  .list-item, .lang { font-size: 10.5px; }

  /* EDUCATION */
  .edu-row { font-size: 10.5px; }
`;

const cover = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  @page { margin: 48px 56px; }

  body {
    font-family: Arial, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    line-height: 1.6;
  }

  @media screen {
    body { padding: 48px 56px; }
  }

  .header { text-align: center; margin-bottom: 22px; border-bottom: 1.5px solid #000; padding-bottom: 12px; }
  .header h1 { font-size: 20px; font-weight: bold; letter-spacing: 1px; }
  .header .contact { font-size: 9.5px; color: #666; margin-top: 4px; }

  .date { text-align: right; margin-bottom: 18px; font-size: 10.5px; }
  .recipient { margin-bottom: 18px; font-size: 10.5px; }
  .subject { font-weight: bold; margin-bottom: 14px; font-size: 11px; break-after: avoid; page-break-after: avoid; }
  .body p { margin-bottom: 12px; font-size: 11px; text-align: justify; orphans: 2; widows: 2; }
  .closing { margin-top: 22px; font-size: 11px; break-inside: avoid; page-break-inside: avoid; }
  .signature { margin-top: 28px; font-weight: bold; font-size: 11px; break-inside: avoid; page-break-inside: avoid; }
`;

module.exports = { cv, cover };
