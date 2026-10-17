// Portal de trabajadores: publica una nómina como una ficha por trabajador
// (`portalPayslips/{rut}`) más la cabecera de la nómina (`portalMeta/current`).
// El portal lee solo la ficha del RUT que se ingresa, así que cada ficha lleva
// lo de esa persona y nada más: sus jornadas, sus anticipos y bonos, los
// ciclos donde trabajó y, de la cuenta, solo los últimos 4 dígitos.
//
// Cada ficha tiene la forma del JSON de la nómina (`payrollSnapshots`),
// recortada a un trabajador, para que el portal la dibuje igual que antes.
import { FieldValue } from "firebase-admin/firestore";

export const PAYSLIPS = "portalPayslips";
export const META = "portalMeta";
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
  err.jobCode = code;
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

// Publica la nómina `payrollId`: escribe sus fichas, después la cabecera y al
// final borra las fichas de quienes no están en ella. Mientras tanto, una
// ficha vieja no se muestra porque su `payrollId` no calza con la cabecera.
export async function publishPortal(db, { payrollId, requestedBy = null, requestedByEmail = null, jobId = null }) {
  const payrollSnap = await db.collection(PAYROLLS).doc(payrollId).get();
  if (!payrollSnap.exists) throw codeError("not-found", "La nómina no existe.");
  const payroll = { id: payrollId, ...payrollSnap.data() };

  const snapshotSnap = await db.collection(SNAPSHOTS).doc(payrollId).get();
  const snapshot = snapshotSnap.exists ? snapshotSnap.data() : payroll.snapshot || null;
  if (!snapshot?.workers?.length) throw codeError("no-snapshot", "La nómina no tiene el JSON para publicar.");

  const { header, payslips } = buildPortalPayslips(snapshot, payroll);
  const publishedAt = new Date().toISOString();

  await inBatches(db, [...payslips], (batch, [id, data]) => batch.set(db.collection(PAYSLIPS).doc(id), { ...data, publishedAt }));

  const metaRef = db.collection(META).doc("current");
  const previous = (await metaRef.get()).data() || null;
  await metaRef.set({ ...header, publishedAt, publishedBy: requestedBy });

  const existing = await db.collection(PAYSLIPS).select().get();
  const stale = existing.docs.filter((d) => !payslips.has(d.id));
  await inBatches(db, stale, (batch, d) => batch.delete(d.ref));

  await db.collection(LOGS).add({
    uid: requestedBy,
    email: requestedByEmail,
    action: "update",
    entity: "portalMeta",
    entityId: "current",
    changes: { payrollId: { from: previous?.payrollId || null, to: payrollId } },
    before: null,
    after: null,
    meta: { jobId, payrollId, workerCount: payslips.size, removed: stale.length },
    timestamp: FieldValue.serverTimestamp(),
  });

  return { payrollId, name: header.payroll.name, published: payslips.size, removed: stale.length };
}
