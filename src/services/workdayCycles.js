import { collection, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { subscribe } from "./cache";
import { getCountFromServer, getDocs, recordCacheHit } from "./readMeter";
import { idbDelete, idbGet, idbSet } from "./idbStore";
import { localIsoDate } from "../utils/dates";
import { advanceMarks, deltaSince, markOf, millisOf, syncMode } from "../utils/syncedList";
import { applyCycleChanges, cyclesToDrop, groupByCycle } from "../utils/workdayCycles";

// Las jornadas de los ciclos que usa Nómina (lo pendiente de los ciclos
// activos, armar una nómina y el detalle de una), guardadas en el navegador
// por ciclo, como los meses del Calendario (services/workdayMonths.js). Cada
// ciclo se lee entero la primera vez y una vez por semana; entre medio, pedir
// sus jornadas cuesta unas pocas lecturas:
// - una consulta trae las jornadas con `updatedAt` desde la marca, de
//   cualquier ciclo, y las reparte en los ciclos guardados (una para todos,
//   como mucho una vez por minuto). Lo escrito en los minutos antes de la
//   marca se vuelve a traer hasta que pasan esos minutos (`advanceMarks`,
//   utils/syncedList.js);
// - un conteo de los ciclos pedidos, de a 30, encuentra lo eliminado: si no
//   calza con las copias, se cuenta cada ciclo y se relee entero el que no
//   calza.
// Una escritura de jornadas en este equipo (`workdaysService.invalidate()`)
// no suelta las copias: la próxima vez se ponen al día sin esperar el minuto.
//
// Se guardan los ciclos usados en la última semana, cada uno en su entrada de
// IndexedDB (services/idbStore.js), y la marca con la lista de ciclos en otra.
// Sin IndexedDB, viven en memoria hasta que se recarga la página.

const WORKDAYS = "workdays";
const META_KEY = "workdayCycles.meta";
const cycleKey = (cycleId) => `workdayCycles.${cycleId}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
// La marca se toma unos minutos antes de lo último visto, por si llegan dos
// escrituras con la misma hora.
const MARGIN_MS = 5 * 60 * 1000;
const COUNT_BATCH = 1000;
// Los valores que acepta Firestore en un `in`.
const IN_LIMIT = 30;
const FULL_EVERY_DAYS = 7;

// `mark`: la hora de la jornada escrita más recientemente que ya está en las
// copias, con `safe` y `checkpoints` (ver `advanceMarks`); `syncedAt`: cuándo
// se puso al día por última vez; `cycles`: la fecha de la última lectura
// completa de cada ciclo y cuándo se usó.
const emptyMeta = () => ({ mark: 0, syncedAt: 0, cycles: {} });

let meta; // undefined: sin leer todavía lo guardado
const data = new Map();
const checkedAt = new Map();
let lastDeltaAt = 0;
let queue = Promise.resolve();

const cyclesQuery = (cycleIds) => query(collection(db, WORKDAYS), where("cycleId", "in", cycleIds));
const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const countReads = (count) => Math.max(1, Math.ceil(count / COUNT_BATCH));

function chunksOf(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function countOf(cycleIds) {
  return (await getCountFromServer(cyclesQuery(cycleIds))).data().count;
}

async function loadMeta() {
  if (meta !== undefined) return;
  const saved = await idbGet(META_KEY);
  meta = saved?.cycles && typeof saved.cycles === "object" ? saved : emptyMeta();
}

const saveMeta = () => idbSet(META_KEY, meta);

async function cycleData(cycleId) {
  if (data.has(cycleId)) return data.get(cycleId);
  if (!meta.cycles[cycleId]) return null;
  const saved = await idbGet(cycleKey(cycleId));
  let list = null;
  try {
    list = JSON.parse(saved?.json);
  } catch {
    list = null;
  }
  if (!Array.isArray(list)) return null;
  data.set(cycleId, list);
  return list;
}

function saveCycle(cycleId, list) {
  data.set(cycleId, list);
  idbSet(cycleKey(cycleId), { json: JSON.stringify(list) });
}

function forget(cycleIds) {
  for (const cycleId of cycleIds) {
    data.delete(cycleId);
    checkedAt.delete(cycleId);
    delete meta.cycles[cycleId];
    idbDelete(cycleKey(cycleId));
  }
}

subscribe("workdayCycles", () => {
  if (meta) forget(Object.keys(meta.cycles));
  meta = emptyMeta();
  lastDeltaAt = 0;
  saveMeta();
});

subscribe(WORKDAYS, () => {
  lastDeltaAt = 0;
  checkedAt.clear();
});

// Pone al día los ciclos guardados con lo que cambió desde la marca. Sin
// marca, o con una de hace una semana o más (todos los ciclos se releerían
// enteros), los suelta y toma como marca la jornada escrita más
// recientemente.
async function runDelta() {
  const now = Date.now();
  if (!meta.mark || now - meta.syncedAt >= FULL_EVERY_DAYS * DAY_MS) {
    forget(Object.keys(meta.cycles));
    const snap = await getDocs(query(collection(db, WORKDAYS), orderBy("updatedAt", "desc"), limit(1)));
    // Sin ninguna jornada con `updatedAt`, la próxima consulta las trae todas.
    const mark = snap.empty ? 1 : millisOf(snap.docs[0].data().updatedAt);
    Object.assign(meta, { mark, safe: undefined, checkpoints: [{ mark, at: Date.now() }], syncedAt: now });
    lastDeltaAt = now;
    saveMeta();
    return 1;
  }
  const since = Timestamp.fromMillis(Math.max(0, deltaSince(meta, MARGIN_MS)));
  const changed = docsOf(await getDocs(query(collection(db, WORKDAYS), where("updatedAt", ">", since))));
  if (changed.length) {
    for (const cycleId of Object.keys(meta.cycles)) {
      const list = await cycleData(cycleId);
      if (!list) continue;
      const next = applyCycleChanges(list, changed, cycleId);
      if (next !== list) saveCycle(cycleId, next);
    }
  }
  const newMark = markOf(changed, "updatedAt", meta.mark);
  Object.assign(meta, advanceMarks(meta, { start: now, end: Date.now(), newMark, marginMs: MARGIN_MS }), { syncedAt: now });
  lastDeltaAt = now;
  saveMeta();
  return Math.max(1, changed.length);
}

function delta(fresh) {
  if (!fresh && meta.mark && Date.now() - lastDeltaAt < MIN_GAP_MS) return 0;
  return runDelta();
}

// Cuenta los ciclos de a 30 y devuelve cuánto costó y cuáles no calzan con su
// copia. Un grupo que no calza se cuenta ciclo por ciclo.
async function countBatch(cycleIds, lists) {
  const count = await countOf(cycleIds);
  const held = cycleIds.reduce((n, id) => n + lists.get(id).length, 0);
  if (count === held) return { reads: countReads(count), stale: [] };
  const each = await Promise.all(cycleIds.map((id) => countOf([id])));
  return {
    reads: countReads(count) + each.reduce((n, c) => n + countReads(c), 0),
    stale: cycleIds.filter((id, i) => each[i] !== lists.get(id).length),
  };
}

async function run(cycleIds, fresh) {
  await loadMeta();
  let reads = await delta(fresh);
  const today = localIsoDate();
  const now = Date.now();
  const lists = new Map();
  const toCount = [];
  const toRead = [];
  let cachedDocs = 0;
  for (const cycleId of cycleIds) {
    const list = await cycleData(cycleId);
    const info = meta.cycles[cycleId];
    const mode = syncMode({
      hasCopy: !!list && !!info,
      fullDate: info?.fullDate,
      today,
      fullEveryDays: FULL_EVERY_DAYS,
      lastSyncAt: checkedAt.get(cycleId) || 0,
      now,
      fresh,
      minGapMs: MIN_GAP_MS,
    });
    if (mode === "full") {
      toRead.push(cycleId);
      continue;
    }
    lists.set(cycleId, list);
    if (mode === "delta") toCount.push(cycleId);
    else cachedDocs += list.length;
  }
  if (lists.size > toCount.length) recordCacheHit({ collection: WORKDAYS, wheres: [["cycleId", "in"]] }, cachedDocs);

  const counted = await Promise.all(chunksOf(toCount, IN_LIMIT).map((ids) => countBatch(ids, lists)));
  const stale = new Set(counted.flatMap((c) => c.stale));
  reads += counted.reduce((n, c) => n + c.reads, 0);
  for (const cycleId of toCount) {
    if (stale.has(cycleId)) toRead.push(cycleId);
    else checkedAt.set(cycleId, now);
  }

  const batches = chunksOf(toRead, IN_LIMIT);
  const read = await Promise.all(batches.map(async (ids) => docsOf(await getDocs(cyclesQuery(ids)))));
  batches.forEach((ids, i) => {
    reads += Math.max(1, read[i].length);
    for (const [cycleId, list] of groupByCycle(read[i], ids)) {
      saveCycle(cycleId, list);
      lists.set(cycleId, list);
      meta.cycles[cycleId] = { fullDate: today };
      checkedAt.set(cycleId, now);
    }
  });

  for (const cycleId of cycleIds) meta.cycles[cycleId] = { ...meta.cycles[cycleId], usedAt: now };
  forget(cyclesToDrop(meta.cycles, now, FULL_EVERY_DAYS * DAY_MS));
  saveMeta();
  return { data: cycleIds.flatMap((cycleId) => lists.get(cycleId)), reads };
}

// Las jornadas de esos ciclos, en un solo array, y cuántas lecturas costó (0
// si salió de las copias). `fresh` pone al día sin esperar el minuto. Las
// llamadas van de a una: la siguiente aprovecha lo que trajo la anterior.
export function syncWorkdayCycles(cycleIds, { fresh = false } = {}) {
  const ids = [...new Set(cycleIds)].filter(Boolean);
  const result = queue.then(() => run(ids, fresh));
  queue = result.catch(() => {});
  return result;
}

// Solo las jornadas.
export async function listCycleWorkdays(cycleIds, opts) {
  return (await syncWorkdayCycles(cycleIds, opts)).data;
}
