// Los pagos de un ciclo: qué le pagó cada nómina a cada persona, por labor.
// Un ciclo que se paga por partes queda repartido en varias nóminas, a veces
// con la misma labor en dos; esto lo junta para verlo de una vez.
import { workdayPayAmount } from "./payroll";
import { workerMatchesQuery } from "./workerSearch";

const NO_PAYROLL = { name: "Nómina eliminada", state: "pending", createdMs: 0, items: [] };

// Una fila por persona y nómina, con lo que esa nómina le paga de cada labor
// del ciclo (`byLabor`, solo las labores donde tiene jornadas), la suma
// (`cycleAmount`) y lo que la persona recibe en la nómina entera (`gross`,
// `advance`, `bonus` y `net`; `null` si la nómina ya no la trae) y la clave
// con que figura en ella (`itemKey`).
//
// `workdays` son las jornadas del ciclo; las que no están en una nómina no
// cuentan. `payrolls` trae de cada nómina `{ id, name, state, createdMs,
// items }`. `workerIdOf` resuelve la ficha de una jornada o de un item, y
// `workerOf`, la ficha por su id.
export function cyclePaymentsOf({ workdays = [], labors = [], payrolls = [], workerIdOf, workerOf = () => null, currentPayrollId = null }) {
  const laborTypeById = new Map(labors.map((l) => [l.id, l.type]));
  const payrollById = new Map(payrolls.map((p) => [p.id, p]));
  const rowsByKey = new Map();
  const usedLabors = new Set();
  for (const wd of workdays) {
    if (!wd.payrollId) continue;
    const personKey = workerIdOf(wd);
    if (!personKey) continue;
    const key = `${personKey}|${wd.payrollId}`;
    let row = rowsByKey.get(key);
    if (!row) {
      const worker = workerOf(personKey);
      row = {
        key,
        personKey,
        payrollId: wd.payrollId,
        name: worker?.name || wd.workerName || personKey,
        rut: worker?.rut || wd.workerRut || personKey,
        byLabor: {},
        cycleAmount: 0,
        days: 0,
      };
      rowsByKey.set(key, row);
    }
    const amount = workdayPayAmount(wd, laborTypeById.get(wd.laborId));
    row.byLabor[wd.laborId] = (row.byLabor[wd.laborId] || 0) + amount;
    row.cycleAmount += amount;
    row.days += 1;
    usedLabors.add(wd.laborId);
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
    const net = item ? Math.round(Number(item.amount) || 0) : null;
    return {
      ...row,
      itemKey: item ? item.workerId || item.rut : null,
      net,
      gross: item ? Math.round(Number(item.grossAmount ?? item.amount) || 0) : null,
      advance: item ? Math.round(Number(item.advance) || 0) : null,
      bonus: item ? Math.round(Number(item.bonus) || 0) : null,
    };
  });

  const knownLabors = labors.filter((l) => usedLabors.has(l.id)).map((l) => ({ id: l.id, name: l.name }));
  const knownIds = new Set(knownLabors.map((l) => l.id));
  const lostLabors = [...usedLabors].filter((id) => !knownIds.has(id)).map((id) => ({ id, name: "(labor eliminada)" }));
  return {
    labors: [...knownLabors, ...lostLabors],
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
// pagadas (`paid`) o las que no lo están (`unpaid`), y `search` busca por
// nombre o RUT. `labors` son las labores con algo en lo que quedó.
export function cyclePaymentGroups(data, { view = "payroll", state = "all", search = "" } = {}) {
  const payrollById = new Map(data.payrolls.map((p, i) => [p.id, { ...p, order: i }]));
  const query = search.trim();
  const rows = data.rows
    .filter((r) => {
      const paid = payrollById.get(r.payrollId)?.state === "paid";
      if (state === "paid" && !paid) return false;
      if (state === "unpaid" && paid) return false;
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
    payrolls: new Set(rows.map((r) => r.payrollId)).size,
  };
}
