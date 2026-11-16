// Los pagos de un ciclo: qué le pagó cada nómina a cada persona, por labor.
// Un ciclo que se paga por partes queda repartido en varias nóminas, a veces
// con la misma labor en dos; esto lo junta para verlo de una vez.
import { workdayPayAmount } from "./payroll";
import { workerMatchesQuery } from "./workerSearch";

const NO_PAYROLL = { name: "Nómina eliminada", state: "pending", createdMs: 0, items: [] };

// Lo que no está en ninguna nómina va como una nómina más, al final, con este
// estado.
export const UNPAID_ID = "";
export const UNPAID_STATE = "none";
const UNPAID = { name: "Sin nómina", state: UNPAID_STATE, createdMs: Infinity, items: [] };

// Los anticipos que una nómina entrega asociados al ciclo van como una columna
// más, después de las labores.
export const PAYOUT_COLUMN_ID = "__payout";
const PAYOUT_COLUMN = { id: PAYOUT_COLUMN_ID, name: "💸 Anticipo entregado" };

// Una fila por persona y nómina, con lo que esa nómina le paga de cada labor
// del ciclo (`byLabor`, solo las labores donde tiene jornadas) y de los
// anticipos que le entrega asociados al ciclo (`byLabor[PAYOUT_COLUMN_ID]`),
// la suma (`cycleAmount`) y lo que la persona recibe en la nómina entera
// (`gross`, `advance`, `bonus`, `payout` y `net`; `null` si la nómina ya no la
// trae) y la clave con que figura en ella (`itemKey`). Quien solo recibió un
// anticipo asociado al ciclo tiene su fila, sin días.
//
// `workdays` son las jornadas del ciclo `cycleId`; las que no están en una
// nómina no cuentan, salvo con `includeUnpaid`: ahí van juntas en "Sin
// nómina" las que tienen monto o son de asistencia. `payrolls` trae de cada
// nómina `{ id, name, state, createdMs, items }`. `workerIdOf` resuelve la
// ficha de una jornada o de un item, y `workerOf`, la ficha por su id; quien
// no tiene ficha toma su nombre de los trabajadores de las labores o del item.
export function cyclePaymentsOf({ workdays = [], labors = [], payrolls = [], cycleId = null, workerIdOf, workerOf = () => null, currentPayrollId = null, includeUnpaid = false }) {
  const laborTypeById = new Map(labors.map((l) => [l.id, l.type]));
  const laborNames = new Map(labors.flatMap((l) => (l.workers || []).flatMap((w) => [[w.id, w.name], [w.rut, w.name]])));
  const payrollById = new Map([...payrolls.map((p) => [p.id, p]), [UNPAID_ID, UNPAID]]);
  const rowsByKey = new Map();
  const usedLabors = new Set();
  const rowFor = (personKey, payrollId, { rut, name }) => {
    const key = `${personKey}|${payrollId}`;
    if (!rowsByKey.has(key)) {
      const worker = workerOf(personKey);
      rowsByKey.set(key, {
        key,
        personKey,
        payrollId,
        name: worker?.name || laborNames.get(personKey) || laborNames.get(rut) || name || personKey,
        rut: worker?.rut || rut || personKey,
        byLabor: {},
        cycleAmount: 0,
        days: 0,
      });
    }
    return rowsByKey.get(key);
  };
  const addTo = (row, columnId, amount) => {
    row.byLabor[columnId] = (row.byLabor[columnId] || 0) + amount;
    row.cycleAmount += amount;
  };
  for (const wd of workdays) {
    const amount = workdayPayAmount(wd, laborTypeById.get(wd.laborId));
    if (!wd.payrollId && !(includeUnpaid && (amount > 0 || wd.attendanceOnly))) continue;
    const personKey = workerIdOf(wd);
    if (!personKey) continue;
    const row = rowFor(personKey, wd.payrollId || UNPAID_ID, { rut: wd.workerRut, name: wd.workerName });
    addTo(row, wd.laborId, amount);
    row.days += 1;
    usedLabors.add(wd.laborId);
  }
  let hasPayouts = false;
  for (const p of cycleId ? payrolls : []) {
    for (const it of p.items || []) {
      const amount = (it.payoutApplications || []).reduce((s, a) => s + (a.cycleId === cycleId ? Math.round(Number(a.amount) || 0) : 0), 0);
      if (amount <= 0) continue;
      const personKey = workerIdOf({ workerId: it.workerId, workerRut: it.rut });
      if (!personKey) continue;
      addTo(rowFor(personKey, p.id, { rut: it.rut, name: it.name }), PAYOUT_COLUMN_ID, amount);
      hasPayouts = true;
    }
  }

  // El item de cada persona en su nómina, buscado una vez por nómina.
  const itemsByPayroll = new Map();
  const itemOf = (payrollId, personKey) => {
    if (!itemsByPayroll.has(payrollId)) {
      const items = payrollById.get(payrollId)?.items || [];
      itemsByPayroll.set(payrollId, new Map(items.map((it) => [workerIdOf({ workerId: it.workerId, workerRut: it.rut }), it])));
    }
    return itemsByPayroll.get(payrollId).get(personKey) || null;
  };
  const usedPayrolls = new Set();
  const rows = [...rowsByKey.values()].map((row) => {
    usedPayrolls.add(row.payrollId);
    const item = itemOf(row.payrollId, row.personKey);
    return {
      ...row,
      itemKey: item ? item.workerId || item.rut : null,
      net: item ? Math.round(Number(item.amount) || 0) : null,
      gross: item ? Math.round(Number(item.grossAmount ?? item.amount) || 0) : null,
      advance: item ? Math.round(Number(item.advance) || 0) : null,
      bonus: item ? Math.round(Number(item.bonus) || 0) : null,
      payout: item ? Math.max(0, Math.round(Number(item.payoutTotal) || 0)) : null,
    };
  });

  const knownLabors = labors.filter((l) => usedLabors.has(l.id)).map((l) => ({ id: l.id, name: l.name }));
  const knownIds = new Set(knownLabors.map((l) => l.id));
  const lostLabors = [...usedLabors].filter((id) => !knownIds.has(id)).map((id) => ({ id, name: "(labor eliminada)" }));
  return {
    labors: [...knownLabors, ...lostLabors, ...(hasPayouts ? [PAYOUT_COLUMN] : [])],
    // De la más vieja a la más nueva.
    payrolls: [...usedPayrolls]
      .map((id) => {
        const p = payrollById.get(id) || NO_PAYROLL;
        return { id, name: p.name || NO_PAYROLL.name, state: p.state, createdMs: p.createdMs || 0, isCurrent: id === currentPayrollId };
      })
      .sort((a, b) => a.createdMs - b.createdMs || a.name.localeCompare(b.name, "es")),
    rows,
  };
}

