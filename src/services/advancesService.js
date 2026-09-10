// Anticipos & Bonos — single collection with type discriminator.
// type "anticipo": descuento sobre la próxima nómina (sign = -1).
// type "bono":     suma sobre la próxima nómina (sign = +1).
//
// Legacy "adelanto" se normaliza a "anticipo" al leer (mismo signo, mismo flujo).
//
// Doc shape:
//   id, type, workerRut, workerName, amount, date, note,
//   status: "pending" | "partial" | "applied" | "cancelled",
//   amountPaid: number (sum of payments[]),
//   payments: [{ payrollId, amount, paidAt }],
//   appliedPayrollId: string | null  (last payroll that touched it; legacy)
//   appliedAt, appliedBy
//   installments: { count, amount, cadence } | null  (anticipo-only; see below)
//
// "pending"  → no amount applied yet (or amountPaid == 0).
// "partial"  → amountPaid > 0 but < amount; can keep being applied.
// "applied"  → amountPaid >= amount.
//
// installments: optional repayment plan set at creation, only for type
// "anticipo" (never bono), locked afterward (create a new advance instead of
// editing a plan mid-repayment). `cadence` is a label/hint for the admin —
// NOT a date-based gate — deduction still only happens when a payroll is
// generated, and the admin explicitly confirms which cuotas apply in
// InstallmentConfirmModal (Payroll.jsx). See advanceDueNow()/
// installmentProgress() below.
import { writeBatch, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { createService } from "./firestoreBase";

export const ADVANCE_TYPES = [
  { value: "anticipo", label: "Anticipo", icon: "🪙", sign: -1 },
  { value: "bono",     label: "Bono",     icon: "🎁", sign: +1 },
];

const LEGACY_TYPE_MAP = { adelanto: "anticipo" };

export function normalizeAdvanceType(type) {
  return LEGACY_TYPE_MAP[type] || type || "anticipo";
}

export function advanceSign(advOrType) {
  const t = typeof advOrType === "string" ? advOrType : advOrType?.type;
  return normalizeAdvanceType(t) === "bono" ? +1 : -1;
}

export function isBono(advOrType) {
  return advanceSign(advOrType) > 0;
}

export function advanceTypeMeta(type) {
  const t = normalizeAdvanceType(type);
  return ADVANCE_TYPES.find((x) => x.value === t) || ADVANCE_TYPES[0];
}

export const advancesService = createService("advance", "advances");

// Fase 3 de "rut editable": un anticipo puede estar marcado por `workerRut`
// (rut al crearlo) o por `workerId` (id estable, agregado en fase 2).
// Aceptamos ambas listas y mezclamos — así no se pierde un anticipo pendiente
// si el rut del trabajador cambió después de crearlo.
export async function listPendingForWorkers(workerRuts, workerIds = []) {
  // Firestore caps disjunctive normal form at 30. Two compound `in` filters
  // multiply: 30 ruts × 2 statuses = 60 → too many disjunctions. We keep each
  // chunk at 15 and filter status client-side to stay under the limit even
  // if the status set grows in the future.
  const out = [];
  const seen = new Set();
  const PENDING_STATUSES = new Set(["pending", "partial"]);
  const collect = async (field, values) => {
    const uniq = [...new Set(values)].filter(Boolean);
    for (let i = 0; i < uniq.length; i += 15) {
      const chunk = uniq.slice(i, i + 15);
      const list = await advancesService.list({ wheres: [[field, "in", chunk]] });
      for (const a of list) {
        if (seen.has(a.id)) continue;
        // Legacy docs without a `status` field are treated as pending.
        const st = a.status || "pending";
        if (!PENDING_STATUSES.has(st)) continue;
        seen.add(a.id);
        out.push(a);
      }
    }
  };
  await collect("workerRut", workerRuts);
  await collect("workerId", workerIds);
  return out;
}

// Helper: how much of an advance is still owed.
export function advanceRemaining(adv) {
  const amount = Number(adv?.amount) || 0;
  const paid = Number(adv?.amountPaid) || 0;
  return Math.max(0, amount - paid);
}

export const INSTALLMENT_CADENCES = [
  { value: "porPago", label: "Por pago", minDays: 0 },
  { value: "quincenal", label: "Quincenal", minDays: 15 },
  { value: "mensual", label: "Mensual", minDays: 30 },
];

export function cadenceMeta(cadence) {
  return INSTALLMENT_CADENCES.find((c) => c.value === cadence) || INSTALLMENT_CADENCES[0];
}

// Math.ceil (no Math.round): count cuotas siempre alcanzan para cubrir el
// total, y la última queda naturalmente más chica (clippeada por
// advanceRemaining() al aplicarla) — sin tener que llevar la cuenta de "en
// qué cuota vamos".
export function computeCuotaAmount(amount, count) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  return Math.ceil((Number(amount) || 0) / n);
}

export function hasInstallmentPlan(adv) {
  return Number(adv?.installments?.count) > 1 && !isBono(adv);
}

// Fecha base para "última cuota hace N días": el MÁXIMO entre los payments[]
// con amount>0 (nunca el último elemento del array — restoreAdvancesFromPayroll
// filtra entradas del medio al revertir una nómina, así que el array no queda
// necesariamente ordenado por fecha), o la fecha del anticipo si aún no hay pagos.
export function lastCuotaDate(adv) {
  const payments = Array.isArray(adv?.payments) ? adv.payments : [];
  let best = null;
  for (const p of payments) {
    if (!(Number(p?.amount) > 0)) continue;
    const d = String(p?.paidAt || "").slice(0, 10);
    if (d && (!best || d > best)) best = d;
  }
  return best || String(adv?.date || "").slice(0, 10) || null;
}

