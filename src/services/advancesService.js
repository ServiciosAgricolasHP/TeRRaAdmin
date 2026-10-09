// Anticipos y bonos: una sola colección con discriminador `type`.
// type "anticipo": descuenta de la próxima nómina (signo -1).
// type "bono":     suma a la próxima nómina (signo +1).
//
// El tipo "adelanto" se normaliza a "anticipo" al leer (mismo signo, mismo flujo).
//
// Forma del documento:
//   id, type, workerRut, workerName, amount, date, note,
//   status: "pending" | "partial" | "applied" | "cancelled",
//   amountPaid: number (suma de payments[]),
//   payments: [{ payrollId, amount, paidAt }],
//   appliedPayrollId: string | null  (última nómina que lo tocó)
//   appliedAt, appliedBy
//   installments: { count, amount, cadence } | null  (solo anticipos; ver abajo)
//
// "pending"  → nada aplicado (amountPaid == 0).
// "partial"  → amountPaid > 0 pero < amount; se sigue aplicando contra el saldo.
// "applied"  → amountPaid >= amount.
//
// installments: plan de cuotas opcional, solo para "anticipo" (nunca bono),
// que se fija al crearlo y no se edita después. `cadence` es una etiqueta para
// el admin, no un corte por fecha: el descuento ocurre al generar una nómina,
// y el admin confirma qué cuotas aplica en InstallmentConfirmModal
// (Payroll.jsx). Ver advanceDueNow() e installmentProgress().
import { writeBatch, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { createService } from "./firestoreBase";
import { logAction } from "./logger";

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

// Clave para agrupar los anticipos de una misma persona. Prefiere `workerId`:
// los anticipos de un trabajador que cambió de rut pueden tener distinto
// `workerRut`.
export const advanceWorkerKey = (a) => a?.workerId || a?.workerRut || "";

// Compara los dos identificadores del anticipo, `workerId` y `workerRut`,
// contra las claves buscadas: pueden ser distintos y basta con que coincida uno.
export const advanceMatchesWorker = (a, keys) =>
  [a?.workerId, a?.workerRut].some((id) => id && keys.has(id));

// Anticipos y bonos con saldo (`pending` o `partial`) de los ruts dados. Se
// buscan solo por `workerRut`.
export async function listPendingForWorkers(workerRuts) {
  // El estado se filtra en el servidor, así no se leen los anticipos saldados.
  // Firestore expande la consulta a forma normal disyuntiva y admite hasta 30
  // términos: 10 ruts × 2 estados = 20.
  const out = [];
  const seen = new Set();
  const uniq = [...new Set(workerRuts)].filter(Boolean);

  for (let i = 0; i < uniq.length; i += 10) {
    const chunk = uniq.slice(i, i + 10);
    const list = await advancesService.list({
      wheres: [
        ["workerRut", "in", chunk],
        ["status", "in", ["pending", "partial"]],
      ],
      cache: true,
    });
    for (const a of list) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }

  return out;
}

// Saldo que queda por descontar de un anticipo.
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

// Redondea hacia arriba para que `count` cuotas cubran el total. La última
// queda más chica porque al aplicarla se topa con advanceRemaining().
export function computeCuotaAmount(amount, count) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  return Math.ceil((Number(amount) || 0) / n);
}

export function hasInstallmentPlan(adv) {
  return Number(adv?.installments?.count) > 1 && !isBono(adv);
}

// Fecha base para "última cuota hace N días": la mayor fecha entre los
// payments[] con amount > 0, o la del anticipo si no hay pagos. No se toma el
// último elemento porque el array no está necesariamente ordenado por fecha.
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
// confirmación al generar nómina. Solo informativo: no bloquea nada.
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

// Aplica descuentos parciales o totales de una nómina contra los anticipos.
// `applications`: [{ advanceId, amount }], con `amount` = lo que esta nómina
// pide descontar de ese anticipo. El estado pasa a "partial" o "applied" según
// si amountPaid llega al total.
export async function applyAdvancesToPayroll(applications, payrollId) {
  if (!applications || applications.length === 0) return;
  // Lee cada anticipo para calcular su nuevo amountPaid y estado.
  const docs = await Promise.all(
    applications.map(async (app) => {
      const snap = await getDoc(doc(db, "advances", app.advanceId));
      return { app, data: snap.exists() ? snap.data() : null };
    }),
  );

  const now = new Date(); // serverTimestamp() no se puede usar dentro de un array
  const uid = auth.currentUser?.uid || null;
  // Aplicaciones que pidieron descontar más que el saldo. Van al log, así
  // quedan visibles en Auditoría.
  const sobrantes = [];
  const chunkSize = 450;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    for (const { app, data } of docs.slice(i, i + chunkSize)) {
      if (!data) continue;
      const total = Number(data.amount) || 0;
      const prevPaid = Number(data.amountPaid) || 0;
      const pedido = Number(app.amount) || 0;
      const newPaid = Math.min(total, prevPaid + pedido);
      // payments[] guarda lo descontado, no lo pedido: restoreAdvancesFromPayroll
      // recalcula el saldo desde ahí.
      const aplicado = newPaid - prevPaid;
      const status = newPaid >= total && total > 0 ? "applied" : (newPaid > 0 ? "partial" : "pending");
      const payments = Array.isArray(data.payments) ? [...data.payments] : [];
      payments.push({ payrollId, amount: aplicado, paidAt: now.toISOString() });
      if (aplicado < pedido) {
        // Se pidió más que el saldo: al trabajador se le retuvo `pedido` pero
        // la deuda solo baja `aplicado`. La diferencia se le devuelve a mano.
        sobrantes.push({ advanceId: app.advanceId, pedido, aplicado });
      }
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
  // Un log por operación ("esta nómina descontó estos anticipos"), no uno por
  // anticipo.
  await logAction({
    action: "update",
    entity: "payroll",
    entityId: payrollId,
    changes: null,
    meta: {
      op: "applyAdvances",
      count: applications.length,
      total: applications.reduce((s, a) => s + (Number(a.amount) || 0), 0),
      advanceIds: applications.map((a) => a.advanceId),
      ...(sobrantes.length ? { sobrantes } : {}),
    },
  });
  return { sobrantes };
}

// Quita de payments[] las entradas de `payrollId` y recalcula amountPaid y
// estado con lo que descontaron las demás nóminas: sin otras, el anticipo
// vuelve a "pending".
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
        // Limpia appliedPayrollId si queda pendiente o si apuntaba a esta nómina.
        appliedPayrollId: status === "pending" ? null : (data.appliedPayrollId === payrollId ? null : data.appliedPayrollId),
        appliedAt: status === "pending" ? null : data.appliedAt,
      });
    }
    await batch.commit();
  }
  advancesService.invalidate();
  await logAction({
    action: "update",
    entity: "payroll",
    entityId: payrollId,
    changes: null,
    meta: { op: "restoreAdvances", count: advanceIds.length, advanceIds },
  });
}

