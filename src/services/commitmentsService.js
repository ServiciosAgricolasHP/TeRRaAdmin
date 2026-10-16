// Cheques y pagos (`commitments`), las series que los generan
// (`commitmentSeries`: créditos en cuotas y pagos recurrentes) y la
// configuración de los avisos por correo (`commitmentConfig/main`). Los avisos
// los envía la función programada de `functions/index.js`.
import { auth } from "../firebase";
import { createService } from "./firestoreBase";
import {
  isCheque,
  isOpen,
  partialPaidOf,
  remainingOf,
  allocatePartialPayment,
  buildInstallments,
  recurringDates,
  addDays,
  RECURRING_HORIZON_DAYS,
} from "../utils/commitments";
import { toTitleName, unshout } from "../utils/textCase";

export const commitmentsService = createService("commitment", "commitments");
export const commitmentSeriesService = createService("commitmentSeries", "commitmentSeries");
export const commitmentConfigService = createService("commitmentConfig", "commitmentConfig");

export const DEFAULT_COMMITMENT_CONFIG = {
  recipients: [],
  offsets: [3, 1, 0],
  includeOverdue: true,
  sender: "",
};

export function listCommitments() {
  return commitmentsService.list({ order: ["dueDate", "asc"], cache: true, ttl: 300_000 });
}

// Campos editables de un vencimiento, con el texto normalizado. El estado se
// cambia aparte (`markPaid`, `markPending`, `cancelCommitment`, etc.).
// `amount` es el monto original; lo pagado de más se guarda al pagar.
export function normalizeCommitment(d) {
  const cheque = isCheque(d.kind);
  return {
    kind: d.kind,
    dueDate: d.dueDate,
    issueDate: d.issueDate || "",
    amount: Math.round(Number(d.amount) || 0),
    counterparty: toTitleName(String(d.counterparty || "")),
    concept: unshout(String(d.concept || "").trim()),
    notes: unshout(String(d.notes || "").trim()),
    bank: cheque ? d.bank || "" : "",
    chequeNumber: cheque ? String(d.chequeNumber || "").trim() : "",
    companyId: d.companyId || null,
    companyLabel: d.companyId ? "" : d.companyLabel || "",
  };
}

function validate(data) {
  if (!data.dueDate) throw new Error("Falta la fecha de vencimiento");
  if (!(data.amount > 0)) throw new Error("El monto debe ser mayor a 0");
  if (!data.counterparty) throw new Error("Falta a quién se le paga o quién paga");
}

// Lo pagado por sobre el monto original (interés por atraso u otro recargo).
function cleanExtra(extra) {
  const n = Math.round(Number(extra) || 0);
  if (n < 0) throw new Error("Lo pagado no puede ser menos que el monto original");
  return n;
}

export async function saveCommitment(draft) {
  const data = normalizeCommitment(draft);
  validate(data);
  if (draft.id) {
    if (draft.status === "paid") data.extra = cleanExtra(draft.extra);
    if (isOpen(draft) && data.amount < partialPaidOf(draft)) throw new Error("El monto no puede ser menor que lo ya abonado");
    return commitmentsService.update(draft.id, data);
  }
  return commitmentsService.create({ ...data, status: "pending", paidAt: "" });
}

export async function markPaid(id, paidAt, extra = 0) {
  return commitmentsService.update(id, { status: "paid", paidAt, extra: cleanExtra(extra), closedByPartials: false });
}
export const markPending = (id) => commitmentsService.update(id, { status: "pending", paidAt: "", extra: 0, closedByPartials: false });
export const cancelCommitment = (id) => commitmentsService.update(id, { status: "cancelled", paidAt: "", extra: 0 });

// Ya venció y no tiene fecha de pago: sigue como deuda, sin avisos por correo.
export const markPostponed = (id) => commitmentsService.update(id, { status: "postponed", paidAt: "", extra: 0 });

// Cheque rechazado por el banco: sigue como deuda (o como plata por cobrar),
// sin avisos por correo.
export const markProtested = (id) => commitmentsService.update(id, { status: "protested", paidAt: "", extra: 0 });

// Fecha nueva para algo aplazado o protestado: vuelve a pendiente y a avisarse.
export async function reschedule(id, dueDate) {
  if (!dueDate) throw new Error("Falta la nueva fecha");
  return commitmentsService.update(id, { status: "pending", dueDate, paidAt: "", extra: 0 });
}