function totalsOf(rows) {
  const totals = { byLabor: {}, cycleAmount: 0, net: 0, days: 0 };
  for (const r of rows) {
    for (const [laborId, amount] of Object.entries(r.byLabor)) {
      totals.byLabor[laborId] = (totals.byLabor[laborId] || 0) + amount;
    }
    totals.cycleAmount += r.cycleAmount;
    totals.net += r.net || 0;
    totals.days += r.days;
  }
  return totals;
}

// Los pagos como se muestran: agrupados por persona (`view: "person"`, una
// fila por nómina) o por nómina (`view: "payroll"`, una fila por persona),
// con el subtotal de cada grupo y el total. `state` deja solo las nóminas
// pagadas (`paid`), las que no lo están (`unpaid`) o lo que no está en ninguna
// (`none`), y `search` busca por
// nombre o RUT. `labors` son las labores con algo en lo que quedó.
export function cyclePaymentGroups(data, { view = "payroll", state = "all", search = "" } = {}) {
  const payrollById = new Map(data.payrolls.map((p, i) => [p.id, { ...p, order: i }]));
  const query = search.trim();
  const rows = data.rows
    .filter((r) => {
      const payrollState = payrollById.get(r.payrollId)?.state;
      const group = payrollState === "paid" ? "paid" : payrollState === UNPAID_STATE ? "none" : "unpaid";
      if (state !== "all" && state !== group) return false;
      return !query || workerMatchesQuery({ id: r.personKey, name: r.name, rut: r.rut }, query);
    })
    .map((r) => ({ ...r, payroll: payrollById.get(r.payrollId) }));

  const byName = (a, b) => a.name.localeCompare(b.name, "es") || a.personKey.localeCompare(b.personKey);
  const byPayroll = (a, b) => a.payroll.order - b.payroll.order;
  const groupsByKey = new Map();
  for (const r of rows) {
    const key = view === "payroll" ? r.payrollId : r.personKey;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, view === "payroll"
        ? { key, payroll: r.payroll, name: r.payroll.name, rows: [] }
        : { key, personKey: r.personKey, name: r.name, rut: r.rut, rows: [] });
    }
    groupsByKey.get(key).rows.push(r);
  }
  const groups = [...groupsByKey.values()]
    .map((g) => ({ ...g, rows: g.rows.sort(view === "payroll" ? byName : byPayroll), totals: totalsOf(g.rows) }))
    .sort(view === "payroll" ? (a, b) => a.payroll.order - b.payroll.order : byName);

  const totals = totalsOf(rows);
  return {
    view,
    labors: data.labors.filter((l) => l.id in totals.byLabor),
    groups,
    totals,
    people: new Set(rows.map((r) => r.personKey)).size,
    payrolls: new Set(rows.filter((r) => r.payrollId !== UNPAID_ID).map((r) => r.payrollId)).size,
    unpaidAmount: rows.filter((r) => r.payrollId === UNPAID_ID).reduce((s, r) => s + r.cycleAmount, 0),
  };
}
