import { containerLabel, getDayCombos, getTratoTiers, qualityLabel, tratoTypeLabel } from "../../../utils/cosechaCombos";
import { dateLabel } from "../../../utils/cycleSummary";

// Exporta la grilla a XLSX con fórmulas de Excel.
// Restricciones de layout:
//   - Col A vacía (width = 6, mitad de una columna normal de 12).
//   - Fila 1 vacía.
//   - Todos los datos arrancan desde la col B / fila 2.
//
// Por tipo:
//   - tratoHE → 3 cols por día (Base, Horas, Extras). Tarifa HE editable
//     al pie. Total $ = TotalBase + TotalHoras × tarifa_HE + TotalExtras.
//   - cosecha → 1 col por (día, combo) con kg + 1 col $ por día (fórmula).
//     El precio de cada (día, combo) va en una fila editable del encabezado.
//   - trato   → igual que cosecha, con tiers.
//   - el resto (main, supervision, extra, tratoEtapas) → 1 col por día con
//     el monto; totales con SUM.
export async function writeLaborWorkerGridXlsx({ catalogs, dates, dayPrices, displayName, labor, redDates, unit, workers, xlsxFilename }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(displayName.slice(0, 30) || "Resumen");

  const t = labor?.type;
  const isHE = t === "tratoHE";
  const isHarvest = t === "cosecha";
  const isPiecework = t === "trato";
  const isMoneyOnly = !isHarvest && !isPiecework && !isHE;

  const colLetter = (n) => {
    let s = "";
    let x = n;
    while (x > 0) {
      const r = (x - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s;
  };

  const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9DC3E6" } };
  const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
  const PRICE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  const RED_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
  const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  const hairBorder = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };

  // Restricciones de layout: col A vacía + fila 1 vacía.
  const COL_FIXED_START = 2; // col B = Trabajador
  const COL_RUT = 3; // col C = RUT

  // ────────────────────────────────────────────────────────────────────
  // Combos (cosecha) o tiers (trato).
  // ────────────────────────────────────────────────────────────────────
  // combos: lista ordenada de { key, label }. El precio varía por
  // (fecha, key): sale de `dayPrices` y va en una fila de precios dentro
  // del encabezado, una celda por día y combo.
  let combos = [];
  if (isHarvest) {
    const seen = new Map(); // key -> { qx, cy }
    for (const w of workers) {
      for (const c of w.byDate.values()) {
        for (const [k, b] of c.byCombo) {
          if (!seen.has(k)) seen.set(k, { qx: b.qx, cy: b.cy });
        }
      }
    }
    combos = [...seen.entries()].map(([key, m]) => ({
      key,
      qx: m.qx, cy: m.cy,
      label: `${qualityLabel(catalogs, m.qx)}/${containerLabel(catalogs, m.cy)}`.toLowerCase(),
    })).sort((a, b) => a.key.localeCompare(b.key));
  } else if (isPiecework) {
    const seen = new Map();
    for (const w of workers) {
      for (const c of w.byDate.values()) {
        for (const [k] of c.byTier) {
          if (!seen.has(k)) seen.set(k, true);
        }
      }
    }
    combos = [...seen.keys()].map((key) => {
      const idx = key.startsWith("t") ? Number(key.slice(1)) : 0;
      const ttLabel = tratoTypeLabel(catalogs, labor?.tratoType ?? 0);
      return { key, label: `P${idx + 1} ${ttLabel}`.trim() };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }

  // Precio por (fecha, key) desde dayPrices, con los helpers que normalizan
  // los formatos antiguos (precio plano o clave "0_0"):
  //   - cosecha: getDayCombos devuelve [{ key:"x_y", price }, ...]
  //   - trato:   getTratoTiers devuelve [{ key:"tN", price }, ...]
  const priceFor = (date, key) => {
    if (!labor?.id) return 0;
    if (isHarvest) {
      const list = getDayCombos(dayPrices, labor.id, date, "unit");
      const hit = list.find((c) => c.key === key);
      return Number(hit?.price) || 0;
    }
    if (isPiecework) {
      const list = getTratoTiers(dayPrices, labor.id, date, "unit");
      const hit = list.find((c) => c.key === key);
      return Number(hit?.price) || 0;
    }
    return 0;
  };

  let cursorRow = 2; // fila 1 vacía

  // ────────────────────────────────────────────────────────────────────
  // Encabezado de la tabla principal.
  // ────────────────────────────────────────────────────────────────────
  const HEADER_ROW = cursorRow;
  const cellsPerDay = isHE ? 3 : (combos.length > 0 ? combos.length + 1 : 1);
  // tratoHE: Base / Horas / Extras por día
  // cosecha/trato con combos: 1 col por combo + 1 col Subtotal $
  // el resto: 1 col (cantidad en cosecha/trato sin combos, monto en los demás)

  const COL_FIRST_DAY = COL_RUT + 1;
  const COL_AFTER_DAYS = COL_FIRST_DAY + dates.length * cellsPerDay;

  // Columnas de totales:
  let COL_TOTAL_BASE = null, COL_TOTAL_HORAS = null, COL_TOTAL_EXTRAS = null;
  let COL_TOTAL_QTY_BY_COMBO = []; // por combo
  let COL_TOTAL_AMT;
  if (isHE) {
    COL_TOTAL_BASE = COL_AFTER_DAYS;
    COL_TOTAL_HORAS = COL_AFTER_DAYS + 1;
    COL_TOTAL_EXTRAS = COL_AFTER_DAYS + 2;
    COL_TOTAL_AMT = COL_AFTER_DAYS + 3;
  } else if ((isHarvest || isPiecework) && combos.length > 0) {
    // Una col total por combo + Total $.
    for (let i = 0; i < combos.length; i++) COL_TOTAL_QTY_BY_COMBO.push(COL_AFTER_DAYS + i);
    COL_TOTAL_AMT = COL_AFTER_DAYS + combos.length;
  } else if (isHarvest || isPiecework) {
    // Sin combos (raro): total de cantidad y, en la columna siguiente, Total $.
    COL_TOTAL_AMT = COL_AFTER_DAYS;
  } else {
    COL_TOTAL_AMT = COL_AFTER_DAYS;
  }

  const headerRow = ws.getRow(HEADER_ROW);
  headerRow.getCell(COL_FIXED_START).value = "Trabajador";
  headerRow.getCell(COL_RUT).value = "RUT";

  // Cosecha/trato con combos: encabezado de tres filas
  //   1: fecha (combinada sobre las columnas del día)
  //   2: nombre del combo / tier y "$" para el subtotal
  //   3: precio por combo (editable) y "$" en la columna del subtotal
  // tratoHE y el resto usan un encabezado de una fila.
  const useDoubleHeader = (isHarvest || isPiecework) && combos.length > 0;
  const HEADER_ROW_2 = useDoubleHeader ? HEADER_ROW + 1 : null;
  const PRICE_HEADER_ROW = useDoubleHeader ? HEADER_ROW + 2 : null;
  const subHeaderRow = useDoubleHeader ? ws.getRow(HEADER_ROW_2) : null;
  const priceHeaderRow = useDoubleHeader ? ws.getRow(PRICE_HEADER_ROW) : null;

  dates.forEach((d, di) => {
    const lbl = dateLabel(d);
    const baseCol = COL_FIRST_DAY + di * cellsPerDay;
    const isRed = isHE && redDates.has(d);
    if (isHE) {
      headerRow.getCell(baseCol).value = `Base ${lbl}`;
      headerRow.getCell(baseCol + 1).value = `Horas ${lbl}`;
      headerRow.getCell(baseCol + 2).value = `Extras ${lbl}`;
      if (isRed) {
        for (let i = 0; i < 3; i++) {
          const cc = headerRow.getCell(baseCol + i);
          cc.fill = RED_FILL;
          cc.font = { bold: true, color: { argb: "FF9C0006" } };
        }
      }
    } else if (useDoubleHeader) {
      // Fila 1: la fecha, combinada sobre las (combos + 1) columnas del día.
      headerRow.getCell(baseCol).value = lbl;
      ws.mergeCells(HEADER_ROW, baseCol, HEADER_ROW, baseCol + combos.length);
      // Fila 2: nombre de cada combo y "$"
      combos.forEach((cb, ci) => {
        subHeaderRow.getCell(baseCol + ci).value = cb.label;
      });
      subHeaderRow.getCell(baseCol + combos.length).value = "$";
      // Fila 3: precios reales del día por combo (editables).
      combos.forEach((cb, ci) => {
        const priceCell = priceHeaderRow.getCell(baseCol + ci);
        priceCell.value = priceFor(d, cb.key);
        priceCell.numFmt = '"$"#,##0';
        priceCell.fill = PRICE_FILL;
        priceCell.border = thinBorder;
        priceCell.font = { italic: true };
        priceCell.alignment = { horizontal: "center", vertical: "middle" };
      });
      // En la fila de precios, la columna $ del día lleva solo "$": es el
      // subtotal calculado abajo, no un precio.
      const subAmtPriceCell = priceHeaderRow.getCell(baseCol + combos.length);
      subAmtPriceCell.value = "$";
      subAmtPriceCell.font = { italic: true, color: { argb: "FF888888" } };
      subAmtPriceCell.alignment = { horizontal: "center" };
    } else if (isHarvest || isPiecework) {
      headerRow.getCell(baseCol).value = `${lbl} (${unit || "u"})`;
    } else {
      headerRow.getCell(baseCol).value = `${lbl} ($)`;
    }
  });

  // Encabezados de los totales.
  if (isHE) {
    headerRow.getCell(COL_TOTAL_BASE).value = "Total Base";
    headerRow.getCell(COL_TOTAL_HORAS).value = "Total Horas";
    headerRow.getCell(COL_TOTAL_EXTRAS).value = "Total Extras";
    headerRow.getCell(COL_TOTAL_AMT).value = "Total $";
  } else if ((isHarvest || isPiecework) && combos.length > 0) {
    combos.forEach((cb, ci) => {
      headerRow.getCell(COL_TOTAL_QTY_BY_COMBO[ci]).value = `Total ${cb.label}`;
    });
    headerRow.getCell(COL_TOTAL_AMT).value = "Total $";
  } else if (isHarvest || isPiecework) {
    headerRow.getCell(COL_TOTAL_AMT).value = `Total ${unit || "u"}`;
    const nextCol = COL_TOTAL_AMT + 1;
    headerRow.getCell(nextCol).value = "Total $";
  } else {
    headerRow.getCell(COL_TOTAL_AMT).value = "Total $";
  }

  // Estilo del encabezado (filas 1 y 2; la fila 3 de precios ya tiene el suyo).
  const styleHeaderCell = (c) => {
    c.font = c.font?.color ? c.font : { bold: true };
    c.fill = c.fill || HEADER_FILL;
    c.border = thinBorder;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };
  headerRow.eachCell({ includeEmpty: false }, styleHeaderCell);
  if (subHeaderRow) subHeaderRow.eachCell({ includeEmpty: false }, styleHeaderCell);
  // Etiqueta "Precios →" en la col del nombre (fila de precios).
  if (priceHeaderRow) {
    const lbl = priceHeaderRow.getCell(COL_FIXED_START);
    lbl.value = "Precios →";
    lbl.font = { italic: true, color: { argb: "FF555555" } };
    lbl.alignment = { horizontal: "right" };
  }

  // ────────────────────────────────────────────────────────────────────
  // Filas de datos.
  // ────────────────────────────────────────────────────────────────────
  const DATA_START_ROW = useDoubleHeader ? HEADER_ROW + 3 : HEADER_ROW + 1;
  const DATA_END_ROW = DATA_START_ROW + workers.length - 1;

  workers.forEach((w, wi) => {
    const rowNum = DATA_START_ROW + wi;
    const row = ws.getRow(rowNum);
    row.getCell(COL_FIXED_START).value = w.name;
    row.getCell(COL_RUT).value = w.rut;

    dates.forEach((d, di) => {
      const c = w.byDate.get(d);
      const baseCol = COL_FIRST_DAY + di * cellsPerDay;
      if (isHE) {
        row.getCell(baseCol).value = Number(c?.base) || 0;
        row.getCell(baseCol + 1).value = Number(c?.overtimeHours) || 0;
        row.getCell(baseCol + 2).value = Number(c?.extras) || 0;
      } else if ((isHarvest || isPiecework) && combos.length > 0) {
        // Por combo: cantidad en cada columna y subtotal $ (fórmula) en la última.
        const qtyCells = [];
        combos.forEach((cb, ci) => {
          const qtyCell = row.getCell(baseCol + ci);
          const qty = isHarvest
            ? Number(c?.byCombo?.get(cb.key)?.kilos) || 0
            : Number(c?.byTier?.get(cb.key)?.qty) || 0;
          qtyCell.value = qty;
          // Precio de ese día y combo: fila PRICE_HEADER_ROW (absoluta),
          // misma columna que la cantidad (relativa).
          const priceRef = `${colLetter(baseCol + ci)}$${PRICE_HEADER_ROW}`;
          qtyCells.push({
            ref: `${colLetter(baseCol + ci)}${rowNum}`,
            priceRef,
          });
        });
        const subAmtCell = row.getCell(baseCol + combos.length);
        // Fórmula: qty1*price1_dia + qty2*price2_dia + ...
        const parts = qtyCells.map((x) => `${x.ref}*${x.priceRef}`);
        subAmtCell.value = { formula: parts.join("+"), result: Number(c?.amount) || 0 };
      } else if (isHarvest || isPiecework) {
        row.getCell(baseCol).value = Number(c?.qty) || 0;
      } else {
        row.getCell(baseCol).value = Number(c?.amount) || 0;
      }
    });

    // Totales por fila.
    if (isHE) {
      const baseCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * 3)}${rowNum}`).join(",");
      const hoursCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * 3 + 1)}${rowNum}`).join(",");
      const extrasCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * 3 + 2)}${rowNum}`).join(",");
      row.getCell(COL_TOTAL_BASE).value = { formula: `SUM(${baseCells})`, result: Number(w.totals.base) || 0 };
      row.getCell(COL_TOTAL_HORAS).value = { formula: `SUM(${hoursCells})`, result: Number(w.totals.overtimeHours) || 0 };
      row.getCell(COL_TOTAL_EXTRAS).value = { formula: `SUM(${extrasCells})`, result: Number(w.totals.extras) || 0 };
      // Total $ se escribe más abajo, después de la celda de tarifa HE.
      row.getCell(COL_TOTAL_AMT).value = Number(w.totals.amount) || 0;
    } else if ((isHarvest || isPiecework) && combos.length > 0) {
      // Total por combo: SUM hacia la derecha tomando solo las cols de ese combo.
      combos.forEach((cb, ci) => {
        const cells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * cellsPerDay + ci)}${rowNum}`).join(",");
        const totQty = isHarvest
          ? [...w.byDate.values()].reduce((s, c) => s + (Number(c.byCombo?.get(cb.key)?.kilos) || 0), 0)
          : [...w.byDate.values()].reduce((s, c) => s + (Number(c.byTier?.get(cb.key)?.qty) || 0), 0);
        row.getCell(COL_TOTAL_QTY_BY_COMBO[ci]).value = { formula: `SUM(${cells})`, result: totQty };
      });
      // Total $: suma de los subtotales por día.
      const subAmtCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * cellsPerDay + combos.length)}${rowNum}`).join(",");
      row.getCell(COL_TOTAL_AMT).value = { formula: `SUM(${subAmtCells})`, result: Number(w.totals.amount) || 0 };
    } else if (isHarvest || isPiecework) {
      const dayCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di)}${rowNum}`).join(",");
      row.getCell(COL_TOTAL_AMT).value = { formula: `SUM(${dayCells})`, result: Number(w.totals.qty) || 0 };
      row.getCell(COL_TOTAL_AMT + 1).value = Number(w.totals.amount) || 0;
    } else {
      const dayCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di)}${rowNum}`).join(",");
      row.getCell(COL_TOTAL_AMT).value = { formula: `SUM(${dayCells})`, result: Number(w.totals.amount) || 0 };
    }

    // Formato de las celdas.
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cell.border = hairBorder;
      if (colNumber < COL_FIRST_DAY) return; // Trabajador/RUT
      const isAmtCol = colNumber === COL_TOTAL_AMT;
      if (isMoneyOnly) {
        cell.numFmt = '"$"#,##0;[Red]"$"#,##0;""';
      } else if (isAmtCol) {
        cell.numFmt = '"$"#,##0';
      } else if (isHE) {
        const offset = colNumber - COL_FIRST_DAY;
        if (offset >= 0 && offset < dates.length * 3) {
          const kind = offset % 3; // 0 base ($), 1 horas (#), 2 extras ($)
          cell.numFmt = kind === 0 ? '"$"#,##0;[Red]-"$"#,##0;""'
            : kind === 1 ? "0.0;[Red]-0.0;\"\""
            : '"$"#,##0;[Red]-"$"#,##0;""';
        } else if (colNumber === COL_TOTAL_HORAS) {
          cell.numFmt = "#,##0.0";
        } else {
          cell.numFmt = '"$"#,##0';
        }
      } else if ((isHarvest || isPiecework) && combos.length > 0) {
        const offset = colNumber - COL_FIRST_DAY;
        if (offset >= 0 && offset < dates.length * cellsPerDay) {
          const slot = offset % cellsPerDay;
          cell.numFmt = slot === cellsPerDay - 1 ? '"$"#,##0' : "#,##0";
        } else {
          cell.numFmt = "#,##0";
        }
      } else {
        cell.numFmt = '#,##0;[Red]-#,##0;""';
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Fila Total día (pie).
  // ────────────────────────────────────────────────────────────────────
  const TOTAL_ROW = DATA_END_ROW + 1;
  const totalRow = ws.getRow(TOTAL_ROW);
  totalRow.getCell(COL_FIXED_START).value = "Total día";
  const sumDown = (col) => {
    const c = colLetter(col);
    return `SUM(${c}${DATA_START_ROW}:${c}${DATA_END_ROW})`;
  };
  dates.forEach((_, di) => {
    const baseCol = COL_FIRST_DAY + di * cellsPerDay;
    for (let i = 0; i < cellsPerDay; i++) {
      totalRow.getCell(baseCol + i).value = { formula: sumDown(baseCol + i), result: 0 };
    }
  });
  if (isHE) {
    totalRow.getCell(COL_TOTAL_BASE).value = { formula: sumDown(COL_TOTAL_BASE), result: 0 };
    totalRow.getCell(COL_TOTAL_HORAS).value = { formula: sumDown(COL_TOTAL_HORAS), result: 0 };
    totalRow.getCell(COL_TOTAL_EXTRAS).value = { formula: sumDown(COL_TOTAL_EXTRAS), result: 0 };
  } else if ((isHarvest || isPiecework) && combos.length > 0) {
    COL_TOTAL_QTY_BY_COMBO.forEach((col) => {
      totalRow.getCell(col).value = { formula: sumDown(col), result: 0 };
    });
  } else if (isHarvest || isPiecework) {
    totalRow.getCell(COL_TOTAL_AMT + 1).value = { formula: sumDown(COL_TOTAL_AMT + 1), result: 0 };
  }
  totalRow.getCell(COL_TOTAL_AMT).value = { formula: sumDown(COL_TOTAL_AMT), result: 0 };

  // Estilo de la fila de totales.
  const lastTotalCol = (isHarvest || isPiecework) && combos.length === 0 ? COL_TOTAL_AMT + 1 : COL_TOTAL_AMT;
  for (let col = COL_FIXED_START; col <= lastTotalCol; col++) {
    const cell = totalRow.getCell(col);
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
    cell.border = thinBorder;
    if (col < COL_FIRST_DAY) continue;
    if (isMoneyOnly || col === COL_TOTAL_AMT) cell.numFmt = '"$"#,##0';
    else if (isHE) {
      const offset = col - COL_FIRST_DAY;
      if (offset >= 0 && offset < dates.length * 3) {
        const kind = offset % 3;
        cell.numFmt = kind === 1 ? "#,##0.0" : '"$"#,##0';
      } else if (col === COL_TOTAL_HORAS) {
        cell.numFmt = "#,##0.0";
      } else {
        cell.numFmt = '"$"#,##0';
      }
    } else if ((isHarvest || isPiecework) && combos.length > 0) {
      const offset = col - COL_FIRST_DAY;
      if (offset >= 0 && offset < dates.length * cellsPerDay) {
        const slot = offset % cellsPerDay;
        cell.numFmt = slot === cellsPerDay - 1 ? '"$"#,##0' : "#,##0";
      } else {
        cell.numFmt = "#,##0";
      }
    } else {
      cell.numFmt = "#,##0";
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Tarifa HE editable (solo tratoHE).
  // ────────────────────────────────────────────────────────────────────
  if (isHE) {
    const HE_RATE_ROW = TOTAL_ROW + 2;
    const heRateRow = ws.getRow(HE_RATE_ROW);
    heRateRow.getCell(COL_FIXED_START).value = "Tarifa HE $/hora";
    heRateRow.getCell(COL_FIXED_START).font = { bold: true, italic: true };
    heRateRow.getCell(COL_RUT).value = Number(labor?.overtimeRate) || 3500;
    heRateRow.getCell(COL_RUT).numFmt = '"$"#,##0';
    heRateRow.getCell(COL_RUT).fill = PRICE_FILL;
    heRateRow.getCell(COL_RUT).border = thinBorder;

    const heRef = `$${colLetter(COL_RUT)}$${HE_RATE_ROW}`;
    workers.forEach((w, wi) => {
      const rowNum = DATA_START_ROW + wi;
      const baseRef = `${colLetter(COL_TOTAL_BASE)}${rowNum}`;
      const hoursRef = `${colLetter(COL_TOTAL_HORAS)}${rowNum}`;
      const extrasRef = `${colLetter(COL_TOTAL_EXTRAS)}${rowNum}`;
      ws.getRow(rowNum).getCell(COL_TOTAL_AMT).value = {
        formula: `${baseRef}+${hoursRef}*${heRef}+${extrasRef}`,
        result: Number(w.totals.amount) || 0,
      };
    });
    // Pie: suma de los Total $ por trabajador.
    totalRow.getCell(COL_TOTAL_AMT).value = { formula: sumDown(COL_TOTAL_AMT), result: 0 };

    const note = ws.getRow(HE_RATE_ROW + 1);
    note.getCell(COL_FIXED_START).value = "↑ Edita la tarifa HE para recalcular los Total $.";
    note.getCell(COL_FIXED_START).font = { italic: true, color: { argb: "FF666666" }, size: 10 };
  }

  // ────────────────────────────────────────────────────────────────────
  // Anchos y paneles fijos.
  // ────────────────────────────────────────────────────────────────────
  ws.getColumn(1).width = 6; // col A = mitad
  ws.getColumn(COL_FIXED_START).width = 30; // Trabajador
  ws.getColumn(COL_RUT).width = 14; // RUT
  for (let i = COL_FIRST_DAY; i <= COL_TOTAL_AMT + 1; i++) {
    ws.getColumn(i).width = 12;
  }

  // Fija las columnas A, Trabajador y RUT y el encabezado completo.
  const ySplit = useDoubleHeader ? PRICE_HEADER_ROW : HEADER_ROW;
  ws.views = [{ state: "frozen", xSplit: COL_RUT, ySplit }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = xlsxFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
