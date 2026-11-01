import {
  collection,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import {
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "./readMeter";
import { db, auth } from "../firebase";
import { logAction } from "./logger";
import { removeListItem } from "./cache";
import { FORTNIGHTS, PAYMENTS, TRIPS, listFortnights, listTransportPayments, listTrips } from "./transportLists";
import { localIsoDate } from "../utils/dates";
import { millisOf } from "../utils/syncedList";
import { toTitleName, unshout } from "../utils/textCase";

// Las listas salen de las copias sincronizadas (services/transportLists.js),
// puestas al día cada vez que se piden: con la copia al día cuesta unas pocas
// lecturas, y lo que muestran es lo que hay en el servidor. Cada lista es un
// arreglo nuevo, que la pantalla puede ordenar sin tocar la copia.
const FRESH = { fresh: true };

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
    notes: data.notes ? unshout(String(data.notes).trim()) : "",
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
  // Un resumen pendiente que se quedó sin vueltas no tiene nada que cobrar: se
  // elimina y sale de su quincena (que también se elimina si queda vacía). Si
  // tiene abonos se conserva, porque esos pagos ya se hicieron.
  if (prunes && alive.length === 0 && !(data.abonos || []).length) {
    await deleteDoc(doc(db, PAYMENTS, paymentId));
    removeListItem(PAYMENTS, paymentId);
    await logAction({
      action: "delete",
      entity: "transportPayment",
      entityId: paymentId,
      before: data,
      meta: carrierMeta(data.carrierId, { auto: "emptySummary" }),
    });
    await recalcFortnightTotal(data.payrollId, { pruneMissingPayments: true, dropIfEmpty: true });
    return 0;
  }
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
  await recalcFortnightTotal(data.payrollId);
  return total;
}

// Suma los totales de los resúmenes de la quincena y persiste el total.
// recalcPaymentTotal lo llama cada vez que cambia el total de un resumen, así
// la tarjeta de la quincena sigue al resumen.
//
// `pruneMissingPayments` saca de `paymentIds` los resúmenes que ya no existen,
// y `dropIfEmpty` elimina la quincena pendiente si se quedó sin ninguno. Los
// usan los caminos que borran un resumen.
async function recalcFortnightTotal(payrollId, { pruneMissingPayments = false, dropIfEmpty = false } = {}) {
  if (!payrollId) return null;
  const snap = await getDoc(doc(db, FORTNIGHTS, payrollId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.status === "paid") return null;
  const paymentIds = data.paymentIds || [];
  const paySnaps = await Promise.all(paymentIds.map((id) => getDoc(doc(db, PAYMENTS, id))));
  const alive = paymentIds.filter((_, i) => paySnaps[i].exists());
  if (dropIfEmpty && alive.length === 0) {
    await deleteDoc(doc(db, FORTNIGHTS, payrollId));
    removeListItem(FORTNIGHTS, payrollId);
    await logAction({
      action: "delete",
      entity: "transportPayroll",
      entityId: payrollId,
      before: data,
      meta: { auto: "emptyPayroll" },
    });
    return 0;
  }
  const total = paySnaps.reduce((acc, d) => acc + (d.exists() ? Number(d.data().total) || 0 : 0), 0);
  const prunes = pruneMissingPayments && alive.length !== paymentIds.length;
  if (total === (Number(data.total) || 0) && !prunes) return total;
  const patch = { total, ...stamp() };
  if (prunes) patch.paymentIds = alive;
  await updateDoc(doc(db, FORTNIGHTS, payrollId), patch);
  await logAction({
    action: "update",
    entity: "transportPayroll",
    entityId: payrollId,
    before: { total: Number(data.total) || 0, paymentIds },
    after: { total, paymentIds: prunes ? alive : paymentIds },
    meta: { auto: "recalcTotal" },
  });
  return total;
}

export const tripsService = {
  // Directo, sin la copia: lo usa la grilla del ciclo, que no necesita las
  // demás vueltas.
  async listByCycle(cycleId) {
    const q = query(collection(db, TRIPS), where("cycleId", "==", cycleId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async listByCarrier(carrierId, { onlyPending = false } = {}) {
    return (await listTrips(FRESH)).filter(
      (t) => t.carrierId === carrierId && (!onlyPending || t.status === "pending"),
    );
  },

  async listAll() {
    return [...(await listTrips(FRESH))];
  },

  // Desde una fecha (YYYY-MM-DD) y, opcionalmente, con un estado. Como en una
  // consulta de Firestore, una vuelta sin fecha queda afuera.
  async listSince(sinceDate, { status } = {}) {
    const since = String(sinceDate || "");
    return (await listTrips(FRESH)).filter(
      (t) => typeof t.date === "string" && t.date >= since && (!status || t.status === status),
    );
  },

  // Vueltas pendientes que no están en ningún resumen (sin `paymentId`, o
  // sin el campo).
  async listPendingUnlinked() {
    return (await this.listPending()).filter((t) => !t.paymentId);
  },

  // Todas las vueltas pendientes, estén o no en un resumen.
  async listPending() {
    return (await listTrips(FRESH)).filter((t) => t.status === "pending");
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
    removeListItem(TRIPS, id);
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
    return (await listTransportPayments(FRESH)).filter((p) => p.carrierId === carrierId);
  },

  async listAll() {
    return [...(await listTransportPayments(FRESH))];
  },

  // Resúmenes creados desde `sinceDate` (filtra por createdAt; uno sin
  // createdAt queda afuera).
  async listSince(sinceDate) {
    const since = (sinceDate instanceof Date ? sinceDate : new Date(sinceDate)).getTime();
    return (await listTransportPayments(FRESH)).filter((p) => p.createdAt && millisOf(p.createdAt) >= since);
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
      notes: unshout(notes),
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
    await recalcFortnightTotal(before.payrollId);
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
      notes: unshout(String(notes || "").trim()),
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

  // Corrige un abono ya cargado: monto, fecha o nota. Conserva su `id` y su
  // `createdAt`/`createdBy`, y registra quién lo editó. Mismas reglas que al
  // cargarlo: el resumen no puede estar pagado y el monto va mayor a 0.
  async updateAbono(paymentId, abonoId, { amount, date, notes }) {
    const before = await this.getById(paymentId);
    if (!before) throw new Error("Resumen no encontrado");
    if (before.status === "paid") throw new Error("Resumen pagado — revierte el pago antes de modificar abonos");
    const current = (before.abonos || []).find((a) => a.id === abonoId);
    if (!current) throw new Error("Abono no encontrado");
    const amt = amount !== undefined ? Number(amount) || 0 : Number(current.amount) || 0;
    if (amt <= 0) throw new Error("El monto del abono debe ser mayor a 0");
    const edited = {
      ...current,
      amount: amt,
      date: date !== undefined ? date || current.date : current.date,
      notes: notes !== undefined ? unshout(String(notes || "").trim()) : current.notes || "",
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid || null,
    };
    const abonos = (before.abonos || []).map((a) => (a.id === abonoId ? edited : a));
    await updateDoc(doc(db, PAYMENTS, paymentId), { abonos, ...stamp() });
    await logAction({
      action: "update",
      entity: "transportPayment",
      entityId: paymentId,
      before,
      after: { ...before, abonos },
      meta: carrierMeta(before.carrierId, { editedAbonoId: abonoId }),
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
    await recalcFortnightTotal(before.payrollId);
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
    removeListItem(PAYMENTS, paymentId);
    // Sale de su quincena, que se elimina si queda vacía.
    await recalcFortnightTotal(before.payrollId, { pruneMissingPayments: true, dropIfEmpty: true });
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

export const fortnightsService = {
  async listAll() {
    return [...(await listFortnights(FRESH))];
  },

  // Las quincenas sin pagar.
  async listOpen() {
    return (await listFortnights(FRESH)).filter((q) => q.status === "pending");
  },

  async getById(id) {
    const s = await getDoc(doc(db, FORTNIGHTS, id));
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
      // Nombre como título ("Quincena 16-31 de Octubre"), ver utils/textCase.js.
      name: toTitleName(name),
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      paymentIds: [...paymentIds],
      total,
      status: "pending",
      paidAt: null,
      paidBy: null,
      notes: unshout(String(notes || "").trim()),
      ...withCreate(),
    };
    const ref = await addDoc(collection(db, FORTNIGHTS), payload);
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
    if (name != null) patch.name = toTitleName(name);
    if (periodFrom !== undefined) patch.periodFrom = periodFrom || null;
    if (periodTo !== undefined) patch.periodTo = periodTo || null;
    if (notes !== undefined) patch.notes = unshout(String(notes || "").trim());
    await updateDoc(doc(db, FORTNIGHTS, id), patch);
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
    batch.update(doc(db, FORTNIGHTS, id), { paymentIds: newIds, total, ...stamp() });
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
    batch.update(doc(db, FORTNIGHTS, id), { paymentIds: newIds, total, ...stamp() });
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
    batch.delete(doc(db, FORTNIGHTS, id));
    await batch.commit();
    removeListItem(FORTNIGHTS, id);
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
    await updateDoc(doc(db, FORTNIGHTS, id), {
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
    await updateDoc(doc(db, FORTNIGHTS, id), {
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
