import { useRef, useState, useMemo } from "react";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../../../utils/imageCapture";
import Modal from "../../../components/Modal";
import {
  getDaySingle,
  qualityLabel,
  containerLabel,
  tratoTypeLabel,
  getDayCombos,
  getTratoTiers,
  formatLaborDayPrice,
} from "../../../utils/cosechaCombos";
import { isRedDay } from "../../../utils/tratoHE";
import { useToast } from "../../../contexts/ToastContext";
import { dateLabel, fmtNumber } from "../../../utils/cycleSummary";
import { fmtCurrency } from "../../../utils/format";
import { cellH, cell } from "./tableStyles";

// ============================================================
// LaborWorkerGrid: grilla imprimible trabajador × día, una por labor
// ============================================================
// Muestra lo mismo que la grilla de CycleDetail, de solo lectura y preparada
// para imprimir o capturar. Tiene su propio ref y sus botones (📋 / 📥 / 🖨).
// Al imprimir, `thead { display: table-header-group }` repite el encabezado
// en cada hoja cuando la tabla pasa de una página.
export function LaborWorkerGrid({
  labor,
  displayName,
  unit,
  catalogs,
  containers,
  workers: allWorkers,
  dates,
  anyPiso,
  titles,
  dayPrices = {},
}) {
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState("");
  // Vista ampliada: la grilla en un Modal aparte, para verla completa cuando
  // hay muchos días.
  const [expanded, setExpanded] = useState(false);

  // Filtro de trabajadores: RUTs ocultos (vacío = todos visibles). Vale para
  // la grilla, los totales y el XLSX.
  const [hiddenRuts, setHiddenRuts] = useState(() => new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const workers = useMemo(
    () => allWorkers.filter((w) => !hiddenRuts.has(w.rut)),
    [allWorkers, hiddenRuts],
  );

  // tratoHE: sábados, domingos y feriados del dayPrices en rojo, con el mismo
  // criterio que la grilla del ciclo. Para otras labores queda vacío.
  const redDates = useMemo(() => {
    if (labor?.type !== "tratoHE") return new Set();
    const out = new Set();
    for (const d of dates) {
      const cfg = getDaySingle(dayPrices, labor.id, d, "normal");
      if (isRedDay(d, cfg)) out.add(d);
    }
    return out;
  }, [labor?.type, labor?.id, dates, dayPrices]);

  const filename = `resumen_trabajadores_${(labor?.name || "labor").replace(/[/\s]+/g, "_")}.png`;
  const xlsxFilename = `resumen_${(labor?.name || "labor").replace(/[/\s]+/g, "_")}.xlsx`;

  // Con una grilla más ancha que la ventana, `html-to-image` puede cortar en
  // el `offsetWidth` del elemento; `width`/`height` salen de
  // `scrollWidth`/`scrollHeight` para que el PNG traiga la tabla completa.
  const fullCaptureOpts = () => ({
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    width: ref.current?.scrollWidth || undefined,
    height: ref.current?.scrollHeight || undefined,
  });

  const handleCopy = async () => {
    if (!ref.current) return;
    setBusy("copy");
    try {
      const blob = await captureFullWidthBlob(ref.current, fullCaptureOpts());
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };
  const handleDownload = async () => {
    if (!ref.current) return;
    setBusy("download");
    try {
      const dataUrl = await captureFullWidthDataUrl(ref.current, fullCaptureOpts());
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusy("");
    }
  };
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
  const handleXlsx = async () => {
    setBusy("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(displayName.slice(0, 30) || "Resumen");

      const t = labor?.type;
      const isHE = t === "tratoHE";
      const isCosecha = t === "cosecha";
      const isTrato = t === "trato";
      const isMoneyOnly = !isCosecha && !isTrato && !isHE;

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
      if (isCosecha) {
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
      } else if (isTrato) {
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
        if (isCosecha) {
          const list = getDayCombos(dayPrices, labor.id, date, "unit");
          const hit = list.find((c) => c.key === key);
          return Number(hit?.price) || 0;
        }
        if (isTrato) {
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
      } else if ((isCosecha || isTrato) && combos.length > 0) {
        // Una col total por combo + Total $.
        for (let i = 0; i < combos.length; i++) COL_TOTAL_QTY_BY_COMBO.push(COL_AFTER_DAYS + i);
        COL_TOTAL_AMT = COL_AFTER_DAYS + combos.length;
      } else if (isCosecha || isTrato) {
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
      const useDoubleHeader = (isCosecha || isTrato) && combos.length > 0;
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
        } else if (isCosecha || isTrato) {
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
      } else if ((isCosecha || isTrato) && combos.length > 0) {
        combos.forEach((cb, ci) => {
          headerRow.getCell(COL_TOTAL_QTY_BY_COMBO[ci]).value = `Total ${cb.label}`;
        });
        headerRow.getCell(COL_TOTAL_AMT).value = "Total $";
      } else if (isCosecha || isTrato) {
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
          } else if ((isCosecha || isTrato) && combos.length > 0) {
            // Por combo: cantidad en cada columna y subtotal $ (fórmula) en la última.
            const qtyCells = [];
            combos.forEach((cb, ci) => {
              const qtyCell = row.getCell(baseCol + ci);
              const qty = isCosecha
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
          } else if (isCosecha || isTrato) {
            row.getCell(baseCol).value = Number(c?.qty) || 0;
          } else {
            row.getCell(baseCol).value = Number(c?.amount) || 0;
          }
        });

        // Totales por fila.
        if (isHE) {
          const baseCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * 3)}${rowNum}`).join(",");
          const horasCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * 3 + 1)}${rowNum}`).join(",");
          const extrasCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * 3 + 2)}${rowNum}`).join(",");
          row.getCell(COL_TOTAL_BASE).value = { formula: `SUM(${baseCells})`, result: Number(w.totals.base) || 0 };
          row.getCell(COL_TOTAL_HORAS).value = { formula: `SUM(${horasCells})`, result: Number(w.totals.overtimeHours) || 0 };
          row.getCell(COL_TOTAL_EXTRAS).value = { formula: `SUM(${extrasCells})`, result: Number(w.totals.extras) || 0 };
          // Total $ se escribe más abajo, después de la celda de tarifa HE.
          row.getCell(COL_TOTAL_AMT).value = Number(w.totals.amount) || 0;
        } else if ((isCosecha || isTrato) && combos.length > 0) {
          // Total por combo: SUM hacia la derecha tomando solo las cols de ese combo.
          combos.forEach((cb, ci) => {
            const cells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * cellsPerDay + ci)}${rowNum}`).join(",");
            const totQty = isCosecha
              ? [...w.byDate.values()].reduce((s, c) => s + (Number(c.byCombo?.get(cb.key)?.kilos) || 0), 0)
              : [...w.byDate.values()].reduce((s, c) => s + (Number(c.byTier?.get(cb.key)?.qty) || 0), 0);
            row.getCell(COL_TOTAL_QTY_BY_COMBO[ci]).value = { formula: `SUM(${cells})`, result: totQty };
          });
          // Total $: suma de los subtotales por día.
          const subAmtCells = dates.map((_, di) => `${colLetter(COL_FIRST_DAY + di * cellsPerDay + combos.length)}${rowNum}`).join(",");
          row.getCell(COL_TOTAL_AMT).value = { formula: `SUM(${subAmtCells})`, result: Number(w.totals.amount) || 0 };
        } else if (isCosecha || isTrato) {
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
          } else if ((isCosecha || isTrato) && combos.length > 0) {
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
      } else if ((isCosecha || isTrato) && combos.length > 0) {
        COL_TOTAL_QTY_BY_COMBO.forEach((col) => {
          totalRow.getCell(col).value = { formula: sumDown(col), result: 0 };
        });
      } else if (isCosecha || isTrato) {
        totalRow.getCell(COL_TOTAL_AMT + 1).value = { formula: sumDown(COL_TOTAL_AMT + 1), result: 0 };
      }
      totalRow.getCell(COL_TOTAL_AMT).value = { formula: sumDown(COL_TOTAL_AMT), result: 0 };

      // Estilo de la fila de totales.
      const lastTotalCol = (isCosecha || isTrato) && combos.length === 0 ? COL_TOTAL_AMT + 1 : COL_TOTAL_AMT;
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
        } else if ((isCosecha || isTrato) && combos.length > 0) {
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
          const horasRef = `${colLetter(COL_TOTAL_HORAS)}${rowNum}`;
          const extrasRef = `${colLetter(COL_TOTAL_EXTRAS)}${rowNum}`;
          ws.getRow(rowNum).getCell(COL_TOTAL_AMT).value = {
            formula: `${baseRef}+${horasRef}*${heRef}+${extrasRef}`,
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
    } catch (err) {
      toast.error("Error al exportar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    if (!ref.current) return;
    const html = ref.current.outerHTML;
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${displayName} — trabajadores</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #888; padding: 5px 7px; font-size: 11px; }
        /* Hace que el thead se repita en cada hoja nueva (Chrome/Firefox). */
        thead { display: table-header-group; }
        tfoot { display: table-row-group; }
        tr { page-break-inside: avoid; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style>
    </head><body>${html}<script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
    win.document.close();
  };

  if (allWorkers.length === 0 || dates.length === 0) return null;

  // Sumas por columna (día) — pie de tabla.
  const dayTotals = new Map();
  for (const d of dates) dayTotals.set(d, { qty: 0, amount: 0, jornadas: 0, overtimeHours: 0, pisoAmount: 0 });
  for (const w of workers) {
    for (const [d, c] of w.byDate.entries()) {
      const t = dayTotals.get(d);
      if (!t) continue;
      t.qty += c.qty;
      t.amount += c.amount;
      t.jornadas += c.jornadas;
      t.overtimeHours += c.overtimeHours || 0;
      t.pisoAmount += c.pisoAmount || 0;
    }
  }
  const grand = { qty: 0, amount: 0, jornadas: 0, overtimeHours: 0, pisoAmount: 0 };
  for (const w of workers) {
    grand.qty += w.totals.qty;
    grand.amount += w.totals.amount;
    grand.jornadas += w.totals.jornadas || 0;
    grand.overtimeHours += w.totals.overtimeHours || 0;
    grand.pisoAmount += w.totals.pisoAmount || 0;
  }

  const containerName = labor?.type === "cosecha" && containers.size === 1
    ? containerLabel(catalogs, [...containers][0])
    : null;

  // Contenido de una celda (trabajador, día). En cosecha y trato, la cantidad
  // arriba y el monto chico abajo; en el resto, el monto es la línea
  // principal. El piso va con 🪙. En tratoHE no se muestra la jornada (cada
  // día con trabajo es una) y el monto lleva "(X HE)" si hubo horas extras.
  const renderCell = (c) => {
    if (!c || (!c.qty && !c.amount && !c.pisoAmount)) return null;
    const lines = [];
    const t = labor?.type;
    if (c.pisoAmount > 0 && !c.qty && !c.jornadas) {
      lines.push(
        <div key="piso" style={{ color: "#b45309", fontSize: 10 }}>🪙 {fmtCurrency(c.pisoAmount)}</div>,
      );
    } else if (t === "cosecha") {
      const main = (
        <div key="kg" style={{ fontWeight: 600 }}>
          {fmtNumber(c.qty)}{containerName ? ` ${containerName.toLowerCase()}` : ""}
        </div>
      );
      lines.push(main);
      if (c.byCombo && c.byCombo.size > 1) {
        for (const [, b] of c.byCombo) {
          lines.push(
            <div key={`${b.qx}_${b.cy}`} style={{ fontSize: 9, color: "#666" }}>
              {qualityLabel(catalogs, b.qx)}: {fmtNumber(b.kilos)}
            </div>,
          );
        }
      }
    } else if (t === "trato") {
      lines.push(<div key="qty" style={{ fontWeight: 600 }}>{fmtNumber(c.qty)}</div>);
    } else if (t === "tratoHE") {
      // Sin línea de jornada: solo la del monto, más abajo.
    } else {
      // main, supervision, extra (y tratoEtapas): sin línea de cantidad; el
      // monto es la línea principal y la cantidad va en la columna Total.
    }
    if (c.pisoAmount > 0 && (c.qty || c.jornadas)) {
      lines.push(
        <div key="piso" style={{ color: "#b45309", fontSize: 9 }}>🪙 {fmtCurrency(c.pisoAmount)}</div>,
      );
    }
    if (c.amount) {
      const heSuffix = (t === "tratoHE" && c.overtimeHours > 0)
        ? ` (${fmtNumber(c.overtimeHours)} HE)`
        : "";
      // En cosecha y trato la cantidad va arriba y el monto abajo, chico y
      // gris; en el resto el monto es la línea principal, más grande y oscura.
      const isMainLine = t !== "cosecha" && t !== "trato";
      const fontSize = isMainLine ? 11 : 9;
      const fontWeight = isMainLine ? 600 : 400;
      lines.push(
        <div key="amt" style={{ fontSize, fontWeight, color: isMainLine ? "#000" : "#555" }}>
          {fmtCurrency(c.amount)}{heSuffix}
        </div>,
      );
    }
    return <>{lines}</>;
  };

  // Cuerpo de la grilla, que se dibuja en línea o dentro del Modal "Ampliar".
  // Según `expanded` hay una sola instancia montada, así el ref apunta
  // siempre a la activa.
  const gridBody = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{titles?.main || "DETALLE DE JORNADA"}</div>
          {titles?.subtitle && <div style={{ fontSize: 12, color: "#555" }}>{titles.subtitle}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{displayName}</div>
          <div style={{ fontSize: 11, color: "#555" }}>
            {workers.length} trabajador{workers.length === 1 ? "" : "es"} · {dates.length} día{dates.length === 1 ? "" : "s"} · {unit}
          </div>
        </div>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#9dc3e6" }}>
              <th style={cellH}>Trabajador</th>
              {dates.map((d) => {
                const isRed = redDates.has(d);
                const cellStyle = {
                  ...cellH,
                  textAlign: "center",
                  minWidth: 70,
                  ...(isRed ? { background: "#ffc7ce", color: "#9c0006" } : {}),
                };
                return (
                  <th key={d} style={cellStyle}>
                    <div>{dateLabel(d)}</div>
                    {(() => {
                      // Precio + unidad configurado para ese día (ej. "$300/árbol",
                      // "$45/saco"). Vacío si no hay precio o si es tratoHE.
                      const priceLine = formatLaborDayPrice(labor, d, dayPrices, catalogs);
                      if (!priceLine) return null;
                      return (
                        <div style={{ fontSize: 9, fontWeight: 400, color: "#555", marginTop: 2 }}>
                          {priceLine}
                        </div>
                      );
                    })()}
                  </th>
                );
              })}
              <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total {unit}</th>
              {labor?.type === "tratoHE" && (
                <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total HE</th>
              )}
              <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total $</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.rut}>
                <td style={{ ...cell, fontWeight: 600 }}>
                  <div>{w.name}</div>
                  <div style={{ fontSize: 9, color: "#777", fontFamily: "ui-monospace, monospace" }}>{w.rut}</div>
                </td>
                {dates.map((d) => (
                  <td key={d} style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                    {renderCell(w.byDate.get(d))}
                  </td>
                ))}
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {labor?.type === "tratoHE"
                    ? fmtNumber(w.totals.jornadas)
                    : fmtNumber(w.totals.qty)}
                </td>
                {labor?.type === "tratoHE" && (
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {w.totals.overtimeHours > 0 ? `${fmtNumber(w.totals.overtimeHours)} HE` : ""}
                  </td>
                )}
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(w.totals.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#c6efce", fontWeight: 700 }}>
              <td style={{ ...cell, fontWeight: 700 }}>Total día</td>
              {dates.map((d) => {
                const t = dayTotals.get(d);
                const lt = labor?.type;
                const isHE = lt === "tratoHE";
                // Cosecha, trato y tratoEtapas muestran la cantidad arriba;
                // tratoHE, main, supervision y extra solo el monto (las
                // jornadas van en la columna Total de la derecha).
                const showQty = lt === "cosecha" || lt === "trato" || lt === "tratoEtapas";
                const amtLine = isHE && t.overtimeHours > 0
                  ? `${fmtCurrency(t.amount)} (${fmtNumber(t.overtimeHours)} HE)`
                  : fmtCurrency(t.amount);
                return (
                  <td key={d} style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {showQty && <div>{fmtNumber(t.qty)}</div>}
                    <div style={{ fontSize: showQty ? 9 : 11, color: "#333" }}>{amtLine}</div>
                  </td>
                );
              })}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {labor?.type === "tratoHE"
                  ? fmtNumber(grand.jornadas)
                  : fmtNumber(grand.qty)}
              </td>
              {labor?.type === "tratoHE" && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {grand.overtimeHours > 0 ? `${fmtNumber(grand.overtimeHours)} HE` : ""}
                </td>
              )}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(grand.amount)}
              </td>
            </tr>
          {anyPiso && grand.pisoAmount > 0 && (
            <tr style={{ background: "#fce4d6" }}>
              <td style={{ ...cell, fontWeight: 700, color: "#b45309" }} colSpan={dates.length + 1}>
                🪙 Total pisos
              </td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>—</td>
              {labor?.type === "tratoHE" && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>—</td>
              )}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(grand.pisoAmount)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </>
  );

  // Estilo de la tarjeta, igual en línea y en el modal, con el padding y los
  // colores del impreso. `width: max-content` deja que cada columna conserve
  // su ancho natural aunque la tabla supere la ventana; el contenedor de
  // afuera hace el scroll.
  const cardStyles = {
    background: "#ffffff",
    color: "#000",
    padding: 14,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    width: "max-content",
    minWidth: "100%",
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Resumen por trabajador — <span className="text-[var(--color-muted)]">{displayName}</span>
          {hiddenRuts.size > 0 && (
            <span className="ml-2 rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-warning)]">
              {workers.length}/{allWorkers.length} visibles
            </span>
          )}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`rounded-md border px-2 py-1 text-xs ${
              filterOpen || hiddenRuts.size > 0
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
            }`}
            title="Filtrar trabajadores visibles"
          >
            👥 Filtrar
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            title="Ver en grande (modal con scroll horizontal)"
          >
            🔍 Ampliar
          </button>
          <button
            onClick={handleXlsx}
            disabled={busy === "xlsx"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            title="Exportar a Excel (columnas numéricas listas para sumar)"
          >
            {busy === "xlsx" ? "..." : "📊 XLSX"}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy === "copy"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            title="Copiar imagen al portapapeles"
          >
            {busy === "copy" ? "..." : "📋"}
          </button>
          <button
            onClick={handleDownload}
            disabled={busy === "download"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            title="Descargar PNG"
          >
            {busy === "download" ? "..." : "📥"}
          </button>
          <button
            onClick={handlePrint}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            title="Imprimir"
          >
            🖨
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="mb-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[11px] text-[var(--color-muted)]">
              Click para ocultar/mostrar trabajadores. Las sumas y el XLSX reflejan solo los visibles.
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setHiddenRuts(new Set())}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
              >
                Mostrar todos
              </button>
              <button
                onClick={() => setHiddenRuts(new Set(allWorkers.map((w) => w.rut)))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
              >
                Ocultar todos
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {allWorkers.map((w) => {
              const hidden = hiddenRuts.has(w.rut);
              return (
                <button
                  key={w.rut}
                  onClick={() => setHiddenRuts((prev) => {
                    const next = new Set(prev);
                    if (next.has(w.rut)) next.delete(w.rut);
                    else next.add(w.rut);
                    return next;
                  })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    hidden
                      ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] line-through opacity-60"
                      : "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}
                  title={hidden ? "Click para mostrar" : "Click para ocultar"}
                >
                  {hidden ? "👁‍🗨" : "👁"} {w.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* En línea: scroll horizontal dentro del modal padre. El PNG y la
          impresión toman el div interno, de ancho completo, sin el recorte
          del contenedor. */}
      {!expanded && (
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <div ref={ref} style={cardStyles}>
            {gridBody}
          </div>
        </div>
      )}
      {/* Modal "Ampliar": la misma grilla en un área más grande, con scroll.
          Con `expanded`, `ref` apunta al div de acá, así que los botones de
          exportar e imprimir siguen funcionando. */}
      {expanded && (
        <Modal
          open={expanded}
          onClose={() => setExpanded(false)}
          title={`📊 ${displayName} — Resumen por trabajador`}
          size="xl"
          footer={
            <>
              <button
                onClick={() => setExpanded(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
              >
                Cerrar
              </button>
              <button
                onClick={handleCopy}
                disabled={busy === "copy"}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                {busy === "copy" ? "Copiando..." : "📋 Copiar imagen"}
              </button>
              <button
                onClick={handleDownload}
                disabled={busy === "download"}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                {busy === "download" ? "Descargando..." : "📥 Descargar PNG"}
              </button>
              <button
                onClick={handlePrint}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
              >
                🖨 Imprimir
              </button>
            </>
          }
        >
          <div style={{ overflow: "auto", maxHeight: "75vh" }}>
            <div ref={ref} style={cardStyles}>
              {gridBody}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
