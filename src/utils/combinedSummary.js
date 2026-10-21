// Cálculo de la tabla general del resumen de producción: los días con datos,
// la celda de cada labor por día, el total por día, las reglas de ganancia
// por labor y las filas de cierre. `settings` son los ajustes de ganancia:
// `{ generalPct, pctOverrides, paidToUs, workersPaid }`, con los tres mapas
// por colKey (cycleId__laborId).

export const isWorkdayCol = (col) => col.labor.type === "main";

// Supervisión no se cobra aparte: su monto se descuenta entero de la
// ganancia (ganancia negativa) y su total general es $0. Es un costo interno
// que cubre el margen de las demás labores.
export const isSupervisionCol = (col) => col.labor.type === "supervision";

// % de ganancia de una labor: el propio si se editó, si no el general.
export const columnPct = (colKey, { pctOverrides, generalPct }) => pctOverrides[colKey] ?? generalPct;

// Ganancia por labor. Cosecha, trato y por etapas: monto × %. Pago al día:
// sin %; lo que paga el cliente (paidToUs) menos el monto, o la cifra entera
// si ya se pagó a los trabajadores (workersPaid).
export function columnProfit(col, totalAmount, settings) {
  const { paidToUs, workersPaid } = settings;
  if (isWorkdayCol(col)) {
    const paid = Number(paidToUs[col.key]) || 0;
    if (workersPaid[col.key]) return paid;
    return paid - totalAmount;
  }
  if (isSupervisionCol(col)) return -totalAmount;
  return (totalAmount * columnPct(col.key, settings)) / 100;
}

// Total general por columna: monto + ganancia. Pago al día ya pagado a los
// trabajadores: solo lo que paga el cliente. Supervisión: siempre $0, para
// que lo facturado no dependa del gasto en supervisión; ese costo aparece
// solo como descuento informativo en la fila MONTO LIBRE.
export function columnTotalGeneral(col, totalAmount, settings) {
  const { paidToUs, workersPaid } = settings;
  if (isSupervisionCol(col)) return 0;
  if (isWorkdayCol(col) && workersPaid[col.key]) {
    return Number(paidToUs[col.key]) || 0;
  }
  return totalAmount + columnProfit(col, totalAmount, settings);
}

// Solo días que tengan al menos un dato en alguna labor visible.
export function activeDaysOf(dataByColumn) {
  const set = new Set();
  for (const d of dataByColumn) for (const r of d.rows) set.add(r.day);
  return [...set].sort();
}

// Por labor: día → celda.
export function cellsByLaborDay(dataByColumn) {
  const m = new Map();
  for (const d of dataByColumn) {
    const inner = new Map();
    for (const r of d.rows) inner.set(r.day, r.cell);
    m.set(d.col.key, inner);
  }
  return m;
}

export function totalsByDayOf(activeDays, dataByColumn, byLaborDay) {
  const out = new Map();
  for (const day of activeDays) {
    let sum = 0;
    for (const d of dataByColumn) {
      const c = byLaborDay.get(d.col.key)?.get(day);
      if (c) sum += c.amount || 0;
    }
    out.set(day, sum);
  }
  return out;
}

// Filas de cierre. GANANCIAS muestra el margen de las labores facturables,
// sin el descuento de supervisión. La fila MONTO LIBRE muestra ese descuento
// por columna y, en el total, ganancia − supervisión (`totalProfit`). Con IVA
// se agregan IVA (19% del TOTAL GENERAL) y BRUTO.
export function closingTotals(dataByColumn, settings) {
  const sum = (fn) => dataByColumn.reduce((s, d) => s + fn(d), 0);
  const grandTotalGeneral = sum((d) => columnTotalGeneral(d.col, d.totalAmount, settings));
  const grandTotalVat = grandTotalGeneral * 0.19;
  return {
    grandTotal: sum((d) => d.totalAmount || 0),
    totalProfit: sum((d) => columnProfit(d.col, d.totalAmount, settings)),
    totalProfitBillable: sum((d) => (isSupervisionCol(d.col) ? 0 : columnProfit(d.col, d.totalAmount, settings))),
    totalSupervisionDeduction: sum((d) => (isSupervisionCol(d.col) ? columnProfit(d.col, d.totalAmount, settings) : 0)),
    hasSupervisionCols: dataByColumn.some((d) => isSupervisionCol(d.col)),
    grandTotalGeneral,
    grandTotalVat,
    grandTotalGross: grandTotalGeneral + grandTotalVat,
  };
}
