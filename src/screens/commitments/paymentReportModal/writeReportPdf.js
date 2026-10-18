import { cellOf } from "./reportDocument";

// ── PDF ─────────────────────────────────────────────────────────────────────

// A4 vertical con jsPDF + jspdf-autotable, cargados lazy: texto seleccionable,
// el encabezado de cada tabla se repite al cambiar de hoja y cada hoja lleva al
// pie el título y "Página N de M". Helvetica cubre tildes, ñ, "°" y "·".
const RGB = {
  text: [17, 24, 39],
  muted: [107, 114, 128],
  head: [55, 65, 81],
  line: [209, 213, 219],
  total: [243, 244, 246],
  danger: [185, 28, 28],
  warn: [180, 83, 9],
  dangerTint: [254, 242, 242],
  warnTint: [255, 251, 235],
};

export async function writeReportPdf(doc, fileBase) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const M = 15;
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const bottom = H - M - 6;
  let y = M + 4;

  const font = (size, style = "normal", color = RGB.text) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };
  // Salta de hoja si no caben `mm` más; así un título no queda solo al pie.
  const ensure = (mm) => {
    if (y + mm > bottom) {
      pdf.addPage();
      y = M + 4;
    }
  };
  const lines = (text, size) => {
    font(size);
    return pdf.splitTextToSize(text, W - 2 * M);
  };

  font(16, "bold");
  pdf.text(doc.title, M, y);
  y += 6;
  const sub = lines(doc.subtitle, 9);
  font(9, "normal", RGB.muted);
  pdf.text(sub, M, y);
  y += sub.length * 4 + 2;

  for (const b of doc.blocks) {
    if (b.kind === "h2") {
      ensure(24);
      y += 6;
      font(12, "bold");
      pdf.text(b.text, M, y);
      y += 3;
    } else if (b.kind === "h3") {
      ensure(18);
      y += 2;
      font(10, "bold");
      pdf.text(b.text, M, y);
      y += 2.5;
    } else if (b.kind === "p") {
      const ls = lines(b.text, 9);
      ensure(ls.length * 4 + 3);
      y += 3;
      font(9, "normal", b.muted ? RGB.muted : RGB.text);
      pdf.text(ls, M, y);
      y += (ls.length - 1) * 4 + 2;
    } else {
      autoTable(pdf, {
        startY: y + 1,
        margin: { left: M, right: M, top: M, bottom: M + 6 },
        head: [b.columns.map((c) => c.label)],
        body: b.rows.map((row) =>
          row.cells.map((raw) => {
            const cell = cellOf(raw);
            return cell.sub ? `${cell.text}\n${cell.sub}` : String(cell.text);
          }),
        ),
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8, cellPadding: 1.5, lineColor: RGB.line, lineWidth: 0.2, textColor: RGB.text, valign: "top" },
        headStyles: { fillColor: RGB.head, textColor: 255, fontStyle: "bold" },
        columnStyles: Object.fromEntries(
          b.columns.map((c, i) => [i, { ...(c.num ? { halign: "right" } : {}), ...(c.width ? { cellWidth: c.width } : {}) }]),
        ),
        didParseCell: (data) => {
          if (data.section === "head") {
            if (b.columns[data.column.index]?.num) data.cell.styles.halign = "right";
            return;
          }
          const row = b.rows[data.row.index];
          const cell = cellOf(row.cells[data.column.index]);
          if (row.total) {
            data.cell.styles.fillColor = RGB.total;
            data.cell.styles.fontStyle = "bold";
          } else if (row.tone) {
            data.cell.styles.fillColor = RGB[`${row.tone}Tint`];
          }
          if (row.bold || cell.bold) data.cell.styles.fontStyle = "bold";
          const tone = cell.tone || cell.subTone || (data.column.index === 0 ? row.tone : "");
          if (tone) data.cell.styles.textColor = RGB[tone];
          else if (cell.muted) data.cell.styles.textColor = RGB.muted;
        },
      });
      y = pdf.lastAutoTable.finalY + 2;
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    font(8, "normal", RGB.muted);
    pdf.text(`${doc.title} · ${doc.subtitle}`, M, H - 8, { maxWidth: W - 2 * M - 30 });
    pdf.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: "right" });
  }
  pdf.save(`${fileBase}.pdf`);
}