const occurrenceId = (seriesId, dueDate) => `${seriesId}_${dueDate}`;

// Crédito en cuotas, o deuda personal en cuotas (`kind: "personalDebt"`): la
// serie y sus N cuotas, cada una un vencimiento propio.
export async function createInstallmentPlan(draft, { firstDate, count, kind = "installment" }) {
  const base = normalizeCommitment({ ...draft, kind });
  const installments = buildInstallments({ firstDate, count });
  if (!installments.length) throw new Error("Indica la fecha de la primera cuota y cuántas son");
  validate({ ...base, dueDate: firstDate });
  const series = await commitmentSeriesService.create({
    ...base,
    dueDate: firstDate,
    frequency: "monthly",
    firstDate,
    count: installments.length,
    active: true,
  });
  await Promise.all(
    installments.map((c) =>
      commitmentsService.create(
        { ...base, dueDate: c.dueDate, status: "pending", paidAt: "", seriesId: series.id, installment: { n: c.n, of: c.of } },
        { id: occurrenceId(series.id, c.dueDate) },
      ),
    ),
  );
  return { series, count: installments.length };
}

// Pago recurrente mensual sin fecha de término. Se generan los vencimientos
// hasta `RECURRING_HORIZON_DAYS` por delante; la función diaria sigue
// extendiendo desde `generatedUntil`.
export async function createRecurringPlan(draft, { firstDate, today }) {
  const base = normalizeCommitment({ ...draft, kind: "payment" });
  validate({ ...base, dueDate: firstDate });
  const until = addDays(today, RECURRING_HORIZON_DAYS);
  const dates = recurringDates({ firstDate, until });
  const series = await commitmentSeriesService.create({
    ...base,
    dueDate: firstDate,
    frequency: "monthly",
    firstDate,
    count: null,
    active: true,
    generatedUntil: until,
  });
  await Promise.all(
    dates.map((dueDate) =>
      commitmentsService.create(
        { ...base, dueDate, status: "pending", paidAt: "", seriesId: series.id, installment: null },
        { id: occurrenceId(series.id, dueDate) },
      ),
    ),
  );
  return { series, count: dates.length };
}

// Detiene una serie y elimina sus vencimientos pendientes posteriores a hoy.
// Los pagados, anulados y los ya vencidos quedan como registro.
export async function stopSeries(seriesId, today, commitments) {
  await commitmentSeriesService.update(seriesId, { active: false });
  const upcoming = commitments.filter((c) => c.seriesId === seriesId && c.status === "pending" && c.dueDate > today);
  await Promise.all(upcoming.map((c) => commitmentsService.remove(c.id)));
  return upcoming.length;
}

// ── Abonos ──────────────────────────────────────────────────────────────────

const newPaymentId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ab_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

function cleanPartialPayment({ date, amount, notes }) {
  const n = Math.round(Number(amount) || 0);
  if (!(n > 0)) throw new Error("El abono debe ser mayor a 0");
  if (!date) throw new Error("Falta la fecha del abono");
  return { amount: n, date, notes: unshout(String(notes || "").trim()) };
}

// Suma abonos a un vencimiento abierto. Si con ellos queda cubierto, se marca
// pagado con la fecha del abono y `closedByPartials`, así quitar ese abono lo
// devuelve a pendiente.
function withPartialPayment(c, payment) {
  const partialPayments = [...(c.partialPayments || []), payment];
  const covered = partialPaidOf({ partialPayments }) >= (Number(c.amount) || 0);
  return covered
    ? { partialPayments, status: "paid", paidAt: payment.date, extra: 0, closedByPartials: true }
    : { partialPayments };
}

// Abono a un solo vencimiento: hasta lo que le falta.
export async function addPartialPayment(c, input) {
  const data = cleanPartialPayment(input);
  if (!isOpen(c)) throw new Error("Solo se abona a algo que está pendiente");
  if (data.amount > remainingOf(c)) throw new Error("El abono es mayor que lo que falta pagar");
  const payment = { id: newPaymentId(), ...data, createdAt: new Date().toISOString(), createdBy: auth.currentUser?.uid || null };
  return commitmentsService.update(c.id, withPartialPayment(c, payment));
}

