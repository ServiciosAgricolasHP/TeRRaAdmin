// La línea de tiempo de una nómina, armada con sus registros de auditoría:
// qué se hizo, quién, cuándo y a quién le cambió algo. Lee los registros con
// las listas resumidas (`utils/logSummaries.js`) y los anteriores, que traen
// la lista de personas entera antes y después.
import { toDate } from "./auditLogs";
import { fmtCurrency, fmtNumber } from "./format";
import { itemKeyOf, payrollItemsChange } from "./logSummaries";
import { workerMatchesQuery } from "./workerSearch";

// Campos que se mueven solos con otros y no dicen nada por su cuenta.
const IGNORED = new Set([
  "updatedAt", "updatedBy", "updatedByName", "bankTotal", "cashTotal", "workerCount", "bankCount", "cashCount",
  "advanceTotal", "advanceIds", "payoutTotal", "payoutCycleDetails", "paidAt", "bankPaidBy", "cycleDetails", "cycleLabels", "total", "workdayIds",
]);

// Quien hizo el cambio: su nombre en el registro o, en los anteriores, el
// nombre que dejó en la nómina o la parte de su correo antes de la @.
function whoOf(log) {
  return log.userName || log.changes?.updatedByName?.to || (log.email ? log.email.split("@")[0] : "") || "—";
}

const itemsChangeOf = (c) => (c?.summary === "items" ? c : payrollItemsChange(c?.from || [], c?.to || []));

const FIGURE_LABELS = [
  ["gross", "bruto"],
  ["advance", "anticipo"],
  ["bonus", "bono"],
  ["payout", "anticipo entregado"],
  ["days", "días"],
];

function personLines(change) {
  const lines = [];
  for (const p of change.added) {
    lines.push({ person: p.key, rut: p.rut, text: `+ entra ${p.name || p.rut} · ${fmtNumber(p.days)} ${p.days === 1 ? "día" : "días"} · ${fmtCurrency(p.amount)}` });
  }
  for (const p of change.removed) {
    lines.push({ person: p.key, rut: p.rut, text: `− sale ${p.name || p.rut} · tenía ${fmtCurrency(p.amount)}` });
  }
  for (const p of change.changed) {
    const details = FIGURE_LABELS
      .filter(([k]) => p.from[k] !== p.to[k])
      .map(([k, label]) => (k === "days" ? `${label} ${p.from[k]} → ${p.to[k]}` : `${label} ${fmtCurrency(p.from[k])} → ${fmtCurrency(p.to[k])}`));
    const net = p.from.amount !== p.to.amount ? `${fmtCurrency(p.from.amount)} → ${fmtCurrency(p.to.amount)}` : "mismo líquido";
    lines.push({ person: p.key, rut: p.rut, text: `${p.name || p.rut}: ${net}${details.length ? ` (${details.join(", ")})` : ""}` });
  }
  return lines;
}

// Si lo único que cambió en las personas son los anticipos que la nómina
// entrega: `"delivered"` si alguno sube o entra, `"removed"` si solo bajan o
// salen, null si cambió algo más.
function payoutOnlyChange(change) {
  const payout = (figures) => Number(figures.payout) || 0;
  const onlyPayout = (p) => p.days === 0 && p.gross === 0 && payout(p) > 0;
  const sameRest = (p) => ["gross", "advance", "bonus", "days"].every((k) => p.from[k] === p.to[k]) && payout(p.from) !== payout(p.to);
  if (!change.added.every(onlyPayout) || !change.removed.every(onlyPayout) || !change.changed.every(sameRest)) return null;
  if (change.added.length + change.removed.length + change.changed.length === 0) return null;
  const grew = change.added.length > 0 || change.changed.some((p) => payout(p.to) > payout(p.from));
  return grew ? "delivered" : "removed";
}

const cycleLabelsOf = (details) => new Map((details || []).map((d) => [d.id, d.label || d.id]));

