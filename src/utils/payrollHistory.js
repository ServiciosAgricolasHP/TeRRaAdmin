// La línea de tiempo de una nómina, armada con sus registros de auditoría y
// los de su JSON (`payrollSnapshot`): qué se hizo, quién, cuándo y a quién le
// cambió algo. Lee los registros con las listas resumidas
// (`utils/logSummaries.js`) y los anteriores, que traen la lista de personas
// entera antes y después.
import { toDate } from "./auditLogs";
import { fmtCurrency, fmtNumber } from "./format";
import { itemKeyOf, listChange, payrollItemsChange } from "./logSummaries";
import { checkOf, reviewDiff } from "./payrollChecks/payrollChecks";
import { workerMatchesQuery } from "./workerSearch";

// Campos que se mueven solos con otros y no dicen nada por su cuenta.
const IGNORED = new Set([
  "updatedAt", "updatedBy", "updatedByName", "bankTotal", "cashTotal", "workerCount", "bankCount", "cashCount",
  "advanceTotal", "advanceIds", "payoutTotal", "payoutCycleDetails", "paidAt", "bankPaidBy", "cycleDetails", "cycleLabels", "total", "workdayIds",
]);

// El nombre en pantalla de los campos de la nómina y de su JSON.
const FIELD_LABELS = {
  name: "nombre", format: "formato del banco", status: "estado", paidAt: "fecha de pago",
  bankPaidAt: "pago de las transferencias", bankPaidBy: "quién pagó las transferencias", cashPaidRuts: "cobros en efectivo",
  classification: "clasificación", cycleIds: "ciclos", cycleLabels: "ciclos", cycleDetails: "ciclos", cycleLabelOverrides: "encabezados",
  items: "personas", workdayIds: "jornadas", advanceIds: "anticipos y bonos", reviewedChecks: "alertas revisadas", attachments: "adjuntos",
  total: "total", bankTotal: "total por banco", cashTotal: "total en efectivo", workerCount: "cantidad de personas",
  bankCount: "personas por banco", cashCount: "personas en efectivo", advanceTotal: "total de anticipos", bonusTotal: "total de bonos",
  payoutTotal: "anticipos entregados", payoutCycleDetails: "ciclos de los anticipos entregados", snapshot: "JSON de la nómina",
  createdAt: "fecha de creación", createdBy: "quién la creó", updatedAt: "fecha de edición", updatedBy: "quién la editó", updatedByName: "quién la editó",
  workers: "personas", workdays: "jornadas", cycles: "ciclos", advances: "anticipos y bonos", payroll: "totales",
  payrollId: "nómina", version: "versión", generatedAt: "fecha de generación",
};

// Los nombres en pantalla de unos campos, sin repetir.
const fieldsText = (keys) => [...new Set(keys.map((k) => FIELD_LABELS[k] || k))].join(", ");

const isSnapshotLog = (log) => log.entity === "payrollSnapshot";

// Las listas del JSON y cómo se nombran.
const SNAPSHOT_LISTS = [["workdays", "Jornadas"], ["cycles", "Ciclos"], ["advances", "Anticipos y bonos"]];

// "Jornadas: 120 → 132 (+14, −2)", o "Ciclos: 3, al día" si son los mismos.
function listLine(label, c) {
  const s = c?.summary === "list" ? c : listChange(c?.from, c?.to);
  const moves = [s.added ? `+${fmtNumber(s.added)}` : "", s.removed ? `−${fmtNumber(s.removed)}` : ""].filter(Boolean);
  if (!moves.length) return `${label}: ${fmtNumber(s.to)}, al día`;
  return `${label}: ${fmtNumber(s.from)} → ${fmtNumber(s.to)} (${moves.join(", ")})`;
}

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
    if (p.from.leader !== undefined && p.from.leader !== p.to.leader) details.push(`grupo ${p.from.leader || "sin grupo"} → ${p.to.leader || "sin grupo"}`);
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

