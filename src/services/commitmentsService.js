// Cheques y pagos (`commitments`), las series que los generan
// (`commitmentSeries`: créditos en cuotas y pagos recurrentes) y la
// configuración de los avisos por correo (`commitmentConfig/main`). Los avisos
// los envía la función programada de `functions/index.js`.
import { createService } from "./firestoreBase";
import { isCheque, buildInstallments, recurringDates, addDays, RECURRING_HORIZON_DAYS } from "../utils/commitments";
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
// cambia aparte (`markPaid`, `markPending`, `cancel`).
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

export async function saveCommitment(draft) {
  const data = normalizeCommitment(draft);
  validate(data);
  if (draft.id) return commitmentsService.update(draft.id, data);
  return commitmentsService.create({ ...data, status: "pending", paidAt: "" });
}

export const markPaid = (id, paidAt) => commitmentsService.update(id, { status: "paid", paidAt });
export const markPending = (id) => commitmentsService.update(id, { status: "pending", paidAt: "" });
export const cancelCommitment = (id) => commitmentsService.update(id, { status: "cancelled", paidAt: "" });

const occurrenceId = (seriesId, dueDate) => `${seriesId}_${dueDate}`;

// Crédito en cuotas: la serie y sus N cuotas, cada una un vencimiento propio.
export async function createInstallmentPlan(draft, { firstDate, count }) {
  const base = normalizeCommitment({ ...draft, kind: "installment" });
  const cuotas = buildInstallments({ firstDate, count });
  if (!cuotas.length) throw new Error("Indica la fecha de la primera cuota y cuántas son");
  validate({ ...base, dueDate: firstDate });
  const series = await commitmentSeriesService.create({
    ...base,
    dueDate: firstDate,
    frequency: "monthly",
    firstDate,
    count: cuotas.length,
    active: true,
  });
  await Promise.all(
    cuotas.map((c) =>
      commitmentsService.create(
        { ...base, dueDate: c.dueDate, status: "pending", paidAt: "", seriesId: series.id, installment: { n: c.n, of: c.of } },
        { id: occurrenceId(series.id, c.dueDate) },
      ),
    ),
  );
  return { series, count: cuotas.length };
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
  const futuros = commitments.filter((c) => c.seriesId === seriesId && c.status === "pending" && c.dueDate > today);
  await Promise.all(futuros.map((c) => commitmentsService.remove(c.id)));
  return futuros.length;
}

// Escribe las filas del import que todavía no existen. Una fila cuyo id ya
// está se salta, así reimportar no pisa lo que se marcó después en la app.
export async function importRows(rows, existingIds) {
  const nuevas = rows.filter((r) => r.id && !existingIds.has(r.id));
  await Promise.all(nuevas.map((r) => commitmentsService.create(r.data, { id: r.id })));
  return nuevas.length;
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