// Una entrada por registro: `{ id, at, who, title, lines: [{ text, person? }],
// people, truncated }`. `names` (clave o RUT → nombre) nombra a quienes cobraron
// el efectivo.
export function payrollHistoryEntry(log, names = new Map()) {
  const base = { id: log.id, at: toDate(log.timestamp), who: whoOf(log), lines: [], people: [], truncated: !!log.truncated };
  if (log.action === "create") {
    const after = log.after || {};
    return {
      ...base,
      title: "Generó la nómina",
      lines: [{ text: `${fmtNumber((after.items || []).length)} personas · ${fmtNumber((after.workdayIds || []).length)} jornadas · total ${fmtCurrency(after.total)}` }],
    };
  }
  if (log.action === "delete") return { ...base, title: "Eliminó la nómina" };
  if (log.truncated) {
    return {
      ...base,
      title: "Editó la nómina",
      lines: [{ text: `El detalle no cupo en el registro. Cambió: ${(log.changedFields || []).join(", ") || "—"}.` }],
    };
  }

  const changes = log.changes || {};
  const titles = [];
  const lines = [];
  const has = (k) => k in changes;

  if (has("status")) titles.push(changes.status.to === "paid" ? "Marcó pagada" : "Volvió a pendiente");
  if (has("bankPaidAt")) titles.push(changes.bankPaidAt.to ? "Pagó las transferencias" : "Revirtió las transferencias");
  if (has("cashPaidRuts")) {
    const before = new Set(changes.cashPaidRuts.from || []);
    const after = new Set(changes.cashPaidRuts.to || []);
    const nameOf = (rut) => names.get(rut) || rut;
    const paid = [...after].filter((r) => !before.has(r));
    const unpaid = [...before].filter((r) => !after.has(r));
    titles.push("Marcó quién cobró el efectivo");
    if (paid.length) lines.push({ text: `Cobró: ${paid.map(nameOf).join(", ")}` });
    if (unpaid.length) lines.push({ text: `Desmarcado: ${unpaid.map(nameOf).join(", ")}` });
  }
  if (has("name")) {
    titles.push("Renombró");
    lines.push({ text: `${changes.name.from || "—"} → ${changes.name.to || "—"}` });
  }
  if (has("classification")) {
    titles.push(changes.classification.to === "diferencias" ? "Movió a Diferencias" : "Cambió la clasificación");
  }
  if (has("cycleLabelOverrides")) titles.push("Editó los encabezados");
  if (has("cycleIds")) {
    titles.push("Editó los ciclos");
    const labels = new Map([...cycleLabelsOf(changes.cycleDetails?.from), ...cycleLabelsOf(changes.cycleDetails?.to)]);
    const before = new Set(changes.cycleIds.from || []);
    const after = new Set(changes.cycleIds.to || []);
    for (const id of after) if (!before.has(id)) lines.push({ text: `+ ciclo ${labels.get(id) || id}` });
    for (const id of before) if (!after.has(id)) lines.push({ text: `− ciclo ${labels.get(id) || id}` });
  }
  let people = [];
  if (has("items")) {
    const change = itemsChangeOf(changes.items);
    const payouts = has("cycleIds") ? null : payoutOnlyChange(change);
    if (payouts) titles.push(payouts === "delivered" ? "Entregó anticipos" : "Quitó anticipos entregados");
    else if (!has("cycleIds")) {
      if (change.added.length && !change.removed.length && !change.changed.length) titles.push("Agregó personas");
      else if (change.removed.length && !change.added.length && !change.changed.length) titles.push("Sacó personas");
      else titles.push("Recalculó");
    }
    const own = personLines(change);
    lines.push(...own);
    people = own.map((l) => l.person);
  }
  if (has("total")) lines.push({ text: `Total: ${fmtCurrency(changes.total.from)} → ${fmtCurrency(changes.total.to)}` });
  const others = Object.keys(changes).filter((k) => !IGNORED.has(k) && !["status", "bankPaidAt", "cashPaidRuts", "name", "classification", "cycleLabelOverrides", "cycleIds", "items"].includes(k));
  if (titles.length === 0) titles.push("Editó la nómina");
  if (others.length) lines.push({ text: `También cambió: ${others.join(", ")}` });
  return { ...base, title: titles.join(" · "), lines, people };
}

// Las entradas de los registros, de la más nueva a la más vieja. `items` son
// las personas que tiene hoy la nómina, para nombrar a quienes cobraron el
// efectivo; también se nombran con las personas que traen los registros.
export function payrollHistoryOf(logs, items = []) {
  const names = new Map();
  const remember = (it) => {
    if (!it?.name) return;
    if (it.rut) names.set(it.rut, it.name);
    const key = it.key || itemKeyOf(it);
    if (key) names.set(key, it.name);
  };
  for (const it of items) remember(it);
  for (const log of logs) {
    for (const it of log.after?.items || []) remember(it);
    const c = log.changes?.items;
    if (c?.summary === "items") [...c.added, ...c.removed, ...c.changed].forEach(remember);
    else if (c) [...(c.from || []), ...(c.to || [])].forEach(remember);
  }
  return logs
    .map((log) => payrollHistoryEntry(log, names))
    .sort((a, b) => b.at - a.at);
}

// Las entradas filtradas por quién las hizo (`who`) y por una persona de la
// nómina (`query`, nombre o RUT): de cada entrada quedan solo las líneas de
// esa persona.
export function filterPayrollHistory(entries, { who = "", query = "" } = {}) {
  const q = query.trim();
  return entries
    .filter((e) => !who || e.who === who)
    .map((e) => {
      if (!q) return e;
      const lines = e.lines.filter((l) => l.person && workerMatchesQuery({ id: l.person, rut: l.rut || l.person, name: l.text }, q));
      return lines.length ? { ...e, lines } : null;
    })
    .filter(Boolean);
}