// Si lo único que cambió en las personas es su grupo.
function leaderOnlyChange(change) {
  if (change.added.length || change.removed.length || !change.changed.length) return false;
  return change.changed.every((p) => p.from.leader !== p.to.leader && FIGURE_LABELS.every(([k]) => p.from[k] === p.to[k]) && p.from.amount === p.to.amount);
}

// Una línea por revisión con las personas de `keys` (`checkId|persona`):
// "✓ Cuenta compartida: Juan Soto, María Rojas".
function reviewLines(mark, keys, names) {
  const byCheck = new Map();
  for (const key of keys) {
    const cut = key.indexOf("|");
    const checkId = key.slice(0, cut);
    const person = key.slice(cut + 1);
    if (!byCheck.has(checkId)) byCheck.set(checkId, []);
    byCheck.get(checkId).push(person);
  }
  return [...byCheck].map(([checkId, persons]) => ({
    persons,
    text: `${mark} ${checkOf(checkId)?.title || checkId}: ${persons.map((p) => names.get(p) || p).join(", ")}`,
  }));
}

const cycleLabelsOf = (details) => new Map((details || []).map((d) => [d.id, d.label || d.id]));

// Lo que cambió en el JSON de la nómina: las personas, cuántas jornadas,
// ciclos y anticipos entraron y salieron, y el total. Al crearlo, el registro
// guarda la cabecera, sin las jornadas, y cuántas son en `meta`.
function snapshotEntry(log, base) {
  if (log.action === "create") {
    const after = log.after || {};
    const workdays = log.meta?.workdays ?? (after.workdays || []).length;
    return {
      ...base,
      title: "Generó el JSON de la nómina",
      lines: [{ text: `${fmtNumber((after.workers || []).length)} personas · ${fmtNumber(workdays)} jornadas` }],
    };
  }
  if (log.action === "delete") return { ...base, title: "Eliminó el JSON de la nómina" };
  const title = "Puso al día el JSON de la nómina";
  if (log.truncated) {
    return { ...base, title, lines: [{ text: `El detalle no cupo en el registro. Cambió: ${fieldsText(log.changedFields || []) || "—"}.` }] };
  }
  const changes = log.changes || {};
  const lines = [];
  if (changes.name) lines.push({ text: `Nombre: ${changes.name.from || "—"} → ${changes.name.to || "—"}` });
  let people = [];
  if (changes.workers) {
    const own = personLines(itemsChangeOf(changes.workers));
    lines.push(...own);
    people = own.map((l) => l.person);
  }
  const lists = SNAPSHOT_LISTS.filter(([k]) => changes[k]).map(([k, label]) => listLine(label, changes[k]));
  lines.push(...lists.map((text) => ({ text })));
  const totalFrom = changes.payroll?.from?.total;
  const totalTo = changes.payroll?.to?.total;
  if (totalFrom !== totalTo) lines.push({ text: `Total: ${fmtCurrency(totalFrom)} → ${fmtCurrency(totalTo)}` });
  const others = Object.keys(changes).filter((k) => !IGNORED.has(k) && !["name", "workers", "payroll", ...SNAPSHOT_LISTS.map(([key]) => key)].includes(k));
  if (others.length) lines.push({ text: `También cambió: ${fieldsText(others)}` });
  return { ...base, title, lines, people, lists };
}

