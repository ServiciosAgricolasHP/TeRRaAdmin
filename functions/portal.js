// Portal de trabajadores: publica nóminas como una ficha por trabajador y por
// nómina (`portalPayslips/{rut}/payslips/{payrollId}`), más la lista de las
// publicadas (`portalMeta/current`). Se publican varias a la vez: cada una
// entra y sale por su cuenta. El portal lista solo las fichas del RUT que se
// ingresa, así que cada ficha lleva lo de esa persona y nada más: sus
// jornadas, sus anticipos y bonos, los ciclos donde trabajó y, de la cuenta,
// solo los últimos 4 dígitos.
//
// Cada ficha tiene la forma del JSON de la nómina (`payrollSnapshots`),
// recortada a un trabajador, para que el portal la dibuje igual que antes.
import { FieldValue } from "firebase-admin/firestore";

export const PAYSLIPS = "portalPayslips";
// La subcolección de cada RUT: una ficha por nómina publicada.
export const SLIPS = "payslips";
export const META = "portalMeta";
// Los RUT publicados de cada nómina (`portalIndex/{payrollId}`), para retirarla
// o volver a publicarla sin recorrer el portal entero. La app no lo lee.
export const INDEX = "portalIndex";
const PAYROLLS = "payrolls";
const SNAPSHOTS = "payrollSnapshots";
const LOGS = "logs";
const BATCH_SIZE = 400;

// Id de documento válido para un RUT normalizado.
const RUT_ID = /^[0-9A-Z]+-[0-9A-Z]$/;

// Lo que el portal muestra de un trabajador.
const WORKER_FIELDS = [
  "rut",
  "name",
  "groupLeader",
  "bankCode",
  "accountType",
  "grossAmount",
  "advance",
  "bonus",
  "amount",
  "byCycle",
  "anticipoApplications",
  "bonoApplications",
];

function codeError(code, message) {
  const err = new Error(message);
  err.functionJobCode = code;
  return err;
}

// RUT como id de documento: sin puntos ni espacios, en mayúsculas y con guion
// antes del dígito verificador. El portal lo normaliza igual antes de buscar.
export function portalRut(value) {
  const r = String(value || "").replace(/[.\s]/g, "").toUpperCase();
  if (r.length < 2) return "";
  return r.includes("-") ? r : `${r.slice(0, -1)}-${r.slice(-1)}`;
}

// Un ciclo sin sus precios por día: el portal no los muestra.
function withoutDayPrices(cycle) {
  const out = { ...cycle };
  delete out.dayPrices;
  return out;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// Las fichas de una nómina: `Map` de RUT → ficha, más la cabecera. `payroll`
// es el documento vivo de la nómina: el nombre y el estado salen de ahí, no
// del snapshot, que se escribió al generarla.
export function buildPortalPayslips(snapshot, payroll = {}) {
  const header = {
    version: snapshot.version || 1,
    payrollId: payroll.id || snapshot.payrollId || "",
    generatedAt: snapshot.generatedAt || null,
    payroll: {
      name: payroll.name || snapshot.payroll?.name || "",
      status: payroll.status || snapshot.payroll?.status || "pending",
    },
  };
  const cycles = snapshot.cycles || [];
  const workdays = snapshot.workdays || [];
  const advances = snapshot.advances || [];

  const payslips = new Map();
  for (const w of snapshot.workers || []) {
    const id = portalRut(w.rut);
    if (!RUT_ID.test(id)) continue;

    const dayIds = new Set(w.workdayIds || []);
    // Las jornadas pueden guardar un RUT anterior: se ligan por id y quedan
    // con el RUT de la ficha, que es con el que el portal las filtra.
    const ownDays = workdays
      .filter((wd) => dayIds.has(wd.id) || portalRut(wd.workerRut) === id)
      .map((wd) => ({ ...wd, workerRut: w.rut }));

    const advanceIds = new Set([
      ...(w.advanceIds || []),
      ...(w.anticipoApplications || []).map((a) => a.advanceId),
      ...(w.bonoApplications || []).map((a) => a.advanceId),
    ]);
    const ownAdvances = advances.filter((a) => advanceIds.has(a.id) || portalRut(a.workerRut) === id);

    const cycleIds = new Set([...ownDays.map((wd) => wd.cycleId), ...Object.keys(w.byCycle || {})]);
    const ownCycles = cycles.filter((c) => cycleIds.has(c.id)).map(withoutDayPrices);

    const account = String(w.accountNumber || "").trim();
    payslips.set(id, {
      ...header,
      cycles: ownCycles,
      workers: [{ ...pick(w, WORKER_FIELDS), accountNumber: account ? account.slice(-4) : "" }],
      workdays: ownDays,
      advances: ownAdvances,
    });
  }
  return { header: { ...header, workerCount: payslips.size }, payslips };
}

async function inBatches(db, items, apply) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(i, i + BATCH_SIZE)) apply(batch, item);
    await batch.commit();
  }
}

