// Imprime la vista previa del informe en una ventana aparte, en A4 vertical y
// sin el marco de la hoja. El encabezado de cada tabla se repite al cambiar de
// hoja y una fila no se corta entre dos hojas.
export function printReport(html, title) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) throw new Error("Permite las ventanas emergentes para imprimir.");
  win.document.open();
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { margin: 0; background: #ffffff; }
  body > div { box-shadow: none !important; padding: 0 !important; min-width: 0 !important; max-width: none !important; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  h2, h3 { break-after: avoid; }
</style>
</head><body>${html}
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`);
  win.document.close();
}
