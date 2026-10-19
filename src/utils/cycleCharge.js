// Cálculo del modo cobrar del resumen del ciclo: las labores importadas de
// otros ciclos, las filas de cobro de cada labor y transportista (tarifas,
// ajustes por fila y filas manuales) y el subtotal.
import { activityLabel, laborQtyUnit, laborTotals, medianOf } from "./cycleSummary";

// Labores importadas de otros ciclos (solo cobrar). Cada una es una copia
// guardada en `cobrar.importedLabors` —definición de la labor y sus filas
// diarias— que se dibuja con su propio tipo de tabla y suma al total, como
// cualquier labor del ciclo. Su id es propio, así sus tarifas, ajustes y
// `mergeInto` viven en `cobrar.labors[id]` igual que los de las demás.
export function importedLaborsDataOf(importedLabors, catalogs) {
  return (importedLabors || []).map((imp) => {
    const rows = imp.rows || [];
    const containers = new Set(imp.containers || []);
    const tratoUnitsSet = imp.labor?.type === "trato"
      ? new Set(rows.map((r) => r.unit).filter((u) => u != null))
      : null;
    return {
      labor: imp.labor,
      rows,
      totals: laborTotals(rows),
      unit: laborQtyUnit(imp.labor, catalogs, containers, tratoUnitsSet),
      containers,
      tratoUnitsSet,
      importedFrom: {
        cycleLabel: imp.sourceCycleLabel || "",
        redDates: imp.redDates || [],
      },
    };
  });
}

