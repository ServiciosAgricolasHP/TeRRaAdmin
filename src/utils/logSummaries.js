// Lo que guarda un registro de auditoría cuando cambia una lista grande. En la
// nómina y su JSON, en vez de la lista entera dos veces (antes y después), un
// resumen de lo que cambió: así el registro pesa unos pocos KB y cabe siempre
// en el límite de Firestore. Y si un registro igual no cabe, queda uno mínimo
// con quién, cuándo y qué campos cambiaron.
import { valueSize } from "./docSizes";

// Más que esto y el registro se guarda sin el detalle: Firestore no acepta un
// documento de más de 1 MiB.
export const LOG_SIZE_LIMIT = 900 * 1024;

const round = (v) => Math.round(Number(v) || 0);

// La clave de una persona en la nómina.
export const itemKeyOf = (it) => it?.workerId || it?.rut || "";

// Lo que cuenta de una persona en la nómina: bruto, anticipo, bono, anticipo
// entregado, líquido y días.
export function itemFigures(it) {
  return {
    gross: round(it?.grossAmount ?? it?.amount),
    advance: round(it?.advance),
    bonus: round(it?.bonus),
    payout: round(it?.payoutTotal),
    amount: round(it?.amount),
    days: (it?.workdayIds || []).length,
  };
}

const sameFigures = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);
const person = (it) => ({ key: itemKeyOf(it), rut: it?.rut || "", name: it?.name || "", ...itemFigures(it) });

// Quién entró a la nómina, quién salió y a quién le cambió algo, con sus
// cifras antes y después.
export function payrollItemsChange(from = [], to = []) {
  const before = new Map((from || []).map((it) => [itemKeyOf(it), it]));
  const after = new Map((to || []).map((it) => [itemKeyOf(it), it]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, it] of after) {
    const prev = before.get(key);
    if (!prev) added.push(person(it));
    else {
      const a = itemFigures(prev);
      const b = itemFigures(it);
      if (!sameFigures(a, b)) changed.push({ key, rut: it.rut || "", name: it.name || prev.name || "", from: a, to: b });
    }
  }
  for (const [key, it] of before) if (!after.has(key)) removed.push(person(it));
  return { summary: "items", count: { from: before.size, to: after.size }, added, removed, changed };
}

// Una lista de ids o de elementos con `id`: cuántos había, cuántos hay y
// cuántos entraron y salieron.
export function listChange(from = [], to = []) {
  const idOf = (x) => (x && typeof x === "object" ? x.id ?? JSON.stringify(x) : x);
  const a = new Set((from || []).map(idOf));
  const b = new Set((to || []).map(idOf));
  return {
    summary: "list",
    from: (from || []).length,
    to: (to || []).length,
    added: [...b].filter((x) => !a.has(x)).length,
    removed: [...a].filter((x) => !b.has(x)).length,
  };
}

const SUMMARIZED = {
  payroll: { items: payrollItemsChange, workdayIds: listChange, advanceIds: listChange },
  payrollSnapshot: { workers: payrollItemsChange, workdays: listChange, advances: listChange, cycles: listChange },
};

// Los cambios de un registro con las listas grandes resumidas.
export function summarizeChanges(entity, changes) {
  const summarizers = SUMMARIZED[entity];
  if (!changes || !summarizers) return changes;
  return Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, summarizers[k] ? summarizers[k](c.from, c.to) : c]));
}

// El registro tal cual si cabe; si no, sin `changes`, `before` ni `after`,
// con los campos que cambiaron (`changedFields`) y `truncated`.
export function fitLog(log) {
  if (valueSize(log) <= LOG_SIZE_LIMIT) return log;
  return {
    ...log,
    changes: null,
    before: null,
    after: null,
    changedFields: Object.keys(log.changes || {}),
    truncated: true,
  };
}
