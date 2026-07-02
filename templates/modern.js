// templates/modern.js — tema alternativo: color de acento, tipografía limpia,
// títulos de sección con barra lateral en vez de subrayado. Misma estructura
// HTML que classic (solo cambia el CSS).

const ACCENT = "#2563eb";

const cv = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* Margen real de página: aplica en TODAS las páginas del PDF (un padding en
     body solo afecta la primera/última). En pantalla (preview HTML) se emula
     con padding vía @media screen. */
  @page { margin: 30px 40px; }

  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11px;
    color: #222;
    line-height: 1.5;
  }

  @media screen {
    body { padding: 30px 40px; }
  }

  /* HEADER */
  .header { margin-bottom: 18px; border-bottom: 2px solid ${ACCENT}; padding-bottom: 10px; }
  .header h1 { font-size: 24px; font-weight: 700; color: ${ACCENT}; letter-spacing: 0.5px; }
  .header .headline { font-size: 11px; color: #444; margin: 3px 0 4px; font-weight: 500; }
  .header .contact { font-size: 9.5px; color: #666; }
  .header .links { font-size: 9.5px; color: ${ACCENT}; margin-top: 3px; }
  .header .links a { color: ${ACCENT}; text-decoration: none; }

  /* SECTION */
  .section { margin-bottom: 13px; }
  .section-title {
    font-size: 11.5px;
    font-weight: 700;
    color: ${ACCENT};
    text-transform: uppercase;
    letter-spacing: 1px;
    padding-left: 8px;
    border-left: 3px solid ${ACCENT};
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
  .summary { font-size: 10.5px; line-height: 1.55; }

  /* ENTRIES */
  .entry { margin-bottom: 11px; }
  .entry-header { display: flex; justify-content: space-between; align-items: baseline; }
  .entry-title { font-weight: 700; font-size: 11px; color: #111; }
  .entry-title a { color: inherit; text-decoration: none; }
  .entry-dates { font-size: 9.5px; color: #888; }
  .entry-subtitle { font-size: 10px; color: ${ACCENT}; margin: 1px 0 4px; }
  .entry-desc { font-size: 10.5px; margin: 1px 0 3px; }
  ul { padding-left: 15px; }
  li { margin-bottom: 2px; font-size: 10.5px; line-height: 1.45; }

  /* INLINE rows */
  .inline-row { margin-bottom: 4px; font-size: 10.5px; }
  .inline-label { font-weight: 700; color: #111; }

  /* LIST + languages */
  .list-item, .lang { font-size: 10.5px; }

  /* EDUCATION */
  .edu-row { font-size: 10.5px; }
`;

const cover = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  @page { margin: 50px 58px; }

  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11px;
    color: #222;
    line-height: 1.65;
  }

  @media screen {
    body { padding: 50px 58px; }
  }

  .header { margin-bottom: 24px; border-bottom: 2px solid ${ACCENT}; padding-bottom: 12px; }
  .header h1 { font-size: 22px; font-weight: 700; color: ${ACCENT}; }
  .header .contact { font-size: 9.5px; color: #666; margin-top: 4px; }

  .date { text-align: right; margin-bottom: 18px; font-size: 10.5px; color: #666; }
  .recipient { margin-bottom: 18px; font-size: 10.5px; }
  .subject { font-weight: 700; margin-bottom: 14px; font-size: 11.5px; color: ${ACCENT}; break-after: avoid; page-break-after: avoid; }
  .body p { margin-bottom: 12px; font-size: 11px; text-align: justify; orphans: 2; widows: 2; }
  .closing { margin-top: 22px; font-size: 11px; break-inside: avoid; page-break-inside: avoid; }
  .signature { margin-top: 28px; font-weight: 700; font-size: 11px; color: #111; break-inside: avoid; page-break-inside: avoid; }
`;

module.exports = { cv, cover };
