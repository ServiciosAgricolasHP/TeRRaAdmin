import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { workersService, workdaysService } from "./index";
import { cacheKey, getCache, setCache, subscribe } from "./cache";
import { normalizeRut, validateRut } from "../utils/rutUtils";
import { toProperName } from "../utils/nameUtils";
import { localIsoDate } from "../utils/dates";
import { readStoredJson, writeStoredJson } from "../utils/browserStorage";
import { applyWorkerChanges, markOf, syncMode } from "../utils/workersSync";

// Si empieza con un dígito se busca por RUT; si no, por nombre.
export function detectQueryKind(q) {
  const s = String(q || "").trim();
  if (!s) return null;
  return /^\d/.test(s) ? "rut" : "name";
}

// ── La lista completa de trabajadores ────────────────────────────────────────
// Toda pantalla que la necesita la pide con `listWorkers()`. Se guarda en el
// navegador (la caché de `list`, en memoria y en localStorage, con la misma
// clave, así las altas y ediciones hechas acá la corrigen en su lugar) y se
// pone al día con una consulta: los trabajadores con `updatedAt` desde la
// marca. La primera vez del día en cada navegador se lee entera: así entra lo
// que se escribe sin `updatedAt` (el escáner, la consola de Firebase) y sale
// quien se eliminó en otro equipo. Recargar en Nómina
// (`workersService.invalidate()`) también la relee entera.
const LIST_ORDER = ["name", "asc"];
const LIST_KEY = cacheKey("worker", { wheres: [], order: LIST_ORDER, take: undefined });
const SYNC_KEY = "workers.sync"; // { fullDate, mark }
const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
// Como máximo una puesta al día por minuto en cada pestaña.
const MIN_GAP_MS = 60 * 1000;
// La marca se toma unos minutos antes de lo último visto, por si llegan dos
// escrituras con la misma hora.
const MARGIN_MS = 5 * 60 * 1000;

let syncMeta; // undefined: sin leer de localStorage todavía
let lastSyncAt = 0;
let pendingSync = null;

// Si se borra la caché de trabajadores, la próxima vez se lee entera.
subscribe("worker", () => {
  syncMeta = null;
  lastSyncAt = 0;
  writeStoredJson(SYNC_KEY, null);
});

function saveList(data, meta, { changed }) {
  if (changed) setCache(LIST_KEY, data, { ttl: KEEP_MS, persist: true });
  syncMeta = meta;
  writeStoredJson(SYNC_KEY, meta);
  lastSyncAt = Date.now();
}

async function runSync(fresh) {
  if (syncMeta === undefined) syncMeta = readStoredJson(SYNC_KEY, null);
  const copy = getCache(LIST_KEY, { persist: true });
  const today = localIsoDate();
  const mode = syncMode({
    hasCopy: Array.isArray(copy) && !!syncMeta,
    fullDate: syncMeta?.fullDate,
    today,
    lastSyncAt,
    now: Date.now(),
    fresh,
    minGapMs: MIN_GAP_MS,
  });
  if (mode === "cached") return { data: copy, reads: 0 };

  if (mode === "full") {
    const data = await workersService.list({ order: LIST_ORDER });
    saveList(data, { fullDate: today, mark: markOf(data, "updatedAt") }, { changed: true });
    return { data, reads: Math.max(1, data.length) };
  }

  const since = Timestamp.fromMillis(Math.max(0, syncMeta.mark - MARGIN_MS));
  const snap = await getDocs(query(collection(db, "worker"), where("updatedAt", ">=", since)));
  const changed = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const data = changed.length ? applyWorkerChanges(copy, changed) : copy;
  const mark = markOf(changed, "updatedAt", syncMeta.mark);
  saveList(data, { fullDate: syncMeta.fullDate, mark }, { changed: changed.length > 0 });
  return { data, reads: Math.max(1, changed.length) };
}

// La lista y cuántas lecturas costó (0 si salió de la copia). `fresh` pone
// al día sin esperar el minuto. Las llamadas simultáneas comparten la misma.
export function syncWorkers({ fresh = false } = {}) {
  if (!pendingSync) {
    pendingSync = runSync(fresh).finally(() => {
      pendingSync = null;
    });
  }
  return pendingSync;
}

export async function listWorkers(opts) {
  return (await syncWorkers(opts)).data;
}

// El doc id es el rut con el que se creó el trabajador: se trata como
// `workerId` estable y no cambia aunque cambie el rut (Firestore no renombra
// documentos; ver docs/data-model.md). El campo `rut` es el valor legal
// ACTUAL, editable: nace igual al id y puede divergir, p. ej. si el trabajador
// pasa de un rut provisorio (cédula extranjera -B/-H) a uno definitivo. Todo
// lo que necesite identidad estable (agrupar workdays, nóminas, auditoría) usa
// el id/workerId, no `rut`.
//
// Un trabajador puede no tener el campo `rut`; AdminConsole.jsx →
// BackfillWorkerRutFieldSection lo completa.

export async function findWorkerByRut(rut) {
  const normalized = normalizeRut(rut);
  if (!normalized) return null;
  // Primero por docId, el caso más común, que cuesta una sola lectura. La
  // consulta por el campo `rut` corre solo si esa falla: el trabajador cambió
  // de rut y el actual ya no coincide con el id. Quien llama recibe el doc
  // completo; para escribir contra ese trabajador usa `.id`, no el rut buscado.
  const byId = await workersService.getById(normalized);
  if (byId) return byId;
  const [byField] = await workersService.list({ wheres: [["rut", "==", normalized]], take: 1 });
  return byField || null; // { id, rut, name, groupLeader?, idQr?, bankDetails? } o null
}

export async function createWorker({ rut, name }) {
  const normalized = normalizeRut(rut);
  if (!validateRut(normalized)) throw new Error("RUT inválido");
  const existing = await findWorkerByRut(normalized);
  if (existing) return existing;
  return workersService.create(
    { rut: normalized, name: toProperName(name) },
    { id: normalized },
  );
}

// Todos los ruts con los que un trabajador puede figurar en documentos: el
// doc id (su rut de creación, inmutable), el `rut` vigente y los intermedios
// de `rutHistory`. Un workday guarda en `workerRut` el rut que tenía el roster
// de la labor cuando se escribió, así que puede ser cualquiera de ellos.
//
// Sirve para resolver con UNA consulta `in`. También acepta un string con una
// sola clave.
export function workerKeys(worker) {
  if (!worker) return [];
  const w = typeof worker === "string" ? { id: worker } : worker;
  const claves = [w.id, w.rut, ...(w.rutHistory || [])].filter(Boolean).map(String);
  return [...new Set(claves)].slice(0, 10); // tope de claves para la consulta `in`
}

// No deja borrar a quien tiene producción cargada, con su rut actual o con
// uno anterior.
export async function deleteWorkerSafe(worker) {
  const claves = workerKeys(worker);
  if (claves.length === 0) throw new Error("Trabajador inválido");
  const id = typeof worker === "string" ? worker : worker.id;
  const conDias = await workdaysService.list({
    wheres: [["workerRut", "in", claves]],
    take: 1,
  });
  if (conDias.length) throw new Error("No se puede eliminar: el trabajador tiene días asociados");
  return workersService.remove(id);
}

export { workersService };