// Una entrada por registro: `{ id, at, who, title, lines: [{ text, person? }],
// people, truncated }`. `names` (clave o RUT → nombre) nombra a quienes cobraron
// el efectivo. Un registro del JSON de la nómina dice qué cambió en el JSON.
export function payrollHistoryEntry(log, names = new Map()) {
  const base = { id: log.id, at: toDate(log.timestamp), who: whoOf(log), lines: [], people: [], truncated: !!log.truncated };
  if (isSnapshotLog(log)) {
    const { lists: _lists, ...entry } = snapshotEntry(log, base);
    return entry;
  }
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
      lines: [{ text: `El detalle no cupo en el registro. Cambió: ${fieldsText(log.changedFields || []) || "—"}.` }],
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
  if (has("reviewedChecks")) {
    const { marked, unmarked } = reviewDiff(changes.reviewedChecks.from || [], changes.reviewedChecks.to || []);
    if (marked.length && unmarked.length) titles.push("Marcó y desmarcó alertas revisadas");
    else if (unmarked.length) titles.push("Desmarcó alertas revisadas");
    else titles.push("Marcó alertas revisadas");
    lines.push(...reviewLines("✓", marked, names), ...reviewLines("✗ desmarcó", unmarked, names));
  }
  if (has("attachments")) {
    const before = new Set((changes.attachments.from || []).map((a) => a.id));
    const after = new Set((changes.attachments.to || []).map((a) => a.id));
    const added = (changes.attachments.to || []).filter((a) => !before.has(a.id));
    const removed = (changes.attachments.from || []).filter((a) => !after.has(a.id));
    if (added.length) titles.push(added.length === 1 ? "Adjuntó un archivo" : `Adjuntó ${added.length} archivos`);
    if (removed.length) titles.push(removed.length === 1 ? "Quitó un adjunto" : `Quitó ${removed.length} adjuntos`);
    lines.push(...added.map((a) => ({ text: `+ ${a.name}` })), ...removed.map((a) => ({ text: `− ${a.name}` })));
  }
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
    else if (!has("cycleIds") && leaderOnlyChange(change)) titles.push("Asignó grupos");
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
  const others = Object.keys(changes).filter((k) => !IGNORED.has(k) && !["status", "bankPaidAt", "cashPaidRuts", "name", "classification", "cycleLabelOverrides", "cycleIds", "items", "reviewedChecks", "attachments"].includes(k));
  if (titles.length === 0) titles.push("Editó la nómina");
  if (others.length) lines.push({ text: `También cambió: ${fieldsText(others)}` });
  return { ...base, title: titles.join(" · "), lines, people };
}

// Hasta cuánto después de un cambio de la nómina el del JSON es parte de él.
const SNAPSHOT_PAIR_MS = 60 * 1000;

// Las entradas de los registros. Un cambio de la nómina pone al día su JSON
// en un registro aparte: si hay uno de la misma persona, con la misma acción y
// a menos de un minuto, el del JSON no va solo, y la entrada de la nómina suma
// una línea con lo que cambió en sus listas.
function historyEntries(logs, names) {
  const entries = logs.map((log) => ({ log, entry: payrollHistoryEntry(log, names) }));
  const actorOf = (log) => log.uid || whoOf(log);
  const mates = entries.filter(({ log }) => !isSnapshotLog(log));
  const paired = new Set();
  const dropped = new Set();
  for (const item of entries) {
    if (!isSnapshotLog(item.log)) continue;
    let best = null;
    for (const m of mates) {
      if (paired.has(m) || m.log.action !== item.log.action || actorOf(m.log) !== actorOf(item.log)) continue;
      const gap = Math.abs(m.entry.at - item.entry.at);
      if (gap <= SNAPSHOT_PAIR_MS && (!best || gap < best.gap)) best = { m, gap };
    }
    if (!best) continue;
    paired.add(best.m);
    dropped.add(item);
    const lists = item.log.action === "update" && !item.log.truncated ? snapshotEntry(item.log, item.entry).lists : [];
    if (lists.length) best.m.entry.lines.push({ text: `JSON de la nómina al día · ${lists.join(" · ")}` });
  }
  return entries.filter((item) => !dropped.has(item)).map((item) => item.entry);
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
    for (const it of log.after?.items || log.after?.workers || []) remember(it);
    const c = log.changes?.items || log.changes?.workers;
    if (c?.summary === "items") [...c.added, ...c.removed, ...c.changed].forEach(remember);
    else if (c) [...(c.from || []), ...(c.to || [])].forEach(remember);
  }
  return historyEntries(logs, names).sort((a, b) => b.at - a.at);
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
      const lines = e.lines.filter((l) => {
        const ids = l.persons || (l.person ? [l.person] : []);
        return ids.some((id) => workerMatchesQuery({ id, rut: l.rut || id, name: l.text }, q));
      });
      return lines.length ? { ...e, lines } : null;
    })
    .filter(Boolean);
}
