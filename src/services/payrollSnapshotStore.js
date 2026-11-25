// Dónde se guarda el JSON de una nómina: la cabecera en `payrollSnapshots` y
// sus jornadas en partes, en `payrollSnapshotWorkdays` (`utils/snapshotParts.js`).
// Lee el JSON armado y lo escribe entero en un lote, con la cabecera, sus
// partes y el borrado de las que sobran, así una lectura nunca ve una cabecera
// con las partes de otra versión. Un JSON guardado entero en un documento se
// lee igual y pasa a partes la primera vez que se escribe.
import { doc, serverTimestamp } from "firebase/firestore";
import { getDoc, writeBatch } from "./readMeter";
import { db, auth } from "../firebase";
import { payrollSnapshotsService } from "./index";
import { logAction } from "./logger";
import { SNAPSHOT_WORKDAYS, isPartedSnapshot, joinSnapshot, partIdOf, splitSnapshot } from "../utils/snapshotParts";

const ENTITY = "payrollSnapshot";
const partRef = (payrollId, index) => doc(db, SNAPSHOT_WORKDAYS, partIdOf(payrollId, index));

// La cabecera guardada, sin el `id` del documento, y las jornadas de cada
// parte. `null` si la nómina no tiene JSON. Cuesta una lectura más una por
// parte, y tira si falta una parte.
export async function readStoredDocs(payrollId) {
  const found = await payrollSnapshotsService.getById(payrollId);
  if (!found) return null;
  const { id: _id, ...header } = found;
  if (!isPartedSnapshot(header)) return { header, parts: null };
  const docs = await Promise.all(Array.from({ length: header.workdayParts }, (_, i) => getDoc(partRef(payrollId, i))));
  const missing = docs.filter((d) => !d.exists()).length;
  if (missing) throw new Error(`Al JSON de la nómina le faltan ${missing} de sus ${docs.length} partes de jornadas`);
  return { header, parts: docs.map((d) => d.data().workdays || []) };
}

// El JSON armado y cuántas partes tiene guardadas (`null` si está entero en
// un documento), o `null` si la nómina no tiene JSON.
export async function readStored(payrollId) {
  const stored = await readStoredDocs(payrollId);
  if (!stored) return null;
  return {
    snapshot: joinSnapshot(stored.header, stored.parts || []),
    partCount: stored.parts ? stored.parts.length : null,
  };
}

// Guarda `snapshot`, el JSON armado, en un lote. `previous` es lo que devolvió
// `readStored` (o `null` si no había JSON): decide si se crea, y qué partes
// sobran. Si las jornadas son las mismas que se leyeron (la misma lista), solo
// escribe la cabecera. Deja un registro, con las listas resumidas.
export async function writeStored(payrollId, snapshot, previous = null) {
  const uid = auth.currentUser?.uid || null;
  const stamps = previous
    ? { updatedAt: serverTimestamp(), updatedBy: uid }
    : { createdAt: serverTimestamp(), createdBy: uid, updatedAt: serverTimestamp(), updatedBy: uid };
  const sameDays = previous?.partCount != null && snapshot.workdays === previous.snapshot.workdays;
  const { header, parts } = splitSnapshot(snapshot);
  const batch = writeBatch(db);
  if (sameDays) {
    batch.set(payrollSnapshotsService.ref(payrollId), { ...header, workdayParts: previous.partCount, ...stamps });
  } else {
    batch.set(payrollSnapshotsService.ref(payrollId), { ...header, ...stamps });
    parts.forEach((workdays, index) => batch.set(partRef(payrollId, index), { payrollId, index, workdays }));
    for (let i = parts.length; i < (previous?.partCount || 0); i += 1) batch.delete(partRef(payrollId, i));
  }
  await batch.commit();
  payrollSnapshotsService.invalidate();
  const meta = { workdays: (snapshot.workdays || []).length, workdayParts: sameDays ? previous.partCount : parts.length };
  if (previous) {
    await logAction({ action: "update", entity: ENTITY, entityId: payrollId, before: previous.snapshot, after: snapshot, meta });
  } else {
    await logAction({ action: "create", entity: ENTITY, entityId: payrollId, after: header, meta });
  }
}

// Borra el JSON de una nómina con sus partes, en un lote. Devuelve si había
// JSON.
export async function removeStored(payrollId) {
  const found = await payrollSnapshotsService.getById(payrollId);
  if (!found) return false;
  const { id: _id, ...header } = found;
  const partCount = isPartedSnapshot(header) ? header.workdayParts : 0;
  const batch = writeBatch(db);
  batch.delete(payrollSnapshotsService.ref(payrollId));
  for (let i = 0; i < partCount; i += 1) batch.delete(partRef(payrollId, i));
  await batch.commit();
  payrollSnapshotsService.invalidate();
  await logAction({ action: "delete", entity: ENTITY, entityId: payrollId, before: header, meta: { workdayParts: partCount } });
  return true;
}
