// Resumen de un transportista: sus resúmenes agrupados por quincena, los que no
// están en ninguna y las vueltas que todavía no están en un resumen, con lo
// pagado y lo pendiente de cada grupo. Lo muestra `CarrierSummaryModal`
// (`screens/transports/`).
//
// Los montos salen de las vueltas que se muestran, no del `total` guardado en
// el resumen, así la tabla suma lo que dicen sus filas.

import { localIsoDate } from "./dates";

const LOOSE_KEY = "loose";
const UNLINKED_KEY = "unlinked";

const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
const sumOf = (list, valueOf) => list.reduce((s, x) => s + (Number(valueOf(x)) || 0), 0);

// Día (`YYYY-MM-DD`) de una marca de tiempo de Firestore, un Date o un texto.
function dayOf(ts) {
  if (!ts) return "";
  if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const ms = typeof ts.toMillis === "function" ? ts.toMillis() : ts.seconds != null ? ts.seconds * 1000 : null;
  return localIsoDate(ms != null ? new Date(ms) : ts);
}

// Si un resumen pagado cae en el rango `from`–`to` (cualquiera de los dos
// puede ir vacío): su período tiene que tocarlo. Sin período, cuenta el día en
// que se pagó.
export function paymentInRange(p, from, to) {
  const paidDay = dayOf(p.paidAt);
  const start = p.periodFrom || p.periodTo || paidDay;
  const end = p.periodTo || p.periodFrom || paidDay;
  if (!start) return false;
  return (!to || start <= to) && (!from || end >= from);
}

// Los resúmenes que entran:
// - los pendientes;
// - todos los de una quincena abierta, también los ya pagados, así el grupo
//   cuadra con su celda del balance de quincenas;
// - con `includePaid`, los pagados cuyo período toca el rango.
export function carrierSummaryPayments(payments, { openFortnightIds = new Set(), includePaid = false, from = "", to = "" } = {}) {
  return payments.filter((p) =>
    p.status !== "paid"
    || (p.payrollId && openFortnightIds.has(p.payrollId))
    || (includePaid && paymentInRange(p, from, to)));
}

// Un resumen tal como se muestra: sus vueltas por fecha, el total, los abonos,
// lo pagado y lo que falta. Uno pagado no debe nada.
function summaryOf(p, trips) {
  const total = sumOf(trips, (t) => t.amount);
  const isPaid = p.status === "paid";
  const abonos = [...(p.abonos || [])].sort(byDate);
  const paid = isPaid ? total : Math.min(sumOf(abonos, (a) => a.amount), total);
  const dates = trips.map((t) => t.date).filter(Boolean);
  return {
    payment: p,
    trips,
    abonos,
    isPaid,
    total,
    qty: sumOf(trips, (t) => t.qty),
    paid,
    pending: total - paid,
    periodFrom: p.periodFrom || dates[0] || "",
    periodTo: p.periodTo || dates[dates.length - 1] || "",
  };
}

function groupOf({ key, kind, title, fortnight = null, summaries = [], trips }) {
  const groupTrips = trips || summaries.flatMap((s) => s.trips);
  const total = sumOf(groupTrips, (t) => t.amount);
  const paid = sumOf(summaries, (s) => s.paid);
  const dates = groupTrips.map((t) => t.date).filter(Boolean).sort();
  return {
    key,
    kind,
    title,
    fortnight,
    // "open" | "paid" en una quincena; "missing" si su quincena ya no existe.
    fortnightStatus: kind !== "fortnight" ? null : !fortnight ? "missing" : fortnight.status === "paid" ? "paid" : "open",
    summaries,
    trips: groupTrips,
    total,
    qty: sumOf(groupTrips, (t) => t.qty),
    paid,
    pending: total - paid,
    periodFrom: fortnight?.periodFrom || dates[0] || "",
    periodTo: fortnight?.periodTo || dates[dates.length - 1] || "",
  };
}

// Los grupos del resumen, en este orden: las quincenas, de la más antigua a la
// más nueva; los resúmenes sin quincena, y las vueltas pendientes que no están
// en ningún resumen. Dentro de un grupo, los resúmenes y las vueltas van por
// fecha.
//
// `payments` son los que entran (`carrierSummaryPayments`), `fortnightsById`
// sus quincenas y `trips` las vueltas leídas: las de esos resúmenes y las
// pendientes del transportista.
export function carrierSummaryGroups({ payments, fortnightsById = new Map(), trips }) {
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const inSummary = new Set();
  const summariesByKey = new Map();
  for (const p of payments) {
    const pTrips = (p.tripIds || []).map((id) => tripById.get(id)).filter(Boolean).sort(byDate);
    for (const t of pTrips) inSummary.add(t.id);
    const key = p.payrollId || LOOSE_KEY;
    if (!summariesByKey.has(key)) summariesByKey.set(key, []);
    summariesByKey.get(key).push(summaryOf(p, pTrips));
  }
  const bySummaryPeriod = (a, b) =>
    String(a.periodFrom).localeCompare(String(b.periodFrom)) || String(a.periodTo).localeCompare(String(b.periodTo));

  const fortnightGroups = [];
  for (const [key, summaries] of summariesByKey) {
    if (key === LOOSE_KEY) continue;
    const fortnight = fortnightsById.get(key) || null;
    fortnightGroups.push(groupOf({
      key,
      kind: "fortnight",
      title: fortnight?.name || "Quincena eliminada",
      fortnight,
      summaries: summaries.sort(bySummaryPeriod),
    }));
  }
  fortnightGroups.sort((a, b) =>
    String(a.periodFrom).localeCompare(String(b.periodFrom)) || a.title.localeCompare(b.title, "es"));

  const groups = [...fortnightGroups];
  if (summariesByKey.has(LOOSE_KEY)) {
    groups.push(groupOf({
      key: LOOSE_KEY,
      kind: "loose",
      title: "Sin quincena",
      summaries: summariesByKey.get(LOOSE_KEY).sort(bySummaryPeriod),
    }));
  }
  const unlinked = trips.filter((t) => !t.paymentId && !inSummary.has(t.id) && t.status !== "paid").sort(byDate);
  if (unlinked.length > 0) {
    groups.push(groupOf({ key: UNLINKED_KEY, kind: "unlinked", title: "Vueltas sin resumen", trips: unlinked }));
  }
  return groups;
}

export function carrierSummaryTotals(groups) {
  return {
    total: sumOf(groups, (g) => g.total),
    paid: sumOf(groups, (g) => g.paid),
    pending: sumOf(groups, (g) => g.pending),
    qty: sumOf(groups, (g) => g.qty),
  };
}