export function daysSinceLastCuota(adv, asOf = new Date()) {
  const last = lastCuotaDate(adv);
  if (!last) return null;
  const dayMs = 86400000;
  const lastMs = Date.parse(`${last}T00:00:00Z`);
  const asOfMs = Date.parse(`${asOf.toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(lastMs) || Number.isNaN(asOfMs)) return null;
  return Math.max(0, Math.round((asOfMs - lastMs) / dayMs));
}

// Resumen del plan de cuotas de un anticipo, para badges y el modal de
// confirmación al generar nómina. Puramente informativo — no gatea nada.
export function installmentProgress(adv) {
  if (!hasInstallmentPlan(adv)) return null;
  const plan = adv.installments;
  const cuotaAmount = Number(plan.amount) || computeCuotaAmount(adv.amount, plan.count);
  const paidCount = Math.min(plan.count, Math.round((Number(adv.amountPaid) || 0) / (cuotaAmount || 1)));
  return {
    count: plan.count,
    paidCount,
    cuotaAmount,
    cadence: plan.cadence,
    remaining: advanceRemaining(adv),
    daysSinceLastCuota: daysSinceLastCuota(adv),
  };
}

// Monto SUGERIDO si esta cuota se llegara a aplicar en una nómina. La
// decisión de aplicarla o no la toma el admin a mano (InstallmentConfirmModal
// en Payroll.jsx) — esta función nunca devuelve $0 por fecha/cadencia, solo
// por saldo agotado.
export function advanceDueNow(adv) {
  const remaining = advanceRemaining(adv);
  if (remaining <= 0) return 0;
  if (!hasInstallmentPlan(adv)) return remaining;
  const cuotaAmount = Number(adv.installments.amount) || computeCuotaAmount(adv.amount, adv.installments.count);
  return Math.min(remaining, cuotaAmount);
}

export async function listAllPending() {
  return advancesService.list({
    wheres: [["status", "==", "pending"]],
    order: ["date", "desc"],
  });
}

export async function listAll() {
  return advancesService.list({ order: ["date", "desc"] });
}

// Apply partial / full payments against advances.
// `applications`: [{ advanceId, amount }]  — `amount` is what this payroll
// actually paid against that advance. The advance's status flips to "partial"
// or "applied" depending on whether amountPaid reaches the full amount.
export async function applyAdvancesToPayroll(applications, payrollId) {
  if (!applications || applications.length === 0) return;
  // Fetch each advance to compute its new amountPaid + status.
  const docs = await Promise.all(
    applications.map(async (app) => {
      const snap = await getDoc(doc(db, "advances", app.advanceId));
      return { app, data: snap.exists() ? snap.data() : null };
    }),
  );

  const now = new Date(); // serverTimestamp() can't be used inside arrayUnion
  const uid = auth.currentUser?.uid || null;
  const chunkSize = 450;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    for (const { app, data } of docs.slice(i, i + chunkSize)) {
      if (!data) continue;
      const total = Number(data.amount) || 0;
      const prevPaid = Number(data.amountPaid) || 0;
      const newPaid = Math.min(total, prevPaid + (Number(app.amount) || 0));
      const status = newPaid >= total && total > 0 ? "applied" : (newPaid > 0 ? "partial" : "pending");
      const payments = Array.isArray(data.payments) ? [...data.payments] : [];
      payments.push({ payrollId, amount: Number(app.amount) || 0, paidAt: now.toISOString() });
      batch.update(doc(db, "advances", app.advanceId), {
        status,
        amountPaid: newPaid,
        payments,
        appliedPayrollId: payrollId,
        appliedAt: serverTimestamp(),
        appliedBy: uid,
      });
    }
    await batch.commit();
  }
  advancesService.invalidate();
}

// Reverse the payments[] entries that match `payrollId`. If no other payroll
// has paid against it, the advance returns to "pending"; otherwise it stays
// "partial" with the reduced amountPaid.
export async function restoreAdvancesFromPayroll(advanceIds, payrollId) {
  if (!advanceIds || advanceIds.length === 0) return;
  const docs = await Promise.all(
    advanceIds.map(async (id) => {
      const snap = await getDoc(doc(db, "advances", id));
      return { id, data: snap.exists() ? snap.data() : null };
    }),
  );
  const chunkSize = 450;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    for (const { id, data } of docs.slice(i, i + chunkSize)) {
      if (!data) continue;
      const total = Number(data.amount) || 0;
      const payments = Array.isArray(data.payments) ? data.payments : [];
      const remainingPayments = payments.filter((p) => p.payrollId !== payrollId);
      const newPaid = remainingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const status = newPaid >= total && total > 0 ? "applied" : (newPaid > 0 ? "partial" : "pending");
      batch.update(doc(db, "advances", id), {
        status,
        amountPaid: newPaid,
        payments: remainingPayments,
        // Best effort: clear appliedPayrollId only if this was the last pointer.
        appliedPayrollId: status === "pending" ? null : (data.appliedPayrollId === payrollId ? null : data.appliedPayrollId),
        appliedAt: status === "pending" ? null : data.appliedAt,
      });
    }
    await batch.commit();
  }
  advancesService.invalidate();
}
