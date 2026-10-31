// Registro de lecturas: toda lectura y escritura de Firestore de la app pasa
// por estas funciones, que tienen la misma firma que las de
// `firebase/firestore` (ESLint impide importarlas de allá en `src/`).
//
// Cada respuesta suma a una cuenta por hora, pantalla y forma de consulta, sin
// los valores de los filtros (utils/readMeterKeys.js). La pantalla lleva encima
// los modales marcados que estén abiertos (`useReadSection`, o la opción
// `section` de Modal): "/payroll › Detalle de nómina". También se cuentan las
// visitas, el tiempo con la pantalla visible y las escrituras, que suman la
// lectura que cobran las reglas.
//
// La cuenta se manda cada 5 minutos, y al ocultar la pestaña, a
// `readLogs/{fecha}_{uid}_{entorno}` con sumas (`increment`), sin leerlo. Antes
// del primer envío lee una vez `readLogConfig/main`: si está apagado o pasó su
// fecha, descarta la cuenta y deja de registrar en esa sesión.
//
// Fuera del navegador (los tests) y con el emulador no registra, salvo con
// `VITE_READ_METER=on` para probarlo. Nunca lanza: si algo del registro falla,
// la lectura sigue.
import {
  addDoc as fsAddDoc,
  deleteDoc as fsDeleteDoc,
  doc,
  getCountFromServer as fsGetCountFromServer,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  increment,
  onSnapshot as fsOnSnapshot,
  serverTimestamp,
  setDoc as fsSetDoc,
  Timestamp,
  updateDoc as fsUpdateDoc,
  writeBatch as fsWriteBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { localIsoDate } from "../utils/dates";
import { readStoredJson, storedKeys, writeStored, writeStoredJson } from "../utils/browserStorage";
import {
  addRead,
  addTime,
  addVisit,
  addWrite,
  billedReads,
  collectionPathOf,
  describeQuery,
  emptyBuffer,
  isEmptyBuffer,
  meterEnabled,
  mergeBuffers,
  screenOf,
  sectionKey,
  toIncrements,
} from "../utils/readMeterKeys";

export const READ_LOGS = "readLogs";
export const READ_LOG_CONFIG = "readLogConfig";
const FLUSH_MS = 5 * 60 * 1000;
const TICK_S = 15;
// Una cuenta guardada de otra pestaña sin tocar hace más de esto quedó huérfana.
const ORPHAN_MS = 10 * 60 * 1000;
const KEEP_DAYS = 60;
const STORAGE_PREFIX = "readMeter.";

const sessionId = Math.random().toString(36).slice(2, 10);
const storageKey = `${STORAGE_PREFIX}${sessionId}`;
let buffer = null;
let started = false;
let flushing = false;
// undefined: sin leer todavía; null: no hay configuración.
let config;
let stopped = false;
// Los modales marcados que están abiertos, del primero al último.
const sections = [];

function isActive() {
  return (
    !stopped &&
    typeof window !== "undefined" &&
    (!import.meta.env.VITE_FIRESTORE_EMULATOR || import.meta.env.VITE_READ_METER === "on")
  );
}

const currentScreen = () => sectionKey(screenOf(window.location.pathname), sections);

// La cuenta de hoy y de la persona con sesión. Si cambió el día o la persona,
// la anterior se manda aparte.
function bufferForNow() {
  const date = localIsoDate();
  const userId = auth.currentUser?.uid || null;
  if (buffer && (buffer.date !== date || buffer.userId !== userId)) {
    const previous = buffer;
    buffer = null;
    if (previous.userId && !isEmptyBuffer(previous)) send(previous).catch(() => {});
  }
  if (!buffer) buffer = emptyBuffer({ date, userId });
  return buffer;
}

function track(add, entry) {
  try {
    if (!isActive()) return;
    start();
    add(bufferForNow(), { hour: new Date().getHours(), screen: currentScreen(), ...entry });
    writeStoredJson(storageKey, { savedAt: Date.now(), buffer });
  } catch {
    // El registro nunca interrumpe la lectura.
  }
}

// Lee la configuración una vez por sesión. Si no se pudo leer, se reintenta
// en el próximo envío.
async function loadConfig() {
  if (config !== undefined) return;
  const snap = await getDoc(doc(db, READ_LOG_CONFIG, "main"));
  config = snap.exists() ? snap.data() : null;
}

function stop() {
  stopped = true;
  buffer = null;
  writeStored(storageKey, null);
}

// Manda una cuenta a su documento del día, sumando sobre lo que ya tenga.
async function send(pending) {
  const expires = new Date(`${pending.date}T12:00:00`);
  expires.setDate(expires.getDate() + KEEP_DAYS);
  const env = import.meta.env.PROD ? "prod" : "local";
  await fsSetDoc(
    doc(db, READ_LOGS, `${pending.date}_${pending.userId}_${env}`),
    {
      date: pending.date,
      userId: pending.userId,
      env,
      appVersion: typeof __APP_VERSION__ === "undefined" ? "" : __APP_VERSION__,
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expires),
      flushes: increment(1),
      ...toIncrements(pending, increment),
    },
    { merge: true },
  );
}