// Abono a toda la deuda (los vencimientos abiertos de una serie): se reparte
// del más antiguo al más nuevo (`allocatePartialPayment`). Cada parte lleva el
// mismo `groupId`, que es lo que permite quitarlo entero.
export async function addDebtPartialPayment(items, input) {
  const data = cleanPartialPayment(input);
  const { parts, leftover } = allocatePartialPayment(items, data.amount);
  if (leftover > 0) throw new Error("El abono es mayor que lo que falta pagar de la deuda");
  const groupId = newPaymentId();
  const createdAt = new Date().toISOString();
  const createdBy = auth.currentUser?.uid || null;
  const byId = new Map(items.map((c) => [c.id, c]));
  await Promise.all(
    parts.map((p) =>
      commitmentsService.update(
        p.id,
        withPartialPayment(byId.get(p.id), { id: newPaymentId(), ...data, amount: p.amount, groupId, groupTotal: data.amount, createdAt, createdBy }),
      ),
    ),
  );
  return parts;
}

// Quita un abono; si era a toda la deuda, todas sus partes. Un vencimiento que
// quedó pagado por los abonos vuelve a pendiente. Uno que se marcó pagado a
// mano no se toca: primero se vuelve a pendiente.
export async function removePartialPayment(items, payment) {
  const matches = (p) => (payment.groupId ? p.groupId === payment.groupId : p.id === payment.id);
  const touched = items.filter((c) => (c.partialPayments || []).some(matches));
  const blocked = touched.find((c) => c.status === "paid" && !c.closedByPartials);
  if (blocked) throw new Error("Un vencimiento de este abono ya está marcado pagado. Vuélvelo a pendiente antes de quitar el abono.");
  await Promise.all(
    touched.map((c) => {
      const partialPayments = c.partialPayments.filter((p) => !matches(p));
      const reopen = c.status === "paid" ? { status: "pending", paidAt: "", extra: 0, closedByPartials: false } : {};
      return commitmentsService.update(c.id, { partialPayments, ...reopen });
    }),
  );
  return touched.length;
}

// ── Ajuste de una serie ─────────────────────────────────────────────────────

// Guarda las fechas y montos que cambiaron en una serie (`seriesChanges`). Lo
// aplazado o protestado con fecha nueva vuelve a pendiente, como al
// reprogramarlo. En un pago recurrente, `seriesPatch` lleva el monto o el día
// nuevos para lo que se genere después, y `generatedUntil` se adelanta al
// último vencimiento para que la función diaria no repita un mes.
export async function saveSeriesEdit(series, items, changes, seriesPatch = {}) {
  const byId = new Map(items.map((c) => [c.id, c]));
  await Promise.all(
    changes.map(({ id, patch }) => {
      const c = byId.get(id);
      const undated = c && (c.status === "postponed" || c.status === "protested");
      return commitmentsService.update(id, patch.dueDate && undated ? { ...patch, status: "pending" } : patch);
    }),
  );
  if (series && series.count == null) {
    const lastDue = items.reduce((max, c) => {
      const due = changes.find((x) => x.id === c.id)?.patch.dueDate || c.dueDate;
      return due > max ? due : max;
    }, series.generatedUntil || "");
    const patch = { ...seriesPatch };
    if (lastDue !== (series.generatedUntil || "")) patch.generatedUntil = lastDue;
    if (Object.keys(patch).length) await commitmentSeriesService.update(series.id, patch);
  }
  return changes.length;
}

// Escribe las filas del import que todavía no existen. Una fila cuyo id ya
// está se salta, así reimportar no pisa lo que se marcó después en la app.
export async function importRows(rows, existingIds) {
  const newRows = rows.filter((r) => r.id && !existingIds.has(r.id));
  await Promise.all(newRows.map((r) => commitmentsService.create(r.data, { id: r.id })));
  return newRows.length;
}

export async function getCommitmentConfig() {
  const doc = await commitmentConfigService.getById("main");
  return { ...DEFAULT_COMMITMENT_CONFIG, ...(doc || {}) };
}

export function saveCommitmentConfig(config) {
  const offsets = [...new Set((config.offsets || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60))].sort(
    (a, b) => b - a,
  );
  const recipients = [...new Set((config.recipients || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  return commitmentConfigService.upsert("main", {
    recipients,
    offsets,
    includeOverdue: !!config.includeOverdue,
    sender: String(config.sender || "").trim().toLowerCase(),
  });
}
