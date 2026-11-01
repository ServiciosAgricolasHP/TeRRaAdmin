// Cálculo del Dashboard: lo pagado a trabajadores por mes, la operación, el
// gasto y la deuda con transportistas, el margen por ciclo y la comparativa de
// compras y ventas. Todo sale de documentos ya agregados (nóminas, resúmenes
// de transporte, `summaryTotals` de los ciclos), sin leer jornadas.
//
// Las funciones que dependen del mes en curso reciben `now` (por defecto, la
// fecha de hoy).

import { pendingCashOf } from "../services/payrollsService";
import { daysUntil, groupUpcoming, directionOf, summarize } from "./commitments";
import { CREDIT_NOTE_TYPES } from "./cashFlowProjection";
import { fmtMonthKey, fmtShortDate } from "./format";

// Un ciclo abierto cuyo último día cargado tiene más días que esto se lista
// como sin movimiento. El cierre de un ciclo es manual.
export const STALE_DAYS = 14;

// Ventana de la comparativa de facturación. 6 meses entra cómodo en el límite
// de 30 valores del operador `in`.
export const DTE_MONTHS = 6;

const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const isoOf = (d) => `${monthKeyOf(d)}-${String(d.getDate()).padStart(2, "0")}`;

// Últimas N claves de mes, de la más vieja a la más nueva.
export function lastMonthKeys(n, now = new Date()) {
  const out = [];
  const base = now;
  for (let i = n - 1; i >= 0; i--) {
    out.push(monthKeyOf(new Date(base.getFullYear(), base.getMonth() - i, 1)));
  }
  return out;
}

