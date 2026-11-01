import { collection, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { cacheKey, dropStoredCache, getCache, onListPatched, setCache, subscribe } from "./cache";
import { getCountFromServer, getDocs, recordCacheHit } from "./readMeter";
import { idbAvailable, idbDelete, idbGet, idbSet } from "./idbStore";
import { localIsoDate } from "../utils/dates";
import { writeStored } from "../utils/browserStorage";
import { applyChanges, markOf, syncMode } from "../utils/syncedList";

const DAY_MS = 24 * 60 * 60 * 1000;
// Como máximo una puesta al día por minuto en cada pestaña.
const MIN_GAP_MS = 60 * 1000;
// La marca se toma unos minutos antes de lo último visto, por si llegan dos
// escrituras con la misma hora.
const MARGIN_MS = 5 * 60 * 1000;
// Un conteo cobra una lectura por cada 1.000 documentos contados.
const COUNT_BATCH = 1000;
// Espera antes de guardar la copia después de una escritura de este equipo,
// para juntar varias seguidas en un solo guardado.
const PERSIST_DELAY_MS = 1000;

// Lo guardado en IndexedDB: la marca y la copia en JSON (un Timestamp queda
// como `{ seconds, nanoseconds }`). `null` si no hay o no se puede leer.
async function readSaved(syncKey) {
  const saved = await idbGet(syncKey);
  if (!saved?.meta || typeof saved.json !== "string") return null;
  try {
    const data = JSON.parse(saved.json);
    return Array.isArray(data) ? { meta: saved.meta, data } : null;
  } catch {
    return null;
  }
}

// Una colección que se lista entera y se guarda en el navegador. La copia vive
// en memoria, en la caché de `list` y con la misma clave, así las escrituras
// `additive` de este equipo la corrigen en su lugar; entre una carga de página
// y otra se guarda en IndexedDB (services/idbStore.js) con su marca, y sin
// IndexedDB queda solo en memoria. Se pone al día con una consulta: los
// documentos con `updatedAt` desde la marca.
// - `order`: el orden de la lista, como en `list`.
// - `syncKey`: la clave en IndexedDB de la copia, con la fecha de la última
//   carga completa y la marca.
// - `fullEveryDays`: cada cuántos días se lee entera, para que entre lo que se
//   escribió sin `updatedAt`. Con 1, la primera vez del día.
// - `checkCount`: cada puesta al día cuenta además los documentos en el
//   servidor y, si no calzan con la copia (se eliminó alguno en otro equipo),
//   la lee entera.
// Borrar la caché de la colección (`service.invalidate()`) hace que la
// próxima vez se lea entera.
export function createSyncedList(service, { order, syncKey, fullEveryDays = 1, checkCount = false }) {
  const name = service.collectionName;
  const listKey = cacheKey(name, { wheres: [], order, take: undefined });
  const keepMs = (fullEveryDays + 7) * DAY_MS;
  let meta; // undefined: sin leer todavía lo guardado en IndexedDB
  let lastSyncAt = 0;
  let pending = null;
  let persistTimer = null;

  // La copia no va en localStorage: lo que haya de la colección ahí se borra.
  dropStoredCache(name);
  writeStored(syncKey, null);

  // Las escrituras de este equipo agregan o reemplazan documentos en la copia
  // sin moverlos de lugar; con `order`, la copia se entrega ordenada.
  const ordered = (data) => (order ? applyChanges(data, [], order) : data);

  function persistNow() {
    persistTimer = null;
    const data = getCache(listKey);
    if (!meta || !Array.isArray(data)) return;
    idbSet(syncKey, { meta, json: JSON.stringify(data) });
  }

  // Guarda la copia corregida por una escritura de este equipo.
  onListPatched(name, () => {
    if (!idbAvailable() || !meta) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, PERSIST_DELAY_MS);
  });

  subscribe(name, () => {
    meta = null;
    lastSyncAt = 0;
    clearTimeout(persistTimer);
    idbDelete(syncKey);
  });

  function save(data, nextMeta, { changed }) {
    meta = nextMeta;
    lastSyncAt = Date.now();
    if (!changed) return;
    setCache(listKey, data, { ttl: keepMs });
    persistNow();
  }

  async function readFull(today) {
    const data = await service.list({ order });
    save(data, { fullDate: today, mark: markOf(data, "updatedAt") }, { changed: true });
    return { data, reads: Math.max(1, data.length) };
  }

  // Los documentos que trae la lista entera: con `order`, solo los que tienen
  // ese campo, como en Firestore.
  async function countAll() {
    const base = collection(db, name);
    const target = order ? query(base, orderBy(order[0], order[1] || "asc")) : base;
    const snap = await getCountFromServer(target);
    return snap.data().count;
  }

  async function run(fresh) {
    if (meta === undefined) {
      const saved = await readSaved(syncKey);
      meta = saved?.meta || null;
      if (saved && getCache(listKey) === undefined) setCache(listKey, saved.data, { ttl: keepMs });
    }
    const copy = getCache(listKey);
    const today = localIsoDate();
    const mode = syncMode({
      hasCopy: Array.isArray(copy) && !!meta,
      fullDate: meta?.fullDate,
      today,
      fullEveryDays,
      lastSyncAt,
      now: Date.now(),
      fresh,
      minGapMs: MIN_GAP_MS,
    });
    if (mode === "cached") {
      recordCacheHit({ collection: name, order }, copy.length);
      return { data: ordered(copy), reads: 0 };
    }
    if (mode === "full") return readFull(today);

    const since = Timestamp.fromMillis(Math.max(0, meta.mark - MARGIN_MS));
    const [snap, count] = await Promise.all([
      getDocs(query(collection(db, name), where("updatedAt", ">=", since))),
      checkCount ? countAll() : null,
    ]);
    const changed = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const data = changed.length ? applyChanges(copy, changed, order) : ordered(copy);
    const deltaReads = Math.max(1, changed.length) + (checkCount ? Math.max(1, Math.ceil(count / COUNT_BATCH)) : 0);
    if (checkCount && count !== data.length) {
      const full = await readFull(today);
      return { data: full.data, reads: deltaReads + full.reads };
    }
    save(data, { fullDate: meta.fullDate, mark: markOf(changed, "updatedAt", meta.mark) }, { changed: changed.length > 0 });
    return { data, reads: deltaReads };
  }

  // La lista y cuántas lecturas costó (0 si salió de la copia). `fresh` pone
  // al día sin esperar el minuto. Las llamadas simultáneas comparten la misma.
  function sync({ fresh = false } = {}) {
    if (!pending) {
      pending = run(fresh).finally(() => {
        pending = null;
      });
    }
    return pending;
  }

  async function list(opts) {
    return (await sync(opts)).data;
  }

  return { sync, list };
}
