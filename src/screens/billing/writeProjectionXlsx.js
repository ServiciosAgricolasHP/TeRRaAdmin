// Excel de la proyección de flujo de caja. Dos hojas: la base con el detalle
// que la sostiene, y la proyección aparte. El porcentaje va en UNA celda y las
// filas la referencian (`$C$4`): quien recibe el archivo cambia el supuesto en
// Excel y la temporada entera se recalcula.
import { formatRutForDisplay } from "../../utils/rutUtils";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatPeriod } from "../../utils/cashFlowProjection";

export async function writeProjectionXlsx({ projection, projectionByClient, projectionFileBase, selectedCompany }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const companyName = selectedCompany?.alias || selectedCompany?.razonSocial || "";
  const money = '"$"#,##0';
  const thin = { style: "thin" };
  const box = { top: thin, left: thin, right: thin, bottom: thin };
  const header = (ws, row, col, text, align = "left") => {
    const c = ws.getCell(row, col);
    c.value = text;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    c.alignment = { horizontal: align, vertical: "middle" };
    c.border = box;
  };

  // ---------- Hoja 1: ingresos del período base ----------
  const ws1 = wb.addWorksheet("Ingresos");
  ws1.getColumn(1).width = 6; // convención del proyecto: col A vacía
  [13, 11, 26, 10, 32, 15, 15, 13, 15, 15].forEach((w, i) => { ws1.getColumn(2 + i).width = w; });

  ws1.getCell("B2").value = `INGRESOS — ${projection.baseLabel}`;
  ws1.getCell("B2").font = { bold: true, size: 14 };
  ws1.mergeCells("B2:K2");
  ws1.getCell("B3").value =
    `${companyName} · ${projection.baseCount} documentos de venta · solo entradas (las compras no entran)` +
    ` · las facturas de compra entran solo por el neto porque el IVA lo retiene el cliente`;
  ws1.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
  ws1.mergeCells("B3:K3");

  ws1.getCell("B5").value = "INGRESOS DEL PERÍODO BASE";
  ws1.mergeCells("B5:H5");
  ws1.getCell("I5").value = projection.baseTotal;
  ws1.mergeCells("I5:K5");
  for (const ref of ["B5", "I5"]) {
    const c = ws1.getCell(ref);
    c.font = { bold: true, size: ref === "I5" ? 16 : 12 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    c.alignment = { horizontal: ref === "I5" ? "right" : "left", vertical: "middle" };
    c.border = box;
  }
  ws1.getCell("I5").numFmt = money;
  ws1.getRow(5).height = 24;

  // Bloque por cliente — de dónde viene la base. Una proyección sostenida
  // por dos clientes no se lee igual que una repartida entre veinte.
  ws1.getCell("B7").value = "Por cliente";
  ws1.getCell("B7").font = { bold: true, size: 12 };
  ["RUT", "Razón social", "Documentos", "Neto", "Ingreso"].forEach((h, i) =>
    header(ws1, 8, 2 + i, h, i >= 2 ? "right" : "left"));
  let r1 = 9;
  for (const g of projectionByClient) {
    const vals = [formatRutForDisplay(g.rut) || g.rut, g.razonSocial, g.count, g.neto, g.monto];
    vals.forEach((v, j) => {
      const c = ws1.getCell(r1, 2 + j);
      c.value = v;
      c.alignment = { horizontal: j >= 2 ? "right" : "left" };
      c.border = box;
      if (j >= 3) c.numFmt = money;
      if (j === 4) c.font = { bold: true };
    });
    r1++;
  }
  if (projectionByClient.length > 0) {
    const tr = r1;
    ws1.getCell(tr, 2).value = "TOTAL";
    ws1.getCell(tr, 4).value = { formula: `SUM(D9:D${r1 - 1})`, result: projection.baseCount };
    ws1.getCell(tr, 5).value = {
      formula: `SUM(E9:E${r1 - 1})`,
      result: projectionByClient.reduce((acc, g) => acc + g.neto, 0),
    };
    ws1.getCell(tr, 6).value = { formula: `SUM(F9:F${r1 - 1})`, result: projection.baseTotal };
    for (let col = 2; col <= 6; col++) {
      const c = ws1.getCell(tr, col);
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      c.alignment = { horizontal: col >= 4 ? "right" : "left" };
      c.border = box;
      if (col >= 5) c.numFmt = money;
    }
    r1 = tr + 1;
  }

  // Bloque de detalle — un documento por fila. Va con neto, IVA y total
  // además del ingreso: sin el desglose, una factura de compra que aporta
  // menos que neto + IVA parece un error de la planilla.
  const detStart = r1 + 2;
  ws1.getCell(detStart - 1, 2).value = "Detalle de documentos";
  ws1.getCell(detStart - 1, 2).font = { bold: true, size: 12 };
  const DET_NUM = new Set([3, 6, 7, 8, 9]); // folio + los cuatro montos
  ["Fecha", "Período", "Tipo de documento", "Folio", "Cliente", "RUT", "Neto", "IVA", "Total SII", "Ingreso"]
    .forEach((h, i) => header(ws1, detStart, 2 + i, h, DET_NUM.has(i) ? "right" : "left"));
  let dr = detStart + 1;
  for (const d of projection.detail) {
    const vals = [
      d.fechaEmision,
      d.periodo,
      d.tipoLabel || dteTypeLabel(d.tipo),
      d.folio,
      d.razonSocial,
      formatRutForDisplay(d.rut) || d.rut,
      d.neto,
      d.iva,
      d.total,
      d.monto,
    ];
    vals.forEach((v, j) => {
      const c = ws1.getCell(dr, 2 + j);
      c.value = v;
      c.alignment = { horizontal: DET_NUM.has(j) ? "right" : "left" };
      c.border = box;
      if (j >= 6) c.numFmt = money;
      // Las NC restan; en rojo para que la fila negativa no se lea como un
      // error de tipeo del que armó la planilla.
      if (d.isNc) c.font = { color: { argb: "FFB00000" } };
      // El ingreso va en negrita, y destacado cuando no coincide con el
      // total del SII: ahí es donde se ve la retención.
      if (j === 9) {
        c.font = { bold: true, color: { argb: d.isNc ? "FFB00000" : "FF000000" } };
        if (d.conRetencion) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
        }
      }
    });
    dr++;
  }
  if (projection.detail.length > 0) {
    const tr = dr;
    ws1.getCell(tr, 2).value = "TOTAL";
    ws1.getCell(tr, 11).value = { formula: `SUM(K${detStart + 1}:K${dr - 1})`, result: projection.baseTotal };
    for (let col = 2; col <= 11; col++) {
      const c = ws1.getCell(tr, col);
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      c.alignment = { horizontal: col === 11 ? "right" : "left" };
      c.border = box;
      if (col === 11) c.numFmt = money;
    }
  }

  // ---------- Hoja 2: la proyección ----------
  const ws2 = wb.addWorksheet("Proyección");
  ws2.getColumn(1).width = 6;
  [20, 14, 20, 20].forEach((w, i) => { ws2.getColumn(2 + i).width = w; });

  ws2.getCell("B2").value = `PROYECCIÓN DE FLUJO DE CAJA — ${projection.targetLabel}`;
  ws2.getCell("B2").font = { bold: true, size: 14 };
  ws2.mergeCells("B2:E2");
  ws2.getCell("B3").value =
    `${companyName} · base: ingresos de ${projection.baseLabel}` +
    ` · ${projection.mesesReales} ${projection.mesesReales === 1 ? "mes real" : "meses reales"}` +
    ` y ${projection.mesesEstimados} ${projection.mesesEstimados === 1 ? "estimado" : "estimados"}`;
  ws2.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
  ws2.mergeCells("B3:E3");

  // Celda del supuesto — amarilla, como los inputs editables del resto de
  // los exports del proyecto.
  ws2.getCell("B4").value = "Porcentaje aplicado";
  ws2.getCell("B4").font = { bold: true };
  const pctCell = ws2.getCell("C4");
  pctCell.value = projection.factor;
  pctCell.numFmt = "0.0%";
  pctCell.font = { bold: true };
  pctCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  pctCell.alignment = { horizontal: "right" };
  pctCell.border = box;

  const HR2 = 6;
  ["Mes proyectado", "Origen", "Ingreso base", "Monto"]
    .forEach((h, i) => header(ws2, HR2, 2 + i, h, i >= 2 ? "right" : "left"));
  let r2 = HR2 + 1;
  for (const row of projection.rows) {
    const origen = row.esReal
      ? `Real · ${row.realCount} doc.`
      : `${row.basePeriodo} × ${projection.percent}%`;
    const vals = [formatPeriod(row.periodo), origen, row.esReal ? null : row.baseMonto, null];
    vals.forEach((v, j) => {
      const c = ws2.getCell(r2, 2 + j);
      // El mes real va como valor literal y NO como fórmula: si colgara de
      // C4, mover el supuesto en Excel movería un número ya facturado.
      if (j === 3) {
        c.value = row.esReal ? row.monto : { formula: `ROUND(D${r2}*$C$4,0)`, result: row.proyectado };
      } else {
        c.value = v;
      }
      c.alignment = { horizontal: j >= 2 ? "right" : "left" };
      c.border = box;
      if (j >= 2) c.numFmt = money;
      if (j === 3) c.font = { bold: true, color: { argb: row.esReal ? "FF1F7A1F" : "FF000000" } };
      if (j === 1 && row.esReal) c.font = { bold: true, color: { argb: "FF1F7A1F" } };
    });
    r2++;
  }
  const totalRow2 = r2;
  ws2.getCell(totalRow2, 2).value = `TOTAL ${projection.targetLabel}`;
  // Solo suma las bases de los meses estimados: los reales dejan la celda
  // vacía porque su base no se usó para nada.
  ws2.getCell(totalRow2, 4).value = {
    formula: `SUM(D${HR2 + 1}:D${r2 - 1})`,
    result: projection.rows.reduce((acc, row) => acc + (row.esReal ? 0 : row.baseMonto), 0),
  };
  ws2.getCell(totalRow2, 5).value = { formula: `SUM(E${HR2 + 1}:E${r2 - 1})`, result: projection.total };
  for (let col = 2; col <= 5; col++) {
    const c = ws2.getCell(totalRow2, col);
    c.font = { bold: true, size: col === 5 ? 13 : 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    c.alignment = { horizontal: col >= 4 ? "right" : "left" };
    c.border = box;
    if (col >= 4) c.numFmt = money;
  }

  const notaRow = totalRow2 + 2;
  ws2.getCell(notaRow, 2).value =
    "Cada mes se proyecta desde el mismo mes del período anterior, no repartiendo el total en doceavos: " +
    "la temporada es estacional y el promedio parejo esconde cuándo entra la plata. " +
    "Los meses marcados \"Real\" ya están facturados y valen su dato: van como valor fijo y NO se mueven " +
    "al cambiar el porcentaje de C4, que solo recalcula los meses estimados. " +
    "Solo entran ventas (entradas); las notas de crédito restan. " +
    "Una factura de compra entra solo por su neto, porque el IVA lo retiene el cliente y nunca se cobra; " +
    "el resto entra por el Monto Total del SII. El desglose está en la hoja Ingresos.";
  ws2.getCell(notaRow, 2).font = { italic: true, size: 9, color: { argb: "FF666666" } };
  ws2.getCell(notaRow, 2).alignment = { wrapText: true, vertical: "top" };
  ws2.mergeCells(notaRow, 2, notaRow + 2, 5);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${projectionFileBase}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