async function flush() {
  if (flushing || isEmptyBuffer(buffer) || !buffer.userId) return;
  flushing = true;
  try {
    await loadConfig();
    if (!meterEnabled(config, localIsoDate())) {
      stop();
    } else {
      const pending = buffer;
      buffer = null;
      try {
        await send(pending);
        if (buffer) writeStoredJson(storageKey, { savedAt: Date.now(), buffer });
        else writeStored(storageKey, null);
      } catch {
        // Vuelve a la cuenta para el próximo intento.
        if (!buffer) buffer = pending;
        else if (buffer.date === pending.date && buffer.userId === pending.userId) buffer = mergeBuffers(pending, buffer);
      }
    }
  } catch {
    // Sin la configuración no se manda nada; se reintenta en el próximo envío.
  }
  flushing = false;
}

// Las cuentas que dejó guardadas una pestaña que se cerró antes de mandarlas.
async function sendOrphans() {
  try {
    await loadConfig();
  } catch {
    return;
  }
  const enabled = meterEnabled(config, localIsoDate());
  for (const key of storedKeys(STORAGE_PREFIX)) {
    if (key === storageKey) continue;
    const saved = readStoredJson(key);
    if (saved && Date.now() - (saved.savedAt || 0) < ORPHAN_MS) continue;
    writeStored(key, null);
    if (enabled && saved?.buffer?.userId && !isEmptyBuffer(saved.buffer)) {
      try {
        await send(saved.buffer);
      } catch {
        // Se pierde esa cuenta; la de esta pestaña sigue.
      }
    }
  }
}

// Cada 15 segundos con la pestaña visible y una sesión iniciada, suma ese
// tiempo a la pantalla de ese momento.
function tick() {
  if (document.visibilityState === "visible" && auth.currentUser) track(addTime, { seconds: TICK_S });
}