// Cuánto le aplica HOY una nómina a cada anticipo/bono, leído del `payments[]`
// de cada documento. Es la fuente de verdad que usan el borrado de la nómina y
// la pantalla de Anticipos; la copia en el item de la nómina puede haber
// quedado corta. Devuelve solo los documentos que existen.
export async function readPayrollApplications(payrollId, advanceIds) {
  const ids = [...new Set((advanceIds || []).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const docs = await Promise.all(
    ids.map(async (id) => {
      const snap = await getDoc(doc(db, "advances", id));
      return { id, data: snap.exists() ? snap.data() : null };
    }),
  );
  for (const { id, data } of docs) {
    if (!data) continue;
    const amount = (Array.isArray(data.payments) ? data.payments : [])
      .filter((p) => p.payrollId === payrollId)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    out.set(id, {
      advanceId: id,
      kind: isBono(data) ? "bono" : "anticipo",
      date: data.date || "",
      amount,
    });
  }
  return out;
}

// Fija cuánto le descuenta UNA nómina a cada anticipo/bono, sin tocar lo que le
// aplicaron otras nóminas. `targets`: [{ advanceId, amount }] con el monto
// FINAL de esta nómina; 0 la suelta entera, igual que
// `restoreAdvancesFromPayroll`.
//
// La entrada de esta nómina en `payments[]` se reescribe en su lugar y
// conserva su `paidAt`, de donde sale el hint "última cuota hace N días".
// Topea contra el saldo que dejan las OTRAS nóminas.
export async function setPayrollAdvanceAmounts(payrollId, targets) {
  const list = (targets || []).filter((t) => t && t.advanceId);
  if (!list.length) return { cambios: [] };
  const docs = await Promise.all(
    list.map(async (t) => {
      const snap = await getDoc(doc(db, "advances", t.advanceId));
      return { t, data: snap.exists() ? snap.data() : null };
    }),
  );

  const cambios = [];
  const now = new Date().toISOString();
  const chunkSize = 450;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    let escrituras = 0;
    for (const { t, data } of docs.slice(i, i + chunkSize)) {
      if (!data) continue;
      const total = Number(data.amount) || 0;
      const payments = Array.isArray(data.payments) ? data.payments : [];
      const deOtras = payments
        .filter((p) => p.payrollId !== payrollId)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const antes = payments
        .filter((p) => p.payrollId === payrollId)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const pedido = Math.max(0, Math.round(Number(t.amount) || 0));
      const despues = Math.min(pedido, Math.max(0, total - deOtras));
      if (despues === antes) continue;

      // Reescribe en su lugar la primera entrada de esta nómina y descarta el
      // resto (agregar ciclos o recalcular pueden haberle sumado más de una).
      let usada = false;
      const nuevos = [];
      for (const p of payments) {
        if (p.payrollId !== payrollId) {
          nuevos.push(p);
          continue;
        }
        if (usada || despues <= 0) continue;
        nuevos.push({ ...p, amount: despues });
        usada = true;
      }
      if (!usada && despues > 0) nuevos.push({ payrollId, amount: despues, paidAt: now });

      const newPaid = nuevos.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const status = newPaid >= total && total > 0 ? "applied" : newPaid > 0 ? "partial" : "pending";
      // Mismo criterio que `restoreAdvancesFromPayroll` para el puntero: si
      // esta nómina sigue descontando algo, el puntero no cambia.
      const appliedPayrollId =
        status === "pending"
          ? null
          : despues > 0
            ? data.appliedPayrollId || payrollId
            : data.appliedPayrollId === payrollId
              ? null
              : data.appliedPayrollId;
      batch.update(doc(db, "advances", t.advanceId), {
        status,
        amountPaid: newPaid,
        payments: nuevos,
        appliedPayrollId,
        appliedAt: status === "pending" ? null : data.appliedAt || serverTimestamp(),
      });
      escrituras += 1;
      cambios.push({ advanceId: t.advanceId, antes, despues });
    }
    if (escrituras) await batch.commit();
  }

  if (cambios.length) {
    advancesService.invalidate();
    await logAction({
      action: "update",
      entity: "payroll",
      entityId: payrollId,
      changes: null,
      meta: { op: "setPayrollAdvances", cambios },
    });
  }
  return { cambios };
}