// ============================================================
// Filas de cobro
// ============================================================
//
// La tarifa sugerida es la mediana del precio por día, para que un día
// atípico (una jornada mensual, por ejemplo) no la corra. El promedio
// (`meanRate`) se muestra como referencia en el editor de tarifas cuando
// difiere más de un 10%.
export function chargeLaborsOf(laborsData, importedLaborsData, laborCharges, catalogs) {
  return [...laborsData, ...importedLaborsData].map((ld) => {
    const cfg = laborCharges[ld.labor.id] || {};
    const include = cfg.include !== false;
    const meanRate = ld.totals.qty > 0 ? Math.round(ld.totals.amount / ld.totals.qty) : 0;
    const perDayRates = (ld.rows || [])
      .filter((r) => (Number(r.qty) || 0) > 0)
      .map((r) => (Number(r.amount) || 0) / (Number(r.qty) || 1));
    const medianRate = Math.round(medianOf(perDayRates));
    const defaultRate = medianRate || meanRate;
    const rate = cfg.chargeRate != null ? Number(cfg.chargeRate) : defaultRate;

    // En trato con varios tiers se sugiere una mediana por tier, porque
    // cada tier suele tener su propio precio. Si la labor tiene tarifa fija
    // (`cfg.chargeRate`), esa manda.
    const tierRateMedians = new Map();
    if (ld.labor.type === "trato") {
      const ratesByTier = new Map();
      for (const r of ld.rows || []) {
        if (r.tierIdx == null) continue;
        const q = Number(r.qty) || 0;
        if (q <= 0) continue;
        const ratesArr = ratesByTier.get(r.tierIdx) || [];
        ratesArr.push((Number(r.amount) || 0) / q);
        ratesByTier.set(r.tierIdx, ratesArr);
      }
      for (const [idx, arr] of ratesByTier) {
        tierRateMedians.set(idx, Math.round(medianOf(arr)));
      }
    }
    const activity = activityLabel(ld.labor, catalogs, ld.containers, ld.tratoUnitsSet);

    // Filas de cobro: las del día con sus overrides, más las filas extra.
    // Cada una trae los valores finales (chargedQty, chargedRate,
    // chargedAmount…), que leen los inputs, los totales y el XLSX.
    const rowOverrides = cfg.rowOverrides || {};
    const extraRows = cfg.extraRows || [];
    const isHE = ld.labor.type === "tratoHE";
    // tratoHE: total = base $ + HE × tarifa HE. Otros: total = qty × rate.
    const computeAmount = (qty, hours, rowRate) =>
      isHE ? Number(qty) + Number(hours) * Number(rowRate) : Number(qty) * Number(rowRate);

    // En trato las filas extra no traen unidad: heredan la más frecuente de
    // las filas del día, para que la métrica diga "212 saco" y no "212".
    let dominantUnit = null;
    if (ld.labor.type === "trato") {
      const unitCounts = new Map();
      for (const r of ld.rows || []) {
        if (r.unit != null) unitCounts.set(r.unit, (unitCounts.get(r.unit) || 0) + 1);
      }
      let maxC = 0;
      for (const [u, c] of unitCounts) {
        if (c > maxC) { maxC = c; dominantUnit = u; }
      }
    }
    const chargedRows = (ld.rows || []).map((r) => {
      // Override de la fila: por `rowKey` (en trato, `${date}__${tierKey}`)
      // y, si no hay, por la fecha sola.
      const newKey = r.rowKey || r.date;
      const ov = rowOverrides[newKey] || rowOverrides[r.date] || {};
      const qty = ov.qty != null && ov.qty !== "" ? Number(ov.qty) : Number(r.qty) || 0;
      const overtimeHours = ov.overtimeHours != null && ov.overtimeHours !== ""
        ? Number(ov.overtimeHours)
        : Number(r.overtimeHours) || 0;
      // Prioridad de tarifa: override de la fila → tarifa fija de la labor
      // (cfg.chargeRate) → en tratoEtapas, el precio real de la fila
      // (amount/qty) → mediana del tier (trato) → tarifa sugerida de la
      // labor.
      const tierDefault = r.tierIdx != null ? tierRateMedians.get(r.tierIdx) : null;
      const etapaRealRate = ld.labor.type === "tratoEtapas" && Number(r.qty) > 0
        ? (Number(r.amount) || 0) / Number(r.qty)
        : null;
      const baseRate = cfg.chargeRate != null
        ? Number(cfg.chargeRate)
        : etapaRealRate != null
          ? etapaRealRate
          : (tierDefault != null && tierDefault > 0 ? tierDefault : rate);
      const rowRate = ov.rate != null && ov.rate !== "" ? Number(ov.rate) : baseRate;
      const computedAmount = computeAmount(qty, overtimeHours, rowRate);
      const amount = ov.amount != null && ov.amount !== "" ? Number(ov.amount) : computedAmount;
      // Transporte por fila: monto manual que se suma al total de la fila y
      // al total a cobrar; si se usa, conviene excluir la tabla del
      // transportista para no cobrarlo dos veces. 0 por defecto.
      const transport = ov.transport != null && ov.transport !== "" ? Number(ov.transport) : 0;
      // Personas: informativa; se puede editar y no afecta montos. Por
      // defecto, el conteo real de trabajadores del día.
      const workerCount = ov.workerCount != null && ov.workerCount !== ""
        ? Number(ov.workerCount)
        : Number(r.workerCount) || 0;
      const hasOverride = Object.keys(ov).length > 0;
      return {
        ...r,
        chargedQty: qty,
        chargedOvertimeHours: overtimeHours,
        chargedRate: rowRate,
        chargedAmount: amount,
        chargedTransport: transport,
        chargedWorkerCount: workerCount,
        rowKey: newKey,
        isExtra: false,
        hasOverride,
        override: ov,
      };
    });
    for (const ex of extraRows) {
      const qty = Number(ex.qty) || 0;
      const overtimeHours = Number(ex.overtimeHours) || 0;
      const rowRate = ex.rate != null && ex.rate !== "" ? Number(ex.rate) : rate;
      const computedAmount = computeAmount(qty, overtimeHours, rowRate);
      const amount = ex.amount != null && ex.amount !== "" ? Number(ex.amount) : computedAmount;
      chargedRows.push({
        date: ex.date || "",
        qty: Number(ex.qty) || 0,
        overtimeHours: Number(ex.overtimeHours) || 0,
        amount: amount,
        // Unidad más frecuente de la labor (solo trato), para que
        // formatRowMetric muestre "X saco" fuera de edición.
        unit: ex.unit != null ? ex.unit : dominantUnit,
        pisoAmount: 0,
        pisoCount: 0,
        chargedQty: qty,
        chargedOvertimeHours: overtimeHours,
        chargedRate: rowRate,
        chargedAmount: amount,
        chargedTransport: Number(ex.transport) || 0,
        chargedWorkerCount: ex.workerCount != null && ex.workerCount !== "" ? Number(ex.workerCount) : 0,
        rowKey: `extra:${ex.id}`,
        isExtra: true,
        extraId: ex.id,
        // Origen de una fila importada, para el rótulo "(de ciclo · labor)".
        sourceCycleLabel: ex.sourceCycleLabel || null,
        sourceLaborName: ex.sourceLaborName || null,
      });
    }
    // Orden por fecha; las filas extra sin fecha van al final.
    chargedRows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    let chargedTotalAmount = 0, chargedTotalQty = 0, chargedTotalOvertimeHours = 0,
      chargedTotalTransport = 0, chargedTotalWorkerCount = 0, chargedCountedQty = 0;
    for (const r of chargedRows) {
      chargedTotalAmount += r.chargedAmount;
      chargedTotalQty += r.chargedQty;
      // Unidades (tratoEtapas): solo etapas que cuentan; el resto suma normal.
      if (r.stageCounts === undefined || r.stageCounts) chargedCountedQty += r.chargedQty;
      chargedTotalOvertimeHours += r.chargedOvertimeHours;
      chargedTotalTransport += r.chargedTransport || 0;
      chargedTotalWorkerCount += r.chargedWorkerCount || 0;
    }
    const chargedTotals = {
      amount: chargedTotalAmount,
      qty: chargedTotalQty,
      countedQty: chargedCountedQty,
      overtimeHours: chargedTotalOvertimeHours,
      // Transporte manual por fila: va aparte de amount, así el subtotal de
      // producción no lo incluye y el Total sí.
      transport: chargedTotalTransport,
      pisoAmount: ld.totals.pisoAmount || 0,
      pisoCount: ld.totals.pisoCount || 0,
      // Personas: suma de los conteos por fila (con overrides aplicados —
      // sin ediciones coincide con el dato real).
      workerDays: chargedTotalWorkerCount,
      heTotal: ld.totals.heTotal || 0,
      bonosTotal: ld.totals.bonosTotal || 0,
    };
    return {
      ...ld,
      include,
      rate,
      defaultRate,
      meanRate,
      medianRate,
      activity,
      chargedRows,
      chargedTotals,
      mergeInto: cfg.mergeInto || null,
    };
  });
}

