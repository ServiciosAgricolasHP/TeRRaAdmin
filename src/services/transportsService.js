import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { logAction } from "./logger";
import { localIsoDate } from "../utils/dates";

const TRIPS = "transports";
const PAYMENTS = "transportPayments";
const PAYROLLS = "transportPayrolls";

export const TRIP_KINDS = [
  { value: "regular", label: "Vuelta" },
  { value: "approach", label: "Acercamiento" },
];

export const tripKindLabel = (k) =>
  TRIP_KINDS.find((x) => x.value === k)?.label || k;

const stamp = () => ({
  updatedAt: serverTimestamp(),
  updatedBy: auth.currentUser?.uid || null,
});

const withCreate = () => ({
  createdAt: serverTimestamp(),
  createdBy: auth.currentUser?.uid || null,
  ...stamp(),
});

// ============================================================
// VUELTAS
// ============================================================

// Normaliza un lugar/destino a formato de nombre propio (ej. "los lagos" o
// "LOS LAGOS" → "Los Lagos"), para que un mismo lugar no aparezca con varias
// grafías en los informes. Se exporta para normalizar también en pantalla los
// registros guardados sin normalizar.
export function titleCase(str) {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s/-])([a-záéíóúñü])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function normalizeTrip(data) {
  const qty = Number(data.qty) || 1;
  const rate = Number(data.rate) || 0;
  const personCount = data.personCount === "" || data.personCount == null ? null : Number(data.personCount) || 0;
  return {
    carrierId: data.carrierId,
    vehicleAlias: String(data.vehicleAlias || "").trim(),
    cycleId: data.cycleId,
    faenaId: data.faenaId || null,
    subfaenaId: data.subfaenaId || null,
    date: data.date,
    kind: data.kind === "approach" ? "approach" : "regular",
    qty,
    rate,
    amount: qty * rate,
    lugar: titleCase(data.lugar),
    destino: titleCase(data.destino),
    personCount,
    notes: data.notes ? String(data.notes).trim() : "",
    status: data.status || "pending",
    paymentId: data.paymentId || null,
  };
}

// Copia el transportista al `meta` del log de auditoría, para buscar todo lo
// que les pasó a sus vueltas y resúmenes: un log de `update` solo guarda el
// diff (ver logger.js) y el `entityId` es el de la vuelta, no el del
// transportista. Mismo patrón que `extractRefMeta` en firestoreBase.js
// (workerRut/cycleId). Lo consume Audit.jsx → EntitySearchPanel al elegir un
// transportista.
const carrierMeta = (carrierId, extra = null) =>
  carrierId ? { carrierId, ...(extra || {}) } : extra;

// ============================================================
// TOTALES DERIVADOS (resumen ← vueltas, quincena ← resúmenes)
// ============================================================
//
// `transportPayments.total` y `transportPayrolls.total` son denormalizaciones:
// el detalle imprimible suma las vueltas en vivo, pero el balance de quincenas
// y la tarjeta de la quincena leen estos campos. Si cambia el `amount` de una
// vuelta (o la vuelta se borra) y nadie los refresca, las dos vistas muestran
// montos distintos para el mismo transportista.
//
// El recálculo vive en el servicio y no en las pantallas: todo camino que
// edita una vuelta pasa por acá, que ya propaga.

