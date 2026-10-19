import { containerLabel, getDayCombos, getDaySingle, getTratoTierTotals, getTratoTiers, qualityLabel, tratoUnitLabel } from "../../../utils/cosechaCombos";
import { isRedDay } from "../../../utils/tratoHE";
import { dateLabel } from "../../../utils/cycleSummary";

// XLSX del resumen consolidado: una hoja por labor, una por transportista y
// la hoja Total. Cada hoja deja la columna A vacía (mitad de ancho) y la
// fila 1 vacía; los datos arrancan en B2. Cosecha y trato se desglosan por
// (día, combo/tier) con precios editables; tratoHE tiene tarifa HE editable
// y fórmulas Base + HE × tarifa + Extras. Subtotales y total con SUM() para
// recalcular al editar precios.
export async function writeCycleSummaryXlsx({ carrierById, catalogs, charge, chargeCarriers, chargeLabors, cycle, dayPrices, grandTotalCharge, grandTotalPay, laborsData, mode, subtotalCharge, titles, transportData, workdaysByLabor }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const colLetter = (n) => {
    let s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const usedNames = new Set();
  const safeName = (s) => {
    let base = String(s || "Hoja").substring(0, 28).replace(/[\\/?*[\]]/g, "_");
    let name = base, i = 2;
    while (usedNames.has(name)) {
      name = `${base} ${i}`.substring(0, 31);
      i++;
    }
    usedNames.add(name);
    return name;
  };
  const moneyFmt = '"$"#,##0;[Red]-"$"#,##0';
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9DC3E6" } };
  const subtotalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
  const editableFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  const transportFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE5D6" } };
  const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA9D08E" } };

  const laborsForMode = mode === "charge" ? chargeLabors : laborsData;
  const carriersForMode = mode === "charge" ? chargeCarriers : transportData;

  // Para la hoja Total: { displayName, sheetName, totalRef, fallback } por hoja.
  const sheetTotals = [];

  // ============ HOJAS DE LABORES ============
  for (const ld of laborsForMode) {
    if (mode === "charge" && !ld.include) continue;
    // Las labores importadas de otro ciclo no van al Excel: su desglose
    // por combo o tier se arma releyendo las jornadas de este ciclo.
    if (ld.importedFrom) continue;
    const labor = ld.labor;
    if (!ld.rows || ld.rows.length === 0) continue;
    const displayName = titles.laborNames?.[labor.id] || labor.name;
    const sheetName = safeName(displayName);
    const ws = wb.addWorksheet(sheetName);
    ws.getColumn(1).width = 6;

    // Título en B2
    ws.getCell("B2").value = displayName;
    ws.getCell("B2").font = { bold: true, size: 14 };

    const isCosecha = labor.type === "cosecha";
    const isTrato = labor.type === "trato";
    const isHE = labor.type === "tratoHE";

    // Días en rojo en la columna Fecha (solo tratoHE): fines de semana y
    // feriados.
    const redDates = new Set();
    if (isHE) {
      for (const r of ld.rows) {
        const cfg = getDaySingle(dayPrices, labor.id, r.date, "normal");
        if (isRedDay(r.date, cfg)) redDates.add(r.date);
      }
    }

    if (isCosecha || isTrato) {
      // Estructura: B Fecha | C Combo/Tier | D Cantidad | E Precio | F Total
      // En cobrar, una sola tarifa editable en C3 que todas las filas referencian.
      let chargeRef = null;
      if (mode === "charge") {
        ws.getCell("B3").value = "Tarifa cobro:";
        ws.getCell("B3").font = { bold: true };
        const c3 = ws.getCell("C3");
        c3.value = Number(ld.rate) || 0;
        c3.numFmt = moneyFmt;
        c3.fill = editableFill;
        chargeRef = "$C$3";
      }

      const HEADER_ROW = mode === "charge" ? 5 : 4;
      const headerCells = ["B", "C", "D", "E", "F"];
      const headers = ["Fecha", isCosecha ? "Combo (Calidad / Envase)" : "Tipo de precio", "Cantidad", "Precio", "Total"];
      headerCells.forEach((col, i) => {
        const c = ws.getCell(`${col}${HEADER_ROW}`);
        c.value = headers[i];
        c.font = { bold: true };
        c.fill = headerFill;
        c.alignment = { horizontal: i === 0 || i === 1 ? "left" : "right" };
      });

      // Construir filas desglosadas por (fecha, combo/tier).
      const wdMap = workdaysByLabor[labor.id] || {};
      const dayMap = new Map();
      for (const k in wdMap) {
        const wd = wdMap[k];
        if (wd?.pisoOnly) continue;
        let key, label, qty;
        if (isCosecha) {
          const qx = Number(wd.qualityX) || 0;
          const cy = Number(wd.containerY) || 0;
          key = `${qx}_${cy}`;
          label = `${qualityLabel(catalogs, qx)} / ${containerLabel(catalogs, cy)}`;
          qty = Number(wd.qty) || 0;
        } else {
          const parts = String(k).split("__");
          key = parts[2] || "t0";
          const t = getTratoTierTotals(wd);
          const tiers = getTratoTiers(dayPrices, labor.id, wd.date);
          const tier = tiers.find((x) => x.key === key);
          const unitLabel = tier?.unit != null ? tratoUnitLabel(catalogs, tier.unit) : null;
          label = unitLabel || `Precio ${Number(key.replace(/^t/, "")) + 1}`;
          qty = t.qty;
        }
        if (qty <= 0) continue;
        if (!dayMap.has(wd.date)) dayMap.set(wd.date, new Map());
        const m = dayMap.get(wd.date);
        if (!m.has(key)) m.set(key, { key, label, qty: 0 });
        m.get(key).qty += qty;
      }

      const sortedDates = [...dayMap.keys()].sort();
      let curRow = HEADER_ROW + 1;
      const dataStartRow = curRow;
      for (const date of sortedDates) {
        const items = [...dayMap.get(date).values()].sort((a, b) => a.label.localeCompare(b.label));
        for (const it of items) {
          const dateCell = ws.getCell(`B${curRow}`);
          dateCell.value = dateLabel(date);
          ws.getCell(`C${curRow}`).value = it.label;
          const qCell = ws.getCell(`D${curRow}`);
          qCell.value = it.qty;
          qCell.numFmt = "#,##0.##";
          qCell.alignment = { horizontal: "right" };
          const pCell = ws.getCell(`E${curRow}`);
          if (mode === "charge") {
            pCell.value = { formula: chargeRef, result: Number(ld.rate) || 0 };
          } else {
            let price = 0;
            if (isCosecha) {
              const list = getDayCombos(dayPrices, labor.id, date, "unit");
              const hit = list.find((c) => c.key === it.key);
              price = Number(hit?.price) || 0;
            } else {
              const list = getTratoTiers(dayPrices, labor.id, date, "unit");
              const hit = list.find((c) => c.key === it.key);
              price = Number(hit?.price) || 0;
            }
            pCell.value = price;
            pCell.fill = editableFill;
          }
          pCell.numFmt = moneyFmt;
          const tCell = ws.getCell(`F${curRow}`);
          const priceResult = mode === "charge"
            ? Number(ld.rate) || 0
            : Number(pCell.value) || 0;
          tCell.value = { formula: `D${curRow}*E${curRow}`, result: it.qty * priceResult };
          tCell.numFmt = moneyFmt;
          curRow++;
        }
      }
      const dataEndRow = curRow - 1;

      // Subtotal
      const subRow = curRow;
      for (const col of headerCells) {
        ws.getCell(`${col}${subRow}`).fill = subtotalFill;
        ws.getCell(`${col}${subRow}`).font = { bold: true };
      }
      ws.getCell(`B${subRow}`).value = "Subtotal";
      if (dataEndRow >= dataStartRow) {
        ws.getCell(`D${subRow}`).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})`, result: 0 };
        ws.getCell(`D${subRow}`).numFmt = "#,##0.##";
        ws.getCell(`F${subRow}`).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})`, result: ld.totals.amount };
        ws.getCell(`F${subRow}`).numFmt = moneyFmt;
      }
      const fallbackCos = mode === "charge" ? (ld.chargedTotals?.amount ?? ld.totals.amount) : ld.totals.amount;
      sheetTotals.push({ displayName, sheetName, totalRef: `'${sheetName}'!$F$${subRow}`, fallback: fallbackCos });

      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 30;
      ws.getColumn(4).width = 12;
      ws.getColumn(5).width = 12;
      ws.getColumn(6).width = 14;
      ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
    }
    else if (isHE) {
      // tratoHE: B Fecha | C Base $ | D HE (hrs) | E Tarifa HE (ref) | F Extras $ | G Total
      // Tarifa HE editable en C3.
      ws.getCell("B3").value = "Tarifa HE:";
      ws.getCell("B3").font = { bold: true };
      const c3 = ws.getCell("C3");
      // Tarifa HE inicial: (monto − base) / horas HE, o 0 si no hay horas.
      const totalHE = ld.totals.overtimeHours || 0;
      const implicitRate = totalHE > 0 ? Math.round(ld.totals.amount - ld.totals.qty) / Math.max(totalHE, 1) : 0;
      c3.value = totalHE > 0 ? Math.max(0, Math.round(implicitRate)) : 0;
      c3.numFmt = moneyFmt;
      c3.fill = editableFill;
      const heRateRef = "$C$3";

      const HEADER_ROW = 5;
      const cols = ["B", "C", "D", "E", "F", "G"];
      const headers = ["Fecha", "Base $", "HE (hrs)", "Tarifa HE", "Extras $", "Total $"];
      cols.forEach((col, i) => {
        const c = ws.getCell(`${col}${HEADER_ROW}`);
        c.value = headers[i];
        c.font = { bold: true };
        c.fill = headerFill;
        c.alignment = { horizontal: i === 0 ? "left" : "right" };
      });

      let curRow = HEADER_ROW + 1;
      const dataStartRow = curRow;
      // En cobrar, chargedRows (con overrides y filas extra).
      const heRows = mode === "charge" ? (ld.chargedRows || ld.rows) : ld.rows;
      for (const r of heRows) {
        const isRed = redDates.has(r.date);
        const dCell = ws.getCell(`B${curRow}`);
        dCell.value = r.date ? dateLabel(r.date) : (r.isExtra ? "(ajuste)" : "");
        if (isRed) dCell.font = { bold: true, color: { argb: "FFCC0000" } };

        const baseV = mode === "charge" ? Number(r.chargedQty) || 0 : Number(r.qty) || 0;
        const heHrs = mode === "charge" ? Number(r.chargedOvertimeHours) || 0 : Number(r.overtimeHours) || 0;
        const heAmt = heHrs * (Number(c3.value) || 0);
        const amountForExtras = mode === "charge" ? Number(r.chargedAmount) || 0 : Number(r.amount) || 0;
        const extras = Math.max(0, amountForExtras - baseV - heAmt);

        const base = ws.getCell(`C${curRow}`);
        base.value = baseV;
        base.numFmt = moneyFmt;
        const he = ws.getCell(`D${curRow}`);
        he.value = heHrs;
        he.numFmt = "#,##0.##";
        const rate = ws.getCell(`E${curRow}`);
        rate.value = { formula: heRateRef, result: Number(c3.value) || 0 };
        rate.numFmt = moneyFmt;
        const ex = ws.getCell(`F${curRow}`);
        ex.value = extras;
        ex.numFmt = moneyFmt;
        ex.fill = editableFill;
        const tot = ws.getCell(`G${curRow}`);
        tot.value = {
          formula: `C${curRow}+D${curRow}*${heRateRef}+F${curRow}`,
          result: baseV + heAmt + extras,
        };
        tot.numFmt = moneyFmt;
        curRow++;
      }
      const dataEndRow = curRow - 1;

      const subRow = curRow;
      for (const col of cols) {
        ws.getCell(`${col}${subRow}`).fill = subtotalFill;
        ws.getCell(`${col}${subRow}`).font = { bold: true };
      }
      ws.getCell(`B${subRow}`).value = "Subtotal";
      if (dataEndRow >= dataStartRow) {
        ws.getCell(`C${subRow}`).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})`, result: 0 };
        ws.getCell(`C${subRow}`).numFmt = moneyFmt;
        ws.getCell(`D${subRow}`).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})`, result: 0 };
        ws.getCell(`D${subRow}`).numFmt = "#,##0.##";
        ws.getCell(`F${subRow}`).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})`, result: 0 };
        ws.getCell(`F${subRow}`).numFmt = moneyFmt;
        ws.getCell(`G${subRow}`).value = { formula: `SUM(G${dataStartRow}:G${dataEndRow})`, result: ld.totals.amount };
        ws.getCell(`G${subRow}`).numFmt = moneyFmt;
      }
      const fallbackHE = mode === "charge" ? (ld.chargedTotals?.amount ?? ld.totals.amount) : ld.totals.amount;
      sheetTotals.push({ displayName, sheetName, totalRef: `'${sheetName}'!$G$${subRow}`, fallback: fallbackHE });

      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 14;
      ws.getColumn(4).width = 12;
      ws.getColumn(5).width = 12;
      ws.getColumn(6).width = 14;
      ws.getColumn(7).width = 14;
      ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
    }
    else {
      // main / supervision / extra (y tratoEtapas): B Fecha | C Jornadas | D $ jornada | E Total
      // En cobrar, C3 muestra la tarifa de la labor y cada fila lleva la suya.
      let chargeRef = null;
      if (mode === "charge") {
        ws.getCell("B3").value = "Tarifa cobro:";
        ws.getCell("B3").font = { bold: true };
        const c3 = ws.getCell("C3");
        c3.value = Number(ld.rate) || 0;
        c3.numFmt = moneyFmt;
        c3.fill = editableFill;
        chargeRef = "$C$3";
      }

      const HEADER_ROW = mode === "charge" ? 5 : 4;
      const cols = ["B", "C", "D", "E"];
      const headers = ["Fecha", "Jornadas", "$ por jornada", "Total"];
      cols.forEach((col, i) => {
        const c = ws.getCell(`${col}${HEADER_ROW}`);
        c.value = headers[i];
        c.font = { bold: true };
        c.fill = headerFill;
        c.alignment = { horizontal: i === 0 ? "left" : "right" };
      });

      let curRow = HEADER_ROW + 1;
      const dataStartRow = curRow;
      // En cobrar, chargedRows (con overrides y filas extra).
      const simpleRows = mode === "charge" ? (ld.chargedRows || ld.rows) : ld.rows;
      for (const r of simpleRows) {
        ws.getCell(`B${curRow}`).value = r.date ? dateLabel(r.date) : (r.isExtra ? "(ajuste)" : "");
        const qCell = ws.getCell(`C${curRow}`);
        const qtyV = mode === "charge" ? Number(r.chargedQty) || 0 : Number(r.qty) || 0;
        qCell.value = qtyV;
        qCell.numFmt = "#,##0";
        const pCell = ws.getCell(`D${curRow}`);
        if (mode === "charge") {
          // En cobrar la tarifa puede tener override por fila: va el valor
          // literal, sin referenciar $C$3.
          pCell.value = Number(r.chargedRate) || 0;
          pCell.fill = editableFill;
        } else {
          const rate = r.qty > 0 ? Math.round(r.amount / r.qty) : 0;
          pCell.value = rate;
          pCell.fill = editableFill;
        }
        pCell.numFmt = moneyFmt;
        const tCell = ws.getCell(`E${curRow}`);
        const amountResult = mode === "charge" ? Number(r.chargedAmount) || 0 : Number(r.amount) || 0;
        tCell.value = { formula: `C${curRow}*D${curRow}`, result: amountResult };
        tCell.numFmt = moneyFmt;
        curRow++;
      }
      const dataEndRow = curRow - 1;

      const subRow = curRow;
      for (const col of cols) {
        ws.getCell(`${col}${subRow}`).fill = subtotalFill;
        ws.getCell(`${col}${subRow}`).font = { bold: true };
      }
      ws.getCell(`B${subRow}`).value = "Subtotal";
      if (dataEndRow >= dataStartRow) {
        ws.getCell(`C${subRow}`).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})`, result: 0 };
        ws.getCell(`C${subRow}`).numFmt = "#,##0";
        ws.getCell(`E${subRow}`).value = { formula: `SUM(E${dataStartRow}:E${dataEndRow})`, result: ld.totals.amount };
        ws.getCell(`E${subRow}`).numFmt = moneyFmt;
      }
      const fallbackSimple = mode === "charge" ? (ld.chargedTotals?.amount ?? ld.totals.amount) : ld.totals.amount;
      sheetTotals.push({ displayName, sheetName, totalRef: `'${sheetName}'!$E$${subRow}`, fallback: fallbackSimple });

      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 12;
      ws.getColumn(4).width = 14;
      ws.getColumn(5).width = 14;
      ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
    }
  }

  // ============ HOJAS DE TRANSPORTE ============
  for (const tg of carriersForMode) {
    if (mode === "charge" && !tg.include) continue;
    if (!tg.rows || tg.rows.length === 0) continue;
    const fallbackName = carrierById.get(tg.carrierId)?.alias || carrierById.get(tg.carrierId)?.name || "(transportista)";
    const displayName = titles.carrierNames?.[tg.carrierId] || fallbackName;
    const sheetName = safeName(`🚐 ${displayName}`);
    const ws = wb.addWorksheet(sheetName);
    ws.getColumn(1).width = 6;

    ws.getCell("B2").value = `🚐 ${displayName}`;
    ws.getCell("B2").font = { bold: true, size: 14 };

    let chargeRef = null;
    if (mode === "charge") {
      ws.getCell("B3").value = "Tarifa cobro:";
      ws.getCell("B3").font = { bold: true };
      const c3 = ws.getCell("C3");
      c3.value = Number(tg.rate) || 0;
      c3.numFmt = moneyFmt;
      c3.fill = editableFill;
      chargeRef = "$C$3";
    }

    const HEADER_ROW = mode === "charge" ? 5 : 4;
    const cols = ["B", "C", "D", "E"];
    const headers = ["Fecha", "Vueltas", "Precio", "Total"];
    cols.forEach((col, i) => {
      const c = ws.getCell(`${col}${HEADER_ROW}`);
      c.value = headers[i];
      c.font = { bold: true };
      c.fill = transportFill;
      c.alignment = { horizontal: i === 0 ? "left" : "right" };
    });

    let curRow = HEADER_ROW + 1;
    const dataStartRow = curRow;
    const carrierRows = mode === "charge" ? (tg.chargedRows || tg.rows) : tg.rows;
    for (const r of carrierRows) {
      ws.getCell(`B${curRow}`).value = r.date ? dateLabel(r.date) : (r.isExtra ? "(ajuste)" : "");
      const qCell = ws.getCell(`C${curRow}`);
      const countV = mode === "charge" ? Number(r.chargedCount) || 0 : Number(r.count) || 0;
      qCell.value = countV;
      qCell.numFmt = "#,##0";
      const pCell = ws.getCell(`D${curRow}`);
      if (mode === "charge") {
        pCell.value = Number(r.chargedRate) || 0;
        pCell.fill = editableFill;
      } else {
        const rate = r.count > 0 ? Math.round(r.amount / r.count) : 0;
        pCell.value = rate;
        pCell.fill = editableFill;
      }
      pCell.numFmt = moneyFmt;
      const tCell = ws.getCell(`E${curRow}`);
      const amountV = mode === "charge" ? Number(r.chargedAmount) || 0 : Number(r.amount) || 0;
      tCell.value = { formula: `C${curRow}*D${curRow}`, result: amountV };
      tCell.numFmt = moneyFmt;
      curRow++;
    }
    const dataEndRow = curRow - 1;

    const subRow = curRow;
    for (const col of cols) {
      ws.getCell(`${col}${subRow}`).fill = subtotalFill;
      ws.getCell(`${col}${subRow}`).font = { bold: true };
    }
    ws.getCell(`B${subRow}`).value = "Subtotal";
    const totalAmountForSheet = mode === "charge" ? (tg.chargedTotalAmount || 0) : tg.totalAmount;
    if (dataEndRow >= dataStartRow) {
      ws.getCell(`C${subRow}`).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})`, result: 0 };
      ws.getCell(`C${subRow}`).numFmt = "#,##0";
      ws.getCell(`E${subRow}`).value = { formula: `SUM(E${dataStartRow}:E${dataEndRow})`, result: totalAmountForSheet };
      ws.getCell(`E${subRow}`).numFmt = moneyFmt;
    }
    const fallbackTotal = mode === "charge" ? (tg.chargedTotalAmount || 0) : tg.totalAmount;
    sheetTotals.push({ displayName: `🚐 ${displayName}`, sheetName, totalRef: `'${sheetName}'!$E$${subRow}`, fallback: fallbackTotal });

    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 14;
    ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  }

  // ============ HOJA TOTAL GENERAL ============
  // Transporte manual por fila (cobrar): las hojas por labor no tienen esa
  // columna, así que va como línea propia en el Total, igual que en
  // subtotalCobrar.
  if (mode === "charge") {
    let laborTransportSum = 0;
    for (const ld of laborsForMode) {
      if (!ld.include) continue;
      laborTransportSum += Number(ld.chargedTotals?.transport) || 0;
    }
    if (laborTransportSum > 0) {
      sheetTotals.push({ displayName: "Transporte (ajustes en labores)", totalRef: null, fallback: laborTransportSum });
    }
  }
  const wsTotal = wb.addWorksheet(safeName("Total"));
  wsTotal.getColumn(1).width = 6;
  wsTotal.getCell("B2").value = mode === "charge"
    ? (charge.withIva !== false ? "TOTAL A FACTURAR" : "TOTAL A COBRAR (sin IVA)")
    : "TOTAL GENERAL";
  wsTotal.getCell("B2").font = { bold: true, size: 14 };

  const HR = 4;
  const headerCols = ["B", "C"];
  ["Concepto", "Subtotal"].forEach((h, i) => {
    const c = wsTotal.getCell(`${headerCols[i]}${HR}`);
    c.value = h;
    c.font = { bold: true };
    c.fill = headerFill;
    c.alignment = { horizontal: i === 0 ? "left" : "right" };
  });

  let totalRow = HR + 1;
  const totalStart = totalRow;
  for (const st of sheetTotals) {
    wsTotal.getCell(`B${totalRow}`).value = st.displayName;
    const ref = wsTotal.getCell(`C${totalRow}`);
    // Entradas sin hoja propia (ej. transporte manual) van como literal.
    ref.value = st.totalRef ? { formula: st.totalRef, result: st.fallback } : st.fallback;
    ref.numFmt = moneyFmt;
    totalRow++;
  }
  const totalEnd = totalRow - 1;

  // Con descuento (cobrar) van las filas Subtotal y Descuento antes del
  // total, que queda en subtotal − descuento. El IVA, si está activo, se
  // calcula sobre ese total.
  const discountValue = mode === "charge" ? Math.max(0, Number(charge.discount) || 0) : 0;
  const discountNoteValue = mode === "charge" ? (charge.discountNote || "") : "";
  const pendingValue = mode === "charge" ? Math.max(0, Number(charge.pendingBalance) || 0) : 0;
  const pendingNoteValue = mode === "charge" ? (charge.pendingBalanceNote || "") : "";
  let subtotalRow = null;
  let discountRow = null;
  // Antes del total solo entra el descuento; el saldo pendiente se suma
  // después del IVA, al final.
  if (discountValue > 0) {
    subtotalRow = totalRow;
    wsTotal.getCell(`B${subtotalRow}`).value = "Subtotal";
    wsTotal.getCell(`B${subtotalRow}`).font = { bold: true };
    const sub = wsTotal.getCell(`C${subtotalRow}`);
    if (totalEnd >= totalStart) {
      sub.value = { formula: `SUM(C${totalStart}:C${totalEnd})`, result: subtotalCharge };
    } else {
      sub.value = 0;
    }
    sub.numFmt = moneyFmt;
    sub.font = { bold: true };
    totalRow++;

    discountRow = totalRow;
    wsTotal.getCell(`B${discountRow}`).value = discountNoteValue
      ? `Descuento · ${discountNoteValue}`
      : "Descuento";
    wsTotal.getCell(`B${discountRow}`).font = { bold: true, color: { argb: "FFBB0000" } };
    const disc = wsTotal.getCell(`C${discountRow}`);
    disc.value = -discountValue;
    disc.numFmt = moneyFmt;
    disc.font = { bold: true, color: { argb: "FFBB0000" } };
    totalRow++;
  }

  const grandRow = totalRow;
  wsTotal.getCell(`B${grandRow}`).value = mode === "charge"
    ? (charge.withIva !== false ? "TOTAL A FACTURAR" : "TOTAL A COBRAR (sin IVA)")
    : "TOTAL GENERAL";
  wsTotal.getCell(`B${grandRow}`).font = { bold: true };
  wsTotal.getCell(`B${grandRow}`).fill = titleFill;
  const grand = wsTotal.getCell(`C${grandRow}`);
  const grandFallback = mode === "charge" ? grandTotalCharge : grandTotalPay;
  if (subtotalRow != null && discountRow != null) {
    grand.value = { formula: `C${subtotalRow}+C${discountRow}`, result: grandFallback };
  } else if (totalEnd >= totalStart) {
    grand.value = { formula: `SUM(C${totalStart}:C${totalEnd})`, result: grandFallback };
  } else {
    grand.value = 0;
  }
  grand.numFmt = moneyFmt;
  grand.font = { bold: true, size: 12 };
  grand.fill = titleFill;

  // En cobrar con IVA van debajo las filas Valor IVA (19%) e IVA incluido.
  let postIvaRow = grandRow; // fila a la que se suma el saldo pendiente
  const postIvaFallback = (charge.withIva !== false)
    ? Math.round((Number(grandFallback) || 0) * 1.19)
    : Number(grandFallback) || 0;
  if (mode === "charge" && charge.withIva !== false) {
    const ivaRow = grandRow + 1;
    wsTotal.getCell(`B${ivaRow}`).value = "Valor IVA (19%)";
    wsTotal.getCell(`B${ivaRow}`).font = { bold: true };
    const iva = wsTotal.getCell(`C${ivaRow}`);
    iva.value = { formula: `ROUND(C${grandRow}*0.19,0)`, result: Math.round((Number(grandFallback) || 0) * 0.19) };
    iva.numFmt = moneyFmt;
    iva.font = { bold: true };

    const totIvaRow = grandRow + 2;
    wsTotal.getCell(`B${totIvaRow}`).value = "IVA incluido";
    wsTotal.getCell(`B${totIvaRow}`).font = { bold: true, size: 12 };
    wsTotal.getCell(`B${totIvaRow}`).fill = titleFill;
    const totIva = wsTotal.getCell(`C${totIvaRow}`);
    totIva.value = { formula: `C${grandRow}+C${ivaRow}`, result: postIvaFallback };
    totIva.numFmt = moneyFmt;
    totIva.font = { bold: true, size: 12 };
    totIva.fill = titleFill;
    postIvaRow = totIvaRow;
    totalRow = totIvaRow + 1;
  } else {
    totalRow = grandRow + 1;
  }

  // Saldo pendiente, después del IVA: con saldo > 0 van la fila del saldo y
  // TOTAL FINAL = total con IVA (o neto, sin IVA) + saldo.
  if (mode === "charge" && pendingValue > 0) {
    const pendingRow = totalRow;
    wsTotal.getCell(`B${pendingRow}`).value = pendingNoteValue
      ? `Saldo pendiente · ${pendingNoteValue}`
      : "Saldo pendiente";
    wsTotal.getCell(`B${pendingRow}`).font = { bold: true, color: { argb: "FF0A7D3B" } };
    const pend = wsTotal.getCell(`C${pendingRow}`);
    pend.value = pendingValue;
    pend.numFmt = moneyFmt;
    pend.font = { bold: true, color: { argb: "FF0A7D3B" } };
    totalRow++;

    const finalRow = totalRow;
    wsTotal.getCell(`B${finalRow}`).value = "TOTAL FINAL";
    wsTotal.getCell(`B${finalRow}`).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    wsTotal.getCell(`B${finalRow}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6AA84F" },
    };
    const fin = wsTotal.getCell(`C${finalRow}`);
    fin.value = { formula: `C${postIvaRow}+C${pendingRow}`, result: postIvaFallback + pendingValue };
    fin.numFmt = moneyFmt;
    fin.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    fin.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6AA84F" },
    };
  }

  wsTotal.getColumn(2).width = 32;
  wsTotal.getColumn(3).width = 16;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resumen_${mode}_${(cycle?.label || "ciclo").replace(/[/\s]+/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
