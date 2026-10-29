import { captureFullWidthDataUrl, cloneForExport } from "./imageCapture";

// Imprimir abre una ventana aparte con el HTML del nodo y llama a `print()`
// cuando termina de cargar. La pantalla no se toca.

// El navegador no dejó abrir la ventana de impresión.
export class PopupBlockedError extends Error {
  constructor() {
    super("Permite las ventanas emergentes para imprimir.");
    this.name = "PopupBlockedError";
  }
}

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Lo común a toda impresión: los fondos y colores tal cual (sin
// `print-color-adjust` el navegador los descarta), la orientación de la hoja,
// una hoja por `.print-page`, el encabezado de una tabla repetido en cada hoja
// y filas que no se cortan entre dos. `@page` va al nivel superior y no dentro
// de `@media print`: anidado, hay navegadores que lo ignoran. Sin tamaño de
// papel, así respeta el que tenga configurado y solo cambia la orientación.
function baseCss(page, margin) {
  return `
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    @page { size: ${page}; margin: ${margin}; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #000; margin: 0; }
    .print-page { padding: 20px; page-break-after: always; }
    .print-page:last-child { page-break-after: auto; }
    table { border-collapse: collapse; width: 100%; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tr { page-break-inside: avoid; }
  `;
}

// Celdas con borde gris, para las tablas que no traen el borde en línea.
export const PRINT_GRID_CSS = "th, td { border: 1px solid #888; padding: 6px 8px; font-size: 12px; }";

// Tablas con el encabezado verde de planilla (Transportes y Facturación).
export const PRINT_SHEET_CSS = `
  th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
  thead th { background: #92d050 !important; text-align: left; }
`;

// El documento de la ventana de impresión. `page` es `landscape` o `portrait`
// y `css` se suma a lo común. Con `autoPrint` imprime al cargar; sin él,
// imprime quien lo pida desde el cuerpo.
export function printDocument({ title = "", body = "", css = "", page = "landscape", margin = "12mm", autoPrint = true }) {
  const script = autoPrint ? "<script>window.onload = () => { window.focus(); window.print(); };</script>" : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${baseCss(page, margin)}${css}</style>
</head><body>${body}${script}</body></html>`;
}

// Abre la ventana de impresión con `html`.
export function openPrintWindow(html) {
  const win = window.open("", "_blank", "width=1000,height=750");
  if (!win) throw new PopupBlockedError();
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// Imprime los nodos, cada uno desde una hoja nueva, sin los controles que no
// van en una exportación (`data-export-hide`).
export function printNodes(nodes, options = {}) {
  const body = nodes
    .filter(Boolean)
    .map((n) => `<div class="print-page">${cloneForExport(n).outerHTML}</div>`)
    .join("");
  openPrintWindow(printDocument({ ...options, body }));
}

// Imprime la imagen del nodo, la misma que se copia o descarga, en una sola
// hoja: la imagen se escala al área de la página en vez de partirse. Sirve
// para una tabla más ancha que la hoja, que impresa como HTML perdería las
// columnas de la derecha. A cambio, el texto no queda seleccionable.
export async function printNodeAsImage(node, { title = "", page = "landscape", margin = "8mm" } = {}) {
  const dataUrl = await captureFullWidthDataUrl(node);
  // `print()` va en el onload de la imagen: antes de que se decodifique, la
  // hoja sale en blanco.
  const body = `<img alt="${escapeHtml(title)}" src="${dataUrl}" onload="window.focus(); window.print();">`;
  const css = `
    body { padding: 16px; background: #fff; }
    img { display: block; margin: 0 auto; max-width: 100%; height: auto; }
    @media print {
      html, body { height: 100%; }
      body { padding: 0; }
      img { max-width: 100%; max-height: 100vh; width: auto; height: auto; page-break-inside: avoid; }
    }
  `;
  openPrintWindow(printDocument({ title, body, css, page, margin, autoPrint: false }));
}
