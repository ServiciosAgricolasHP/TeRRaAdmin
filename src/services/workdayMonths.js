import { collection, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { subscribe } from "./cache";
import { getCountFromServer, getDocs, recordCacheHit } from "./readMeter";
import { idbDelete, idbGet, idbSet } from "./idbStore";
import { localIsoDate } from "../utils/dates";
import { markOf, millisOf, syncMode } from "../utils/syncedList";
import { applyMonthChanges, monthOfDate, monthsToDrop } from "../utils/workdayMonths";

// Las jornadas de un mes para el Calendario, guardadas en el navegador. Cada
// mes abierto se lee entero la primera vez y una vez por semana; entre medio,
// abrirlo cuesta unas pocas lecturas:
// - una consulta trae las jornadas con `updatedAt` desde la marca, de
//   cualquier mes, y las reparte en los meses guardados (una para todos, como
//   mucho una vez por minuto);
// - un conteo del mes (una lectura por cada 1.000 jornadas) encuentra lo
//   eliminado y lo escrito sin `updatedAt`: si no calza con la copia, el mes
//   se lee entero.
// Lo que la nómina escribe en una jornada (`payrollId`, `paidAt`) no pone
// `updatedAt`, y el Calendario no lo usa. El id de una jornada lleva su fecha,
// así que una jornada nunca cambia de mes.
//
// Se guardan los `KEEP_MONTHS` meses abiertos más recientemente, cada uno en
// su entrada de IndexedDB (services/idbStore.js), y la marca con la lista de
// meses en otra. Sin IndexedDB, viven en memoria hasta que se recarga la
// página.

const WORKDAYS = "workdays";
const META_KEY = "workdayMonths.meta";
const monthKey = (month) => `workdayMonths.${month}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
// La marca se toma unos minutos antes de lo último visto, por si llegan dos
// escrituras con la misma hora.
const MARGIN_MS = 5 * 60 * 1000;
const COUNT_BATCH = 1000;
const FULL_EVERY_DAYS = 7;
const KEEP_MONTHS = 6;

// `mark`: la hora de la jornada escrita más recientemente que ya está en las
// copias; `syncedAt`: cuándo se puso al día por última vez; `months`: la fecha
// de la última lectura completa de cada mes y cuándo se abrió.
const emptyMeta = () => ({ mark: 0, syncedAt: 0, months: {} });

let meta; // undefined: sin leer todavía lo guardado
const data = new Map();
const checkedAt = new Map();
let lastDeltaAt = 0;
let pendingDelta = null;
const pending = new Map();

const monthWheres = (month) => [
  ["date", ">=", `${month}-01`],
  ["date", "<=", `${month}-31`],
];
const monthQuery = (month) =>
  query(collection(db, WORKDAYS), ...monthWheres(month).map(([field, op, value]) => where(field, op, value)));
const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

async function loadMeta() {
  if (meta !== undefined) return;
  const saved = await idbGet(META_KEY);
  meta = saved?.months && typeof saved.months === "object" ? saved : emptyMeta();
}

const saveMeta = () => idbSet(META_KEY, meta);

async function monthData(month) {
  if (data.has(month)) return data.get(month);
  if (!meta.months[month]) return null;
  const saved = await idbGet(monthKey(month));
  let list = null;
  try {
    list = JSON.parse(saved?.json);
  } catch {
    list = null;
  }
  if (!Array.isArray(list)) return null;
  data.set(month, list);
  return list;
}

function saveMonth(month, list) {
  data.set(month, list);
  idbSet(monthKey(month), { json: JSON.stringify(list) });
}

function forget(months) {
  for (const month of months) {
    data.delete(month);
    checkedAt.delete(month);
    delete meta.months[month];
    idbDelete(monthKey(month));
  }
}

subscribe("workdayMonths", () => {
  if (meta) forget(Object.keys(meta.months));
  meta = emptyMeta();
  lastDeltaAt = 0;
  saveMeta();
});

// Pone al día los meses guardados con lo que cambió desde la marca. Sin marca,
// o con una de hace una semana o más (todos los meses se releerían enteros),
// los suelta y toma como marca la jornada escrita más recientemente.
async function runDelta() {
  const now = Date.now();
  if (!meta.mark || now - meta.syncedAt >= FULL_EVERY_DAYS * DAY_MS) {
    forget(Object.keys(meta.months));
    const snap = await getDocs(query(collection(db, WORKDAYS), orderBy("updatedAt", "desc"), limit(1)));
    // Sin ninguna jornada con `updatedAt`, la próxima consulta las trae todas.
    meta.mark = snap.empty ? 1 : millisOf(snap.docs[0].data().updatedAt);
    meta.syncedAt = now;
    lastDeltaAt = now;
    saveMeta();
    return 1;
  }
  const since = Timestamp.fromMillis(Math.max(0, meta.mark - MARGIN_MS));
  const changed = docsOf(await getDocs(query(collection(db, WORKDAYS), where("updatedAt", ">=", since))));
  const touched = new Set(changed.map((d) => monthOfDate(d.date)));
  for (const month of Object.keys(meta.months)) {
    if (!touched.has(month)) continue;
    const list = await monthData(month);
    if (list) saveMonth(month, applyMonthChanges(list, changed, month));
  }
  meta.mark = markOf(changed, "updatedAt", meta.mark);
  meta.syncedAt = now;
  lastDeltaAt = now;
  saveMeta();
  return Math.max(1, changed.length);
}

function delta(fresh) {
  if (pendingDelta) return pendingDelta;
  if (!fresh && meta.mark && Date.now() - lastDeltaAt < MIN_GAP_MS) return Promise.resolve(0);
  pendingDelta = runDelta().finally(() => {
    pendingDelta = null;
  });
  return pendingDelta;
}

async function run(month, fresh) {
  await loadMeta();
  let reads = await delta(fresh);
  const today = localIsoDate();
  let list = await monthData(month);
  const info = meta.months[month];
  const mode = syncMode({
    hasCopy: !!list && !!info,
    fullDate: info?.fullDate,
    today,
    fullEveryDays: FULL_EVERY_DAYS,
    lastSyncAt: checkedAt.get(month) || 0,
    now: Date.now(),
    fresh,
    minGapMs: MIN_GAP_MS,
  });
  if (mode === "cached") {
    recordCacheHit({ collection: WORKDAYS, wheres: monthWheres(month) }, list.length);
  } else {
    let full = mode === "full";
    if (!full) {
      const count = (await getCountFromServer(monthQuery(month))).data().count;
      reads += Math.max(1, Math.ceil(count / COUNT_BATCH));
      full = count !== list.length;
    }
    if (full) {
      list = docsOf(await getDocs(monthQuery(month)));
      reads += Math.max(1, list.length);
      saveMonth(month, list);
      meta.months[month] = { fullDate: today };
    }
    checkedAt.set(month, Date.now());
  }
  meta.months[month] = { ...meta.months[month], usedAt: Date.now() };
  forget(monthsToDrop(meta.months, KEEP_MONTHS));
  saveMeta();
  return { data: list, reads };
}

// Las jornadas de `month` (YYYY-MM) y cuántas lecturas costó (0 si salió de la
// copia). `fresh` pone al día sin esperar el minuto. Las llamadas simultáneas
// del mismo mes comparten la misma.
export function syncWorkdayMonth(month, { fresh = false } = {}) {
  if (!pending.has(month)) {
    pending.set(
      month,
      run(month, fresh).finally(() => pending.delete(month)),
    );
  }
  return pending.get(month);
}