const slipRef = (db, rut, payrollId) => db.collection(PAYSLIPS).doc(rut).collection(SLIPS).doc(payrollId);

// La entrada de una nómina en la lista de publicadas.
function publishedEntryOf(header, publishedAt) {
  return {
    payrollId: header.payrollId,
    name: header.payroll.name,
    status: header.payroll.status,
    generatedAt: header.generatedAt,
    workerCount: header.workerCount,
    publishedAt,
  };
}

// Las publicadas, de la más nueva a la más vieja: por cuándo se generó y, si
// falta, por cuándo se publicó.
export function sortPublished(list) {
  const keyOf = (p) => String(p.generatedAt || p.publishedAt || "");
  return [...list].sort((a, b) => keyOf(b).localeCompare(keyOf(a)));
}

// La lista de nóminas publicadas. Si `portalMeta/current` todavía tiene la
// forma de una sola nómina (`payrollId` en la cabecera, fichas sueltas en
// `portalPayslips/{rut}`), primero pasa esas fichas a la subcolección, deja la
// lista con esa nómina y borra las fichas sueltas.
async function readPublished(db, metaRef) {
  const meta = (await metaRef.get()).data() || null;
  if (Array.isArray(meta?.payrolls)) return meta.payrolls;

  const loose = (await db.collection(PAYSLIPS).get()).docs;
  const own = meta?.payrollId ? loose.filter((d) => d.data().payrollId === meta.payrollId) : [];
  const published = [];
  if (own.length) {
    await inBatches(db, own, (batch, d) => batch.set(slipRef(db, d.id, meta.payrollId), d.data()));
    await db
      .collection(INDEX)
      .doc(meta.payrollId)
      .set({ payrollId: meta.payrollId, ruts: own.map((d) => d.id), publishedAt: meta.publishedAt || null });
    const header = {
      payrollId: meta.payrollId,
      payroll: { name: meta.payroll?.name || "", status: meta.payroll?.status || "pending" },
      generatedAt: meta.generatedAt || null,
      workerCount: own.length,
    };
    published.push(publishedEntryOf(header, meta.publishedAt || null));
  }
  await metaRef.set({ version: 2, payrolls: published, updatedAt: new Date().toISOString(), updatedBy: meta?.publishedBy || null });
  await inBatches(db, loose, (batch, d) => batch.delete(d.ref));
  return published;
}

async function writeLog(db, { requestedBy, requestedByEmail, before, after, meta }) {
  await db.collection(LOGS).add({
    uid: requestedBy,
    email: requestedByEmail,
    action: "update",
    entity: "portalMeta",
    entityId: "current",
    changes: { publishedPayrollIds: { from: before.map((p) => p.payrollId), to: after.map((p) => p.payrollId) } },
    before: null,
    after: null,
    meta,
    timestamp: FieldValue.serverTimestamp(),
  });
}