export function chargeCarriersOf(transportData, carrierCharges) {
  return transportData.map((tg) => {
    const cfg = carrierCharges[tg.carrierId] || {};
    const include = cfg.include !== false;
    const defaultRate = tg.totalCount > 0 ? Math.round(tg.totalAmount / tg.totalCount) : 0;
    const rate = cfg.chargeRate != null ? Number(cfg.chargeRate) : defaultRate;

    const rowOverrides = cfg.rowOverrides || {};
    const extraRows = cfg.extraRows || [];
    const chargedRows = (tg.rows || []).map((r) => {
      const ov = rowOverrides[r.date] || {};
      const count = ov.count != null && ov.count !== "" ? Number(ov.count) : Number(r.count) || 0;
      const rowRate = ov.rate != null && ov.rate !== "" ? Number(ov.rate) : rate;
      const computedAmount = count * rowRate;
      const amount = ov.amount != null && ov.amount !== "" ? Number(ov.amount) : computedAmount;
      const hasOverride = Object.keys(ov).length > 0;
      return {
        ...r,
        chargedCount: count,
        chargedRate: rowRate,
        chargedAmount: amount,
        rowKey: r.date,
        isExtra: false,
        hasOverride,
        override: ov,
      };
    });
    for (const ex of extraRows) {
      const count = Number(ex.count) || 0;
      const rowRate = ex.rate != null && ex.rate !== "" ? Number(ex.rate) : rate;
      const computedAmount = count * rowRate;
      const amount = ex.amount != null && ex.amount !== "" ? Number(ex.amount) : computedAmount;
      chargedRows.push({
        date: ex.date || "",
        count: Number(ex.count) || 0,
        amount,
        chargedCount: count,
        chargedRate: rowRate,
        chargedAmount: amount,
        rowKey: `extra:${ex.id}`,
        isExtra: true,
        extraId: ex.id,
      });
    }
    chargedRows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    let chargedTotalAmount = 0, chargedTotalCount = 0;
    for (const r of chargedRows) {
      chargedTotalAmount += r.chargedAmount;
      chargedTotalCount += r.chargedCount;
    }
    return { ...tg, include, rate, defaultRate, chargedRows, chargedTotalAmount, chargedTotalCount };
  });
}

// Subtotal del cobro: labores y transportistas incluidos, sin descuento. Es
// la fila "Subtotal" del desglose.
export function chargeSubtotal(chargeLabors, chargeCarriers) {
  let sum = 0;
  // El transporte manual por fila (chargedTotals.transport) suma al cobro
  // junto con la producción de la labor.
  for (const cl of chargeLabors) if (cl.include) sum += (cl.chargedTotals?.amount || 0) + (cl.chargedTotals?.transport || 0);
  for (const cc of chargeCarriers) if (cc.include) sum += cc.chargedTotalAmount || 0;
  return sum;
}