function start() {
  if (started) return;
  started = true;
  bufferForNow().opens += 1;
  setInterval(flush, FLUSH_MS);
  setInterval(tick, TICK_S * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  setTimeout(sendOrphans, 30 * 1000);
}

// Una visita a una pantalla (Layout la avisa al cambiar de ruta).
export function recordVisit(pathname) {
  track(addVisit, { screen: sectionKey(screenOf(pathname), sections) });
}

// Mientras un modal marcado está abierto, lo que se lee se anota en él. Abrirlo
// cuenta como una visita. Devuelve la función que lo saca al cerrarse.
export function pushReadSection(name) {
  sections.push(name);
  track(addVisit, {});
  return () => {
    const i = sections.lastIndexOf(name);
    if (i >= 0) sections.splice(i, 1);
  };
}

// Una lectura que se ahorró una caché propia (`list({ cache })`, la lista de
// trabajadores), con los documentos que habría traído.
export function recordCacheHit({ collection, wheres = [], order, take }, docs) {
  track(addRead, {
    query: describeQuery({
      collection,
      filters: wheres.map(([field, op]) => [field, op]),
      order: order ? [order[0]] : [],
      limit: take ?? null,
    }),
    docs,
    cacheHit: true,
  });
}

// Forma de lo que se lee: un documento, una colección o una consulta. De una
// consulta se leen los filtros desde la estructura interna del SDK; si cambia,
// queda "?" y la lectura se cuenta igual.
function describeTarget(target) {
  try {
    if (target?.type === "document") return describeQuery({ collection: collectionPathOf(target.parent.path), doc: true });
    if (target?.type === "collection") return describeQuery({ collection: collectionPathOf(target.path) });
    const q = target?._query;
    if (!q) return "?";
    const collection = q.collectionGroup || collectionPathOf(q.path.canonicalString());
    const filters = q.filters.flatMap((f) => f.getFlattenedFilters()).map((f) => [f.field.canonicalString(), f.op]);
    const order = q.explicitOrderBy.map((o) => o.field.canonicalString());
    return describeQuery({ collection, filters, order, limit: q.limit });
  } catch {
    return "?";
  }
}

function recordResponse(target, kind, size, fromCache) {
  if (!isActive()) return;
  const query = describeTarget(target);
  if (fromCache) track(addRead, { query, docs: size, cacheHit: true });
  else track(addRead, { query, docs: billedReads(kind, size) });
}

function recordWrite(collection) {
  if (!isActive()) return;
  track(addWrite, { collection });
}

const collectionOfRef = (ref) => {
  try {
    return collectionPathOf(ref.type === "collection" ? ref.path : ref.parent.path);
  } catch {
    return "?";
  }
};

export async function getDocs(target) {
  const snap = await fsGetDocs(target);
  recordResponse(target, "query", snap.size, snap.metadata.fromCache);
  return snap;
}

export async function getDoc(ref) {
  const snap = await fsGetDoc(ref);
  recordResponse(ref, "doc", 1, snap.metadata.fromCache);
  return snap;
}

export async function getCountFromServer(target) {
  const snap = await fsGetCountFromServer(target);
  recordResponse(target, "count", snap.data().count, false);
  return snap;
}

// Cada aviso de un listener cobra los documentos que cambiaron; los que
// vienen de la caché o de una escritura propia todavía sin confirmar, no.
export function onSnapshot(target, ...args) {
  const i = args.findIndex((a) => typeof a === "function" || typeof a?.next === "function");
  if (i === -1 || !isActive()) return fsOnSnapshot(target, ...args);
  const wrap = (next) => (snap) => {
    try {
      const { fromCache, hasPendingWrites } = snap.metadata;
      if (!fromCache && !hasPendingWrites) {
        const changed = typeof snap.docChanges === "function" ? snap.docChanges().length : 1;
        if (changed) track(addRead, { query: describeTarget(target), docs: changed });
      }
    } catch {
      // El registro nunca interrumpe el listener.
    }
    next(snap);
  };
  const wrapped = [...args];
  wrapped[i] = typeof args[i] === "function" ? wrap(args[i]) : { ...args[i], next: wrap(args[i].next.bind(args[i])) };
  return fsOnSnapshot(target, ...wrapped);
}

export async function setDoc(ref, ...rest) {
  const result = await fsSetDoc(ref, ...rest);
  recordWrite(collectionOfRef(ref));
  return result;
}

export async function updateDoc(ref, ...rest) {
  const result = await fsUpdateDoc(ref, ...rest);
  recordWrite(collectionOfRef(ref));
  return result;
}

export async function addDoc(ref, data) {
  const result = await fsAddDoc(ref, data);
  recordWrite(collectionOfRef(ref));
  return result;
}

export async function deleteDoc(ref) {
  const result = await fsDeleteDoc(ref);
  recordWrite(collectionOfRef(ref));
  return result;
}

// Un lote es una sola petición, cualquiera sea la cantidad de documentos.
export function writeBatch(firestore) {
  const batch = fsWriteBatch(firestore);
  const commit = batch.commit.bind(batch);
  batch.commit = async () => {
    const result = await commit();
    recordWrite("(lote)");
    return result;
  };
  return batch;
}
