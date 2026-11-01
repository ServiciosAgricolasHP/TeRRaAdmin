import { localIsoDate } from "./dates";
import { timestampIso } from "./syncedList";

// Primer y último día de la grilla del ciclo (`cycle.days`). Al cerrar el
// ciclo, startDate y endDate toman estos valores: el rango de lo trabajado, no
// la fecha de creación ni la del cierre. Sin días, quedan las fechas que ya
// tenía (u hoy, si faltan).
export function firstWorkedDay(cycle, today = localIsoDate()) {
  const days = cycle?.days;
  if (Array.isArray(days) && days.length > 0) return days.reduce((min, d) => (d < min ? d : min), days[0]);
  return cycle?.startDate || today;
}

export function lastWorkedDay(cycle, today = localIsoDate()) {
  const days = cycle?.days;
  if (Array.isArray(days) && days.length > 0) return days.reduce((max, d) => (d > max ? d : max), days[0]);
  return cycle?.endDate || today;
}

// El día con que se ordenan los ciclos entre sí (las columnas del resumen de
// producción y la navegación anterior/siguiente de la grilla): el primero
// trabajado y, sin días, el de inicio o el de creación, nunca hoy.
export function cycleSortDay(cycle) {
  const days = cycle?.days;
  if (Array.isArray(days) && days.length > 0) return days.reduce((min, d) => (d < min ? d : min), days[0]);
  return cycle?.startDate || timestampIso(cycle?.createdAt);
}

// Lo que se escribe en un ciclo al cerrarlo, desde cualquier pantalla.
export function closedCyclePatch(cycle, today = localIsoDate()) {
  return { status: "closed", startDate: firstWorkedDay(cycle, today), endDate: lastWorkedDay(cycle, today) };
}

export const payrollStatusMap = (payrolls) => new Map(payrolls.map((p) => [p.id, p.status]));

// Lo que las nóminas se llevaron de un ciclo (`stat.takenByPayroll`), separado
// según si cada nómina ya se marcó pagada (`paid`) o todavía no (`inPayroll`,
// con sus ids en `openPayrollIds`). Estar en una nómina no es estar pagado:
// recién lo es cuando esa nómina se marca pagada. `statusOf` es
// Map(payrollId → status); una nómina que no está ahí (más antigua que las
// cargadas) cuenta como pagada. Lo de $0 no cuenta.
export function splitTaken(stat, statusOf) {
  let paid = 0;
  let inPayroll = 0;
  const openPayrollIds = [];
  for (const [id, amount] of Object.entries(stat?.takenByPayroll || {})) {
    if (!(amount > 0)) continue;
    if (statusOf.has(id) && statusOf.get(id) !== "paid") {
      inPayroll += amount;
      openPayrollIds.push(id);
    } else {
      paid += amount;
    }
  }
  return { paid, inPayroll, openPayrollIds };
}

// `splitTaken` de cada ciclo con totales: { [cycleId]: { paid, inPayroll,
// openPayrollIds } }.
export function takenSplitOf(cycleStats, payrolls) {
  const statusOf = payrollStatusMap(payrolls);
  return Object.fromEntries(Object.entries(cycleStats).map(([id, s]) => [id, splitTaken(s, statusOf)]));
}

// Ciclos abiertos que ya se pagaron por completo, para cerrarlos de una vez:
// tienen algo pagado, nada pendiente y nada en una nómina sin pagar. `waiting`
// son los que no tienen pendiente pero siguen en una nómina sin pagar
// (`openPayrollIds`): si se sacaran de ella, su plata volvería a quedar
// pendiente dentro de un ciclo cerrado.
// `stats[cycleId]` = { unpaid, firstDay, lastDay, takenByPayroll: { [payrollId]: monto } }.
export function settledOpenCycles(cycles, stats, payrolls) {
  const statusOf = payrollStatusMap(payrolls);
  const settled = [];
  const waiting = [];
  for (const cycle of cycles) {
    if (cycle.status === "closed") continue;
    const s = stats[cycle.id];
    if (!s || s.unpaid > 0) continue;
    const { paid, inPayroll, openPayrollIds } = splitTaken(s, statusOf);
    if (!(paid + inPayroll > 0)) continue;
    const row = { cycle, paid, inPayroll, firstDay: s.firstDay || "", lastDay: s.lastDay || "", openPayrollIds };
    (openPayrollIds.length ? waiting : settled).push(row);
  }
  return { settled, waiting };
}