// "2026-09" -> { start: "2026-09-01", end: "2026-09-30" }
export function monthRangeOfKey(key) {
  const [y, m] = String(key).split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${key}-01`, end: `${key}-${String(lastDay).padStart(2, "0")}` };
}

// El mes actual y el anterior todavía reciben jornadas: su conteo se pide
// cada vez. El de un mes más viejo se guarda `WORKDAY_COUNT_KEEP_DAYS` días.
const OPEN_COUNT_MONTHS = 2;
export const WORKDAY_COUNT_KEEP_DAYS = 7;

// Los meses de `keys` (del más viejo al más nuevo) cuyo conteo de jornadas hay
// que pedir: los dos últimos siempre, y los más viejos si no tienen un conteo
// guardado (`saved`: { [mes]: { count, date } }) de hace menos de
// `WORKDAY_COUNT_KEEP_DAYS` días.
export function workdayMonthsToCount(keys, saved, today) {
  const open = new Set(keys.slice(-OPEN_COUNT_MONTHS));
  return keys.filter((k) => {
    if (open.has(k)) return true;
    const s = saved?.[k];
    if (typeof s?.count !== "number") return true;
    const left = daysUntil(s.date, today);
    return left === null || left > 0 || -left >= WORKDAY_COUNT_KEEP_DAYS;
  });
}

// Timestamp de Firestore -> "YYYY-MM-DD". Devuelve "" si no hay fecha.
export function tsToIso(ts) {
  const d = ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : null);
  return d ? isoOf(d) : "";
}

// Fecha a la que se atribuye un resumen de transporte: el punto medio del
// período que cubre, no `createdAt` (un resumen suele armarse semanas después
// del período). Si el período cruza el cambio de mes, el punto medio cae en el
// mes con más días (28-ago a 3-sep → 31-ago → agosto).
//
// `periodFrom`/`periodTo` son el rango con que se creó el resumen y no se
// recalculan al agregarle vueltas, así que pueden quedar algo más angostos que
// las fechas reales. Sin período, usa `createdAt`.
export function paymentPeriodDate(p) {
  const from = p.periodFrom || p.periodTo;
  const to = p.periodTo || p.periodFrom;
  if (!from) return tsToIso(p.createdAt);
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return tsToIso(p.createdAt);
  return isoOf(new Date((a + b) / 2));
}

// La nómina se fecha por `paidAt` (string ISO) si ya se pagó; si no, por el
// `createdAt` (Timestamp de Firestore).
export function payrollMonthKey(p) {
  if (p.paidAt) return String(p.paidAt).slice(0, 7);
  const d = p.createdAt?.toDate?.() || (p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000) : null);
  return d ? monthKeyOf(d) : null;
}

export const pendingOfPayment = (p) => {
  const total = Number(p?.total) || 0;
  const partiallyPaid = (p?.abonos || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return Math.max(0, total - partiallyPaid);
};

// Lo pagado a trabajadores en los últimos `periodMonths` meses, mes a mes, y
// las nóminas pendientes (de cualquier fecha).
export function payrollMoneyStats(payrolls, periodMonths, now = new Date()) {
  const keys = lastMonthKeys(periodMonths, now);
  const keySet = new Set(keys);
  const byMonth = new Map(keys.map((k) => [k, { key: k, label: fmtMonthKey(k), bank: 0, cash: 0, total: 0 }]));
  let periodTotal = 0, periodCash = 0, periodAdvances = 0, periodCount = 0;
  let pendingCount = 0, pendingTotal = 0;
  for (const p of payrolls) {
    if (p.status !== "paid") {
      pendingCount += 1;
      // Con las transferencias ya hechas, lo pendiente es solo el efectivo.
      pendingTotal += p.bankPaidAt ? pendingCashOf(p) : Number(p.total) || 0;
    }
    const mk = payrollMonthKey(p);
    if (!mk || !keySet.has(mk)) continue;
    const row = byMonth.get(mk);
    row.bank += Number(p.bankTotal) || 0;
    row.cash += Number(p.cashTotal) || 0;
    row.total += Number(p.total) || 0;
    periodTotal += Number(p.total) || 0;
    periodCash += Number(p.cashTotal) || 0;
    periodAdvances += Number(p.advanceTotal) || 0;
    periodCount += 1;
  }
  return {
    months: [...byMonth.values()],
    periodTotal,
    periodCash,
    periodAdvances,
    periodCount,
    cashShare: periodTotal > 0 ? (periodCash / periodTotal) * 100 : 0,
    pendingCount,
    pendingTotal,
    lastPayroll: payrolls[0] || null,
    // Composición de lo devengado en el período: lo que se transfirió, lo
    // que se pagó en efectivo y lo que quedó retenido como anticipo (ya se
    // había entregado antes, por eso no está en `total`).
    mix: [
      { name: "Banco", value: periodTotal - periodCash },
      { name: "Efectivo", value: periodCash },
      { name: "Anticipos", value: periodAdvances },
    ].filter((s) => s.value > 0),
  };
}

// Ciclos abiertos y cerrados, ciclos abiertos por faena, los ciclos sin
// movimiento y las jornadas del mes contra el anterior.
export function operationStats(cycles, jobs, workdayMonths, now = new Date()) {
  const jobName = new Map(jobs.map((f) => [f.id, f.name]));
  const open = cycles.filter((c) => c.status !== "closed");
  const byJob = new Map();
  for (const c of open) {
    byJob.set(c.faenaId, (byJob.get(c.faenaId) || 0) + 1);
  }
  const cyclesByJob = [...byJob.entries()]
    .map(([id, cycleCount]) => ({ name: jobName.get(id) || "(sin faena)", cycleCount }))
    .sort((a, b) => b.cycleCount - a.cycleCount)
    .slice(0, 8);

  // Última actividad = el día más reciente cargado en el ciclo. Si nunca se
  // le cargó un día, cae a la fecha de inicio.
  const cutoff = isoOf(new Date(now.getTime() - STALE_DAYS * 86400000));
  const stale = open
    .map((c) => {
      const days = Array.isArray(c.days) ? c.days : [];
      const last = days.length ? days.reduce((a, b) => (a > b ? a : b)) : (c.startDate || "");
      return { cycle: c, last, job: jobName.get(c.faenaId) || "" };
    })
    .filter((x) => x.last && x.last < cutoff)
    .sort((a, b) => (a.last < b.last ? -1 : 1));

  const current = workdayMonths.at(-1)?.workdayCount ?? null;
  const previous = workdayMonths.at(-2)?.workdayCount ?? null;
  const delta = previous > 0 ? ((current - previous) / previous) * 100 : null;
  return {
    openCount: open.length,
    closedCount: cycles.length - open.length,
    activeJobs: byJob.size,
    cyclesByJob,
    stale,
    workdaysCurrent: current,
    workdaysDelta: delta,
  };
}

// Los resúmenes de transporte con `createdAt` desde `fromIso` (YYYY-MM-DD).
// Uno sin `createdAt` queda afuera.
export function paymentsCreatedSince(payments, fromIso) {
  return payments.filter((p) => {
    const created = tsToIso(p.createdAt);
    return created !== "" && created >= fromIso;
  });
}

// Gasto en transporte del período por transportista, lo pendiente, el gasto
// de los últimos 6 meses y las quincenas pendientes.
export function transportStats(payments, fortnights, carriers, periodMonths, now = new Date()) {
  const alias = new Map(carriers.map((c) => [c.id, c.alias || c.name || c.id]));
  const byCarrier = new Map();
  let periodSpend = 0;
  let periodPending = 0;
  // Los resúmenes vienen por 12 meses; el período se recorta acá.
  const periodStart = `${lastMonthKeys(periodMonths, now)[0]}-01`;
  for (const p of payments) {
    if (paymentPeriodDate(p) < periodStart) continue;
    const id = p.carrierId || "?";
    const row = byCarrier.get(id) || { name: alias.get(id) || id, total: 0, pending: 0 };
    const total = Number(p.total) || 0;
    row.total += total;
    periodSpend += total;
    if (p.status !== "paid") {
      const pendingAmount = pendingOfPayment(p);
      row.pending += pendingAmount;
      periodPending += pendingAmount;
    }
    byCarrier.set(id, row);
  }
  // Gasto mes a mes, fechado por el período que cubre el resumen. Ventana
  // fija de 6 meses: deja ver tendencia sin que las barras se aplasten.
  const keys = lastMonthKeys(6, now);
  const byMonth = new Map(keys.map((k) => [k, { key: k, label: fmtMonthKey(k), spent: 0 }]));
  for (const p of payments) {
    const mk = paymentPeriodDate(p).slice(0, 7);
    if (byMonth.has(mk)) byMonth.get(mk).spent += Number(p.total) || 0;
  }

  const spend = [...byCarrier.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  const top3 = spend.slice(0, 3).reduce((s, r) => s + r.total, 0);
  const pendingFortnights = fortnights.filter((q) => q.status !== "paid");
  return {
    spend,
    months: [...byMonth.values()],
    periodSpend,
    periodPending,
    concentration: periodSpend > 0 ? (top3 / periodSpend) * 100 : 0,
    carrierCount: byCarrier.size,
    pendingFortnightCount: pendingFortnights.length,
    pendingFortnightTotal: pendingFortnights.reduce((s, q) => s + (Number(q.total) || 0), 0),
  };
}

// Cómo fue variando la deuda con los transportistas.
//
// La unidad de deuda es el resumen (`transportPayments`), no la quincena,
// que solo agrupa resúmenes: contar las dos duplicaría los montos. La deuda
// nace con el resumen y baja por cada abono parcial (en su fecha) y al
// marcarlo pagado, que salda el remanente.
//
// La deuda se fecha por el período que cubre el resumen (`paymentPeriodDate`);
// los pagos, por su fecha real.
//
// Lo anterior a la ventana de 12 meses se acumula en un saldo inicial, así la
// línea es el saldo vigente y no solo el flujo de la ventana. Recibe los
// resúmenes creados en los últimos 12 meses (`paymentsCreatedSince`): una
// deuda impaga más vieja que eso no entra en el saldo.
export function transportDebtByMonth(payments, carriers, fortnights, now = new Date()) {
  const alias = new Map(carriers.map((c) => [c.id, c.alias || c.name || c.id]));
  const fortnightName = new Map(fortnights.map((q) => [q.id, q.name || q.id]));
  const keys = lastMonthKeys(12, now);
  const from = `${keys[0]}-01`;
  const rows = new Map(
    keys.map((k) => [
      k,
      { key: k, label: fmtMonthKey(k), generated: 0, paid: 0, paidItems: [], createdItems: [] },
    ]),
  );
  let balance = 0;
  // `detail` alimenta el desglose del tooltip: qué resúmenes y qué abonos
  // componen la barra de ese mes.
  const apply = (date, field, amount, detail) => {
    if (!date || amount <= 0) return;
    if (date < from) {
      balance += field === "generated" ? amount : -amount;
      return;
    }
    const row = rows.get(date.slice(0, 7));
    if (!row) return;
    row[field] += amount;
    if (field === "generated") row.createdItems.push(detail);
    else row.paidItems.push(detail);
  };
  for (const p of payments) {
    const total = Number(p.total) || 0;
    if (total <= 0) continue;
    // Contexto común a todas las entradas que genera este resumen, para que
    // el modal pueda mostrar de qué período es y a qué quincena pertenece.
    const ctx = {
      name: alias.get(p.carrierId) || p.carrierId || "—",
      period:
        p.periodFrom || p.periodTo
          ? [fmtShortDate(p.periodFrom), fmtShortDate(p.periodTo)].filter(Boolean).join(" → ")
          : "",
      fortnight: p.payrollId ? fortnightName.get(p.payrollId) || "" : "",
    };
    apply(paymentPeriodDate(p), "generated", total, { ...ctx, amount: total, kind: "summary" });
    let partiallyPaid = 0;
    for (const a of p.abonos || []) {
      const amt = Number(a.amount) || 0;
      partiallyPaid += amt;
      const date = String(a.date || "").slice(0, 10);
      apply(date, "paid", amt, { ...ctx, amount: amt, kind: "partialPayment", date, notes: a.notes || "" });
    }
    if (p.status === "paid") {
      const remainder = Math.max(0, total - partiallyPaid);
      const date = tsToIso(p.paidAt);
      apply(date, "paid", remainder, { ...ctx, amount: remainder, kind: "summary", date, marked: true });
    }
  }
  const byAmount = (a, b) => b.amount - a.amount;
  return keys.map((k) => {
    const r = rows.get(k);
    balance += r.generated - r.paid;
    return { ...r, paidItems: r.paidItems.sort(byAmount), createdItems: r.createdItems.sort(byAmount), balance, net: r.paid - r.generated };
  });
}

// Margen de los ciclos con resumen de cobro configurado, de mayor a menor.
export function cycleMargins(cycles) {
  const rows = cycles
    .filter((c) => Number(c.summaryTotals?.cobrar) > 0)
    .map((c) => {
      const charge = Number(c.summaryTotals.cobrar) || 0;
      const pay = Number(c.summaryTotals.pagar) || 0;
      return { cycle: c, charge, pay, marginAmount: charge - pay, pct: ((charge - pay) / charge) * 100 };
    })
    .sort((a, b) => b.marginAmount - a.marginAmount);
  const chargeSum = rows.reduce((s, r) => s + r.charge, 0);
  const marginSum = rows.reduce((s, r) => s + r.marginAmount, 0);
  return {
    rows,
    covered: rows.length,
    total: cycles.length,
    missing: cycles.length - rows.length,
    marginSum,
    pct: chargeSum > 0 ? (marginSum / chargeSum) * 100 : 0,
  };
}

// Ventas y compras de una empresa por mes, en los meses de `keys`.
export function dteMonthlyTotals(docs, keys) {
  const byMonth = new Map(
    keys.map((k) => [k, { key: k, label: fmtMonthKey(k), sales: 0, purchases: 0 }]),
  );
  for (const d of docs) {
    const row = byMonth.get(d.periodo);
    if (!row) continue;
    // `total` ya viene con IVA incluido. Las notas de crédito restan.
    const amount = (CREDIT_NOTE_TYPES.has(Number(d.tipo)) ? -1 : 1) * (Number(d.total) || 0);
    if (d.kind === "venta") row.sales += amount;
    else row.purchases += amount;
  }
  return [...byMonth.values()].map((r) => ({ ...r, difference: r.sales - r.purchases }));
}

// Cheques y pagos de la semana: lo que se paga y está vencido o vence en los
// próximos 7 días, con el resumen de la pantalla.
export function commitmentsWeekOf(commitments, today) {
  const groups = groupUpcoming(commitments, today);
  const items = [...groups.overdue, ...groups.week].filter((c) => directionOf(c.kind) === "out");
  return { today, summary: summarize(commitments, today), items };
}