// Publica la nómina `payrollId`, o la actualiza si ya estaba: escribe sus
// fichas, después su índice y la lista de publicadas, y al final borra las
// fichas de esa nómina de quienes ya no están en ella. Las demás publicadas no
// se tocan. El portal muestra solo las fichas de las nóminas de la lista.
export async function publishPortal(db, { payrollId, requestedBy = null, requestedByEmail = null, functionJobId = null }) {
  const payrollSnap = await db.collection(PAYROLLS).doc(payrollId).get();
  if (!payrollSnap.exists) throw codeError("not-found", "La nómina no existe.");
  const payroll = { id: payrollId, ...payrollSnap.data() };

  const snapshotSnap = await db.collection(SNAPSHOTS).doc(payrollId).get();
  const snapshot = snapshotSnap.exists ? snapshotSnap.data() : payroll.snapshot || null;
  if (!snapshot?.workers?.length) throw codeError("no-snapshot", "La nómina no tiene el JSON para publicar.");

  const { header, payslips } = buildPortalPayslips(snapshot, payroll);
  const publishedAt = new Date().toISOString();
  const metaRef = db.collection(META).doc("current");
  const before = await readPublished(db, metaRef);
  const indexRef = db.collection(INDEX).doc(payrollId);
  const previousRuts = (await indexRef.get()).data()?.ruts || [];

  await inBatches(db, [...payslips], (batch, [rut, data]) => batch.set(slipRef(db, rut, payrollId), { ...data, publishedAt }));
  await indexRef.set({ payrollId, ruts: [...payslips.keys()], publishedAt });
  const after = sortPublished([...before.filter((p) => p.payrollId !== payrollId), publishedEntryOf(header, publishedAt)]);
  await metaRef.set({ version: 2, payrolls: after, updatedAt: publishedAt, updatedBy: requestedBy });

  const stale = previousRuts.filter((rut) => !payslips.has(rut));
  await inBatches(db, stale, (batch, rut) => batch.delete(slipRef(db, rut, payrollId)));

  const updated = before.some((p) => p.payrollId === payrollId);
  await writeLog(db, {
    requestedBy,
    requestedByEmail,
    before,
    after,
    meta: { jobId: functionJobId, op: updated ? "updatePortal" : "publishPortal", payrollId, workerCount: payslips.size, removed: stale.length },
  });

  return { payrollId, name: header.payroll.name, published: payslips.size, removed: stale.length, updated, payrollCount: after.length };
}

// Retira la nómina `payrollId` del portal: primero la saca de la lista de
// publicadas, que es lo que el portal muestra, y después borra sus fichas y su
// índice. No necesita que la nómina exista: se puede retirar una eliminada.
export async function unpublishPortal(db, { payrollId, requestedBy = null, requestedByEmail = null, functionJobId = null }) {
  const metaRef = db.collection(META).doc("current");
  const before = await readPublished(db, metaRef);
  const indexRef = db.collection(INDEX).doc(payrollId);
  const index = (await indexRef.get()).data() || null;
  const entry = before.find((p) => p.payrollId === payrollId);
  if (!entry && !index) throw codeError("not-published", "La nómina no está publicada en el portal.");

  const after = before.filter((p) => p.payrollId !== payrollId);
  await metaRef.set({ version: 2, payrolls: after, updatedAt: new Date().toISOString(), updatedBy: requestedBy });
  const ruts = index?.ruts || [];
  await inBatches(db, ruts, (batch, rut) => batch.delete(slipRef(db, rut, payrollId)));
  await indexRef.delete();

  await writeLog(db, {
    requestedBy,
    requestedByEmail,
    before,
    after,
    meta: { jobId: functionJobId, op: "unpublishPortal", payrollId, removed: ruts.length },
  });

  return { payrollId, name: entry?.name || "", removed: ruts.length, payrollCount: after.length };
}