// Suma los amounts reales de las vueltas del resumen y persiste el total.
// `pruneMissingTrips` además saca del array los IDs que ya no existen (vueltas
// borradas por separado). Un resumen pagado está congelado: no se toca.
// Propaga siempre hacia la quincena que lo contenga.
async function recalcPaymentTotal(paymentId, { pruneMissingTrips = false } = {}) {
  if (!paymentId) return null;
  const snap = await getDoc(doc(db, PAYMENTS, paymentId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.status === "paid") return null;
  const tripIds = data.tripIds || [];
  const tripSnaps = await Promise.all(tripIds.map((id) => getDoc(doc(db, TRIPS, id))));
  let total = 0;
  const alive = [];
  tripSnaps.forEach((t, i) => {
    if (!t.exists()) return;
    total += Number(t.data().amount) || 0;
    alive.push(tripIds[i]);
  });
  const prunes = pruneMissingTrips && alive.length !== tripIds.length;
  // Sin cambio real no se escribe nada, ni el documento ni el log de auditoría.
  if (total === (Number(data.total) || 0) && !prunes) return total;
  const patch = { total, ...stamp() };
  if (prunes) patch.tripIds = alive;
  await updateDoc(doc(db, PAYMENTS, paymentId), patch);
  // El recálculo mueve plata sin que nadie lo haya pedido explícitamente:
  // queda registrado como update automático para poder rastrearlo después.
  await logAction({
    action: "update",
    entity: "transportPayment",
    entityId: paymentId,
    before: { total: Number(data.total) || 0, tripIds },
    after: { total, tripIds: prunes ? alive : tripIds },
    meta: carrierMeta(data.carrierId, { auto: "recalcTotal" }),
  });
  await recalcPayrollTotal(data.payrollId);
  return total;
}

// Suma los totales de los resúmenes de la quincena y persiste el total.
// recalcPaymentTotal lo llama cada vez que cambia el total de un resumen, así
// la tarjeta de la quincena sigue al resumen.
async function recalcPayrollTotal(payrollId) {
  if (!payrollId) return null;
  const snap = await getDoc(doc(db, PAYROLLS, payrollId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.status === "paid") return null;
  const paymentIds = data.paymentIds || [];
  const paySnaps = await Promise.all(paymentIds.map((id) => getDoc(doc(db, PAYMENTS, id))));
  const total = paySnaps.reduce((acc, d) => acc + (d.exists() ? Number(d.data().total) || 0 : 0), 0);
  if (total === (Number(data.total) || 0)) return total;
  await updateDoc(doc(db, PAYROLLS, payrollId), { total, ...stamp() });
  await logAction({
    action: "update",
    entity: "transportPayroll",
    entityId: payrollId,
    before: { total: Number(data.total) || 0 },
    after: { total },
    meta: { auto: "recalcTotal" },
  });
  return total;
}

export const tripsService = {
  async listByCycle(cycleId) {
    const q = query(collection(db, TRIPS), where("cycleId", "==", cycleId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Con `onlyPending`, el filtro de estado va en la consulta.
  async listByCarrier(carrierId, { onlyPending = false } = {}) {
    const parts = [where("carrierId", "==", carrierId)];
    if (onlyPending) parts.push(where("status", "==", "pending"));
    const q = query(collection(db, TRIPS), ...parts);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Lee la colección entera, que crece sin límite. En pantallas conviene
  // listSince(), acotada por fecha.
  async listAll() {
    const snap = await getDocs(collection(db, TRIPS));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Filtra en el servidor por fecha (YYYY-MM-DD) y, opcionalmente, por estado.
  async listSince(sinceDate, { status } = {}) {
    const parts = [where("date", ">=", String(sinceDate || ""))];
    if (status) parts.push(where("status", "==", status));
    const q = query(collection(db, TRIPS), ...parts);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Vueltas pendientes que no están en ningún resumen. El filtro por
  // `paymentId` vacío va en JS: una consulta de Firestore no encuentra los
  // documentos a los que les falta el campo.
  async listPendingUnlinked() {
    const q = query(collection(db, TRIPS), where("status", "==", "pending"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => !t.paymentId);
  },

  async getById(id) {
    const snap = await getDoc(doc(db, TRIPS, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async create(data) {
    const payload = { ...normalizeTrip(data), ...withCreate() };
    const ref = await addDoc(collection(db, TRIPS), payload);
    // Normalmente nace suelta (paymentId null) y esto es un no-op.
    await recalcPaymentTotal(payload.paymentId);
    await logAction({ action: "create", entity: "transport", entityId: ref.id, after: payload, meta: carrierMeta(payload.carrierId) });
    return { id: ref.id, ...payload };
  },

  async update(id, data) {
    const before = (await getDoc(doc(db, TRIPS, id))).data();
    if (before?.status === "paid") throw new Error("No se puede editar una vuelta pagada");
    const payload = { ...normalizeTrip({ ...before, ...data }), ...stamp() };
    await updateDoc(doc(db, TRIPS, id), payload);
    // qty/rate cambian el amount, así que se refresca el total del resumen que
    // la contiene. Los dos IDs cubren una vuelta que cambió de resumen en el
    // mismo guardado.
    for (const pid of new Set([before?.paymentId, payload.paymentId].filter(Boolean))) {
      await recalcPaymentTotal(pid);
    }
    await logAction({ action: "update", entity: "transport", entityId: id, before, after: payload, meta: carrierMeta(payload.carrierId) });
    return { id, ...payload };
  },

  async remove(id) {
    const before = (await getDoc(doc(db, TRIPS, id))).data();
    if (before?.status === "paid") throw new Error("No se puede eliminar una vuelta pagada");
    await deleteDoc(doc(db, TRIPS, id));
    // Además del total hay que sacar el ID del array: si queda colgado, el
    // conteo de vueltas del resumen miente y markPaid/deleteSummary tienen que
    // filtrarlo a mano (ver filterExistingTripIds).
    await recalcPaymentTotal(before?.paymentId, { pruneMissingTrips: true });
    await logAction({ action: "delete", entity: "transport", entityId: id, before, meta: carrierMeta(before?.carrierId) });
  },
};

// ============================================================
// RESÚMENES (transportPayments)
// ============================================================

// Filtra una lista de tripIds y devuelve solo los que existen actualmente
// en Firestore. Necesario porque un resumen pending puede tener referencias
// a vueltas que el usuario borró después (las pending son borrables) — si
// el batch luego intenta `.update()` esos IDs falla con "No document to
// update" y aborta toda la operación.
async function filterExistingTripIds(tripIds) {
  if (!tripIds || tripIds.length === 0) return [];
  const snaps = await Promise.all(tripIds.map((id) => getDoc(doc(db, TRIPS, id))));
  return tripIds.filter((_, i) => snaps[i].exists());
}

export const paymentsService = {
  async listByCarrier(carrierId) {
    const q = query(collection(db, PAYMENTS), where("carrierId", "==", carrierId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async listAll() {
    const snap = await getDocs(collection(db, PAYMENTS));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Resúmenes creados desde `sinceDate` (filtra por createdAt).
  async listSince(sinceDate) {
    const ts = sinceDate instanceof Date ? sinceDate : new Date(sinceDate);
    const q = query(collection(db, PAYMENTS), where("createdAt", ">=", ts));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async getById(id) {
    const s = await getDoc(doc(db, PAYMENTS, id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  },

  // Arma un resumen pendiente con las vueltas pendientes y sueltas del
  // transportista en el período. Devuelve { trips, total } sin guardar nada.
  async previewSummary({ carrierId, periodFrom, periodTo }) {
    const trips = (await tripsService.listByCarrier(carrierId, { onlyPending: true }))
      .filter((t) => !t.paymentId)
      .filter((t) => (!periodFrom || t.date >= periodFrom) && (!periodTo || t.date <= periodTo))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const total = trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return { trips, total };
  },

  // Guarda un resumen pendiente con las vueltas dadas.
  async createSummary({ carrierId, periodFrom, periodTo, groupBy = "day", tripIds, total, notes = "" }) {
    const payload = {
      carrierId,
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      groupBy,
      tripIds: [...tripIds],
      total: Number(total) || 0,
      status: "pending",
      paidAt: null,
      paidBy: null,
      notes,
      ...withCreate(),
    };
    const ref = await addDoc(collection(db, PAYMENTS), payload);
    // Enlaza las vueltas al resumen.
    const batch = writeBatch(db);
    for (const tid of tripIds) {
      batch.update(doc(db, TRIPS, tid), { paymentId: ref.id, ...stamp() });
    }
    await batch.commit();
    await logAction({ action: "create", entity: "transportPayment", entityId: ref.id, after: payload, meta: carrierMeta(carrierId) });
    return { id: ref.id, ...payload };
  },

  // Agrega o quita vueltas de un resumen pendiente.
  async editSummaryTrips(paymentId, { addTripIds = [], removeTripIds = [] }) {
    const before = await this.getById(paymentId);
    if (!before) throw new Error("Resumen no encontrado");
    if (before.status !== "pending") throw new Error("Solo se pueden editar resúmenes pendientes");
    const ids = new Set(before.tripIds || []);
    for (const id of addTripIds) ids.add(id);
    for (const id of removeTripIds) ids.delete(id);
    const tripIds = [...ids];

    // Recalcula el total con los montos actuales de las vueltas.
    let total = 0;
    const tripDocs = await Promise.all(tripIds.map((id) => getDoc(doc(db, TRIPS, id))));
    for (const s of tripDocs) {
      if (s.exists()) total += Number(s.data().amount) || 0;
    }

    const batch = writeBatch(db);
    batch.update(doc(db, PAYMENTS, paymentId), { tripIds, total, ...stamp() });
    for (const id of addTripIds) batch.update(doc(db, TRIPS, id), { paymentId, ...stamp() });
    for (const id of removeTripIds) batch.update(doc(db, TRIPS, id), { paymentId: null, ...stamp() });
    await batch.commit();
    await recalcPayrollTotal(before.payrollId);
    await logAction({
      action: "update",
      entity: "transportPayment",
      entityId: paymentId,
      before,
      after: { ...before, tripIds, total },
      meta: carrierMeta(before.carrierId),
    });
  },

  // Abonos parciales: un resumen pendiente puede tener N abonos antes de
  // marcarse 100% pagado. Cada abono lleva { id, amount, date, notes,
  // createdAt, createdBy }. El monto pendiente se calcula en cliente como
  // total - sum(abonos). Cuando el usuario marca el resumen como `paid` los
  // abonos quedan congelados; revertir el pago los deja intactos.
  async addAbono(paymentId, { amount, date, notes = "" }) {
    const before = await this.getById(paymentId);
    if (!before) throw new Error("Resumen no encontrado");
    if (before.status === "paid") throw new Error("Resumen pagado — revierte el pago antes de cargar abonos");
    const amt = Number(amount) || 0;
    if (amt <= 0) throw new Error("El monto del abono debe ser mayor a 0");
    const abono = {
      id: (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `ab_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      amount: amt,
      date: date || localIsoDate(),
      notes: String(notes || "").trim(),
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser?.uid || null,
    };
    const abonos = [...(before.abonos || []), abono];
    await updateDoc(doc(db, PAYMENTS, paymentId), { abonos, ...stamp() });
    await logAction({
      action: "update",
      entity: "transportPayment",
      entityId: paymentId,
      before,
      after: { ...before, abonos },
      meta: carrierMeta(before.carrierId, { addedAbono: abono }),
    });
    return { ...before, abonos };
  },

  async removeAbono(paymentId, abonoId) {
    const before = await this.getById(paymentId);
    if (!before) throw new Error("Resumen no encontrado");
    if (before.status === "paid") throw new Error("Resumen pagado — revierte el pago antes de modificar abonos");
    const abonos = (before.abonos || []).filter((a) => a.id !== abonoId);
    if (abonos.length === (before.abonos || []).length) {
      throw new Error("Abono no encontrado");
    }
    await updateDoc(doc(db, PAYMENTS, paymentId), { abonos, ...stamp() });
    await logAction({
      action: "update",
      entity: "transportPayment",
      entityId: paymentId,
      before,
      after: { ...before, abonos },
      meta: carrierMeta(before.carrierId, { removedAbonoId: abonoId }),
    });
    return { ...before, abonos };
  },

  // Fija el `total` del resumen con el monto recibido y lo propaga a la
  // quincena. Un resumen `paid` no se edita.
  async updateTotal(paymentId, total) {
    const before = await this.getById(paymentId);
    if (!before) throw new Error("Resumen no existe");
    if (before.status === "paid") throw new Error("Resumen pagado no editable");
    await updateDoc(doc(db, PAYMENTS, paymentId), {
      total: Number(total) || 0,
      ...stamp(),
    });
    await logAction({
      action: "update",
      entity: "transportPayment",
      entityId: paymentId,
      before,
      after: { ...before, total: Number(total) || 0 },
      meta: carrierMeta(before.carrierId),
    });
    await recalcPayrollTotal(before.payrollId);
  },

  // Elimina un resumen pendiente; sus vueltas quedan sueltas y siguen
  // pendientes. Las vueltas referenciadas que ya no existen se omiten, para que
  // el batch no aborte entero con "No document to update".
  async deleteSummary(paymentId) {
    const before = await this.getById(paymentId);
    if (!before) return;
    if (before.status !== "pending") throw new Error("Solo se pueden eliminar resúmenes pendientes");
    const tripIds = before.tripIds || [];
    const existingTripIds = await filterExistingTripIds(tripIds);
    const batch = writeBatch(db);
    for (const tid of existingTripIds) {
      batch.update(doc(db, TRIPS, tid), { paymentId: null, ...stamp() });
    }
    batch.delete(doc(db, PAYMENTS, paymentId));
    await batch.commit();
    await recalcPayrollTotal(before.payrollId);
    await logAction({ action: "delete", entity: "transportPayment", entityId: paymentId, before, meta: carrierMeta(before.carrierId) });
  },

  // Marca el resumen como pagado, junto con todas sus vueltas.
  async markPaid(paymentId) {
    const before = await this.getById(paymentId);
    if (!before) throw new Error("Resumen no encontrado");
    if (before.status === "paid") return;
    const tripIds = before.tripIds || [];
    const existingTripIds = await filterExistingTripIds(tripIds);
    const batch = writeBatch(db);
    batch.update(doc(db, PAYMENTS, paymentId), {
      status: "paid",
      paidAt: serverTimestamp(),
      paidBy: auth.currentUser?.uid || null,
      ...stamp(),
    });
    for (const tid of existingTripIds) {
      batch.update(doc(db, TRIPS, tid), { status: "paid", ...stamp() });
    }
    await batch.commit();
    await logAction({
      action: "update",
      entity: "transportPayment",
      entityId: paymentId,
      before,
      after: { ...before, status: "paid" },
      meta: carrierMeta(before.carrierId),
    });
  },

  // Devuelve un resumen pagado a pendiente, junto con sus vueltas.
  async revertPaid(paymentId) {
    const before = await this.getById(paymentId);
    if (!before) throw new Error("Resumen no encontrado");
    if (before.status !== "paid") return;
    const tripIds = before.tripIds || [];
    const existingTripIds = await filterExistingTripIds(tripIds);
    const batch = writeBatch(db);
    batch.update(doc(db, PAYMENTS, paymentId), {
      status: "pending",
      paidAt: null,
      paidBy: null,
      ...stamp(),
    });
    for (const tid of existingTripIds) {
      batch.update(doc(db, TRIPS, tid), { status: "pending", ...stamp() });
    }
    await batch.commit();
    await logAction({
      action: "update",
      entity: "transportPayment",
      entityId: paymentId,
      before,
      after: { ...before, status: "pending" },
      meta: carrierMeta(before.carrierId),
    });
  },
};

// ============================================================
// QUINCENAS (transportPayrolls: agrupan resúmenes de varios transportistas)
// ============================================================
//
// Modelo: una "quincena" es un payroll que agrupa N resúmenes de pago
// (transportPayments) existentes. Suele cubrir ~15 días, pero es solo un grupo
// lógico con nombre y rango de fechas opcional.
//
// Relación: quincena → N resúmenes → N vueltas. Cada `transportPayment` puede
// tener `payrollId` apuntando a su quincena (o null si está "suelto").
//
// Cascada de estado:
//   - markPaid(quincena) → marca todos sus resúmenes como pagados → marca
//     todas las vueltas de cada resumen como pagadas.
//   - Pagar un solo resumen (`paymentsService.markPaid`) marca ese resumen y
//     sus vueltas; la quincena sigue en pending hasta que se marque pagada.
//   - revertPaid → cascada inversa.

export const transportPayrollsService = {
  async listAll() {
    const snap = await getDocs(collection(db, PAYROLLS));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async getById(id) {
    const s = await getDoc(doc(db, PAYROLLS, id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  },

  // Crea una quincena enlazando los `paymentIds` indicados. Cada resumen
  // queda con `payrollId = <nueva quincena>`. Falla si algún resumen ya
  // pertenece a otra quincena (relación 1:N estricta).
  async create({ name, periodFrom, periodTo, paymentIds = [], notes = "" }) {
    if (!name || !String(name).trim()) throw new Error("Falta nombre de la quincena");
    // Valida que ninguno esté ya en otra quincena y suma el total.
    const payDocs = await Promise.all(paymentIds.map((pid) => getDoc(doc(db, PAYMENTS, pid))));
    let total = 0;
    for (const s of payDocs) {
      if (!s.exists()) throw new Error("Resumen referenciado no existe");
      const d = s.data();
      if (d.payrollId) throw new Error(`El resumen "${s.id}" ya está en otra quincena`);
      total += Number(d.total) || 0;
    }
    const payload = {
      name: String(name).trim(),
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      paymentIds: [...paymentIds],
      total,
      status: "pending",
      paidAt: null,
      paidBy: null,
      notes: String(notes || "").trim(),
      ...withCreate(),
    };
    const ref = await addDoc(collection(db, PAYROLLS), payload);
    const batch = writeBatch(db);
    for (const pid of paymentIds) {
      batch.update(doc(db, PAYMENTS, pid), { payrollId: ref.id, ...stamp() });
    }
    await batch.commit();
    await logAction({ action: "create", entity: "transportPayroll", entityId: ref.id, after: payload });
    return { id: ref.id, ...payload };
  },

  // Cambiar metadata (nombre/fechas/notas). No toca la lista de resúmenes
  // — para eso usar `addPayments` / `removePayments`.
  async update(id, { name, periodFrom, periodTo, notes }) {
    const before = await this.getById(id);
    if (!before) throw new Error("Quincena no encontrada");
    if (before.status === "paid") throw new Error("La quincena está pagada — revierte el pago antes de editar.");
    const patch = { ...stamp() };
    if (name != null) patch.name = String(name).trim();
    if (periodFrom !== undefined) patch.periodFrom = periodFrom || null;
    if (periodTo !== undefined) patch.periodTo = periodTo || null;
    if (notes !== undefined) patch.notes = String(notes || "").trim();
    await updateDoc(doc(db, PAYROLLS, id), patch);
    await logAction({ action: "update", entity: "transportPayroll", entityId: id, before, after: { ...before, ...patch } });
  },

  // Agregar resúmenes a una quincena pendiente. Recalcula total.
  async addPayments(id, paymentIds) {
    const before = await this.getById(id);
    if (!before) throw new Error("Quincena no encontrada");
    if (before.status === "paid") throw new Error("No se puede modificar una quincena pagada");
    const payDocs = await Promise.all(paymentIds.map((pid) => getDoc(doc(db, PAYMENTS, pid))));
    for (const s of payDocs) {
      if (!s.exists()) throw new Error("Resumen referenciado no existe");
      const d = s.data();
      if (d.payrollId && d.payrollId !== id) throw new Error(`El resumen "${s.id}" ya está en otra quincena`);
    }
    const newSet = new Set([...(before.paymentIds || []), ...paymentIds]);
    const newIds = [...newSet];
    // Recalcula el total con el set completo.
    const allDocs = await Promise.all(newIds.map((pid) => getDoc(doc(db, PAYMENTS, pid))));
    const total = allDocs.reduce((s, d) => s + (d.exists() ? (Number(d.data().total) || 0) : 0), 0);
    const batch = writeBatch(db);
    batch.update(doc(db, PAYROLLS, id), { paymentIds: newIds, total, ...stamp() });
    for (const pid of paymentIds) {
      batch.update(doc(db, PAYMENTS, pid), { payrollId: id, ...stamp() });
    }
    await batch.commit();
    await logAction({ action: "update", entity: "transportPayroll", entityId: id, before, after: { ...before, paymentIds: newIds, total } });
  },

  // Sacar resúmenes de una quincena pendiente. Los resúmenes quedan "sueltos"
  // (payrollId = null) y siguen existiendo. Recalcula total.
  async removePayments(id, paymentIds) {
    const before = await this.getById(id);
    if (!before) throw new Error("Quincena no encontrada");
    if (before.status === "paid") throw new Error("No se puede modificar una quincena pagada");
    const removeSet = new Set(paymentIds);
    const newIds = (before.paymentIds || []).filter((pid) => !removeSet.has(pid));
    const allDocs = await Promise.all(newIds.map((pid) => getDoc(doc(db, PAYMENTS, pid))));
    const total = allDocs.reduce((s, d) => s + (d.exists() ? (Number(d.data().total) || 0) : 0), 0);
    const batch = writeBatch(db);
    batch.update(doc(db, PAYROLLS, id), { paymentIds: newIds, total, ...stamp() });
    for (const pid of paymentIds) {
      batch.update(doc(db, PAYMENTS, pid), { payrollId: null, ...stamp() });
    }
    await batch.commit();
    await logAction({ action: "update", entity: "transportPayroll", entityId: id, before, after: { ...before, paymentIds: newIds, total } });
  },

  // Eliminar quincena. Los resúmenes quedan sueltos (payrollId = null) — no
  // se borran. Solo permitido si está pendiente.
  async delete(id) {
    const before = await this.getById(id);
    if (!before) return;
    if (before.status === "paid") throw new Error("Solo se pueden eliminar quincenas pendientes — revierte el pago primero.");
    const batch = writeBatch(db);
    for (const pid of before.paymentIds || []) {
      batch.update(doc(db, PAYMENTS, pid), { payrollId: null, ...stamp() });
    }
    batch.delete(doc(db, PAYROLLS, id));
    await batch.commit();
    await logAction({ action: "delete", entity: "transportPayroll", entityId: id, before });
  },

  // Cascada total: la quincena + cada resumen contenido + cada vuelta de
  // cada resumen → status="paid". Usa `paymentsService.markPaid` internamente
  // para que la cascada de payment→trips se mantenga consistente.
  async markPaid(id) {
    const before = await this.getById(id);
    if (!before) throw new Error("Quincena no encontrada");
    if (before.status === "paid") return;
    for (const pid of before.paymentIds || []) {
      const payment = await paymentsService.getById(pid);
      if (payment && payment.status !== "paid") {
        await paymentsService.markPaid(pid);
      }
    }
    await updateDoc(doc(db, PAYROLLS, id), {
      status: "paid",
      paidAt: serverTimestamp(),
      paidBy: auth.currentUser?.uid || null,
      ...stamp(),
    });
    await logAction({ action: "update", entity: "transportPayroll", entityId: id, before, after: { ...before, status: "paid" } });
  },

  // Revertir pago en cascada — vuelve a pending la quincena, sus resúmenes
  // y las vueltas de cada resumen.
  async revertPaid(id) {
    const before = await this.getById(id);
    if (!before) throw new Error("Quincena no encontrada");
    if (before.status !== "paid") return;
    for (const pid of before.paymentIds || []) {
      const payment = await paymentsService.getById(pid);
      if (payment && payment.status === "paid") {
        await paymentsService.revertPaid(pid);
      }
    }
    await updateDoc(doc(db, PAYROLLS, id), {
      status: "pending",
      paidAt: null,
      paidBy: null,
      ...stamp(),
    });
    await logAction({ action: "update", entity: "transportPayroll", entityId: id, before, after: { ...before, status: "pending" } });
  },
};

// ============================================================
// Agrupaciones
// ============================================================

export function groupTripsByDay(trips) {
  const map = new Map();
  for (const t of trips) {
    if (!map.has(t.date)) map.set(t.date, { date: t.date, trips: [], total: 0 });
    const g = map.get(t.date);
    g.trips.push(t);
    g.total += Number(t.amount) || 0;
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function groupTripsByFaena(trips) {
  const map = new Map();
  for (const t of trips) {
    const key = `${t.faenaId || "?"}__${t.subfaenaId || "?"}`;
    if (!map.has(key)) {
      map.set(key, { key, faenaId: t.faenaId, subfaenaId: t.subfaenaId, trips: [], total: 0 });
    }
    const g = map.get(key);
    g.trips.push(t);
    g.total += Number(t.amount) || 0;
  }
  return [...map.values()];
}
