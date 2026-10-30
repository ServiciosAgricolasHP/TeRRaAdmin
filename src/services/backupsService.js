import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { enqueueFunctionJob, waitForFunctionJob } from "./functionJobsService";

// Respaldos en JSON de la base (`functions/backup.js`). La ficha de cada uno
// vive en `backups` y el archivo en Cloud Storage; generarlos y bajarlos pasa
// por la cola de jobs del backend.

const BACKUPS = "backups";

// Cuántos guarda el backend: al generar uno nuevo se borra el más antiguo.
export const KEEP_BACKUPS = 12;

// Un respaldo lee la base entera y puede tardar unos minutos.
const BACKUP_TIMEOUT_MS = 10 * 60_000;

// Los respaldos guardados, del más nuevo al más antiguo. Una lectura por
// respaldo.
export async function listBackups() {
  const snap = await getDocs(query(collection(db, BACKUPS), orderBy("createdAt", "desc"), limit(KEEP_BACKUPS)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Pide un respaldo ahora. `onProgress` recibe { step, total, collection, docs }
// al terminar cada colección.
export async function requestBackup(user, { onProgress } = {}) {
  const ref = await enqueueFunctionJob("backup", null, user);
  return waitForFunctionJob(ref, { timeoutMs: BACKUP_TIMEOUT_MS, onProgress });
}

// Pide el enlace para bajar un respaldo; vence en 15 minutos.
export async function requestBackupLink(backupId, user) {
  const ref = await enqueueFunctionJob("backupDownloadUrl", { backupId }, user);
  return waitForFunctionJob(ref);
}
