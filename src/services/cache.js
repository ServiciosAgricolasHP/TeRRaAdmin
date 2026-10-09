// Caché con TTL en memoria y, opcionalmente, en localStorage. Para resultados
// de consultas que se leen mucho y toleran estar un rato desactualizados.

const mem = new Map();
const LS_PREFIX = "af.cache.";
const SUBS = new Map(); // prefijo del scope -> Set<fn>

const now = () => Date.now();

export function cacheKey(scope, params) {
  return `${scope}::${params ? JSON.stringify(params) : ""}`;
}

function readLS(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.expires <= now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLS(key, data, ttl) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data, expires: now() + ttl }));
  } catch {
    /* sin espacio o error al serializar: se ignora */
  }
}

function dropLS(prefix) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX + prefix)) localStorage.removeItem(k);
    }
  } catch {
    /* se ignora */
  }
}

export function getCache(key, { persist = false } = {}) {
  const m = mem.get(key);
  if (m && m.expires > now()) return m.data;
  if (persist) {
    const ls = readLS(key);
    if (ls) {
      mem.set(key, ls);
      return ls.data;
    }
  }
  return undefined;
}

export function setCache(key, data, { ttl = 60_000, persist = false } = {}) {
  const expires = now() + ttl;
  mem.set(key, { data, expires });
  if (persist) writeLS(key, data, ttl);
}

export function invalidate(scopePrefix) {
  for (const k of [...mem.keys()]) {
    if (k.startsWith(`${scopePrefix}::`)) mem.delete(k);
  }
  dropLS(`${scopePrefix}::`);
  const subs = SUBS.get(scopePrefix);
  if (subs) subs.forEach((fn) => { try { fn(); } catch { /* */ } });
}

// Vacía la caché entera y avisa a todos los suscriptores. La usan los tests
// end-to-end entre casos: la caché vive a nivel de módulo y no se reinicia
// sola entre un test y el siguiente.
export function invalidateAll() {
  mem.clear();
  dropLS("");
  for (const subs of SUBS.values()) {
    subs.forEach((fn) => { try { fn(); } catch { /* */ } });
  }
}

// ¿Esta llamada a `list()` va a pagar lecturas o va a salir de la caché?
// Reconstruye la clave que arma `firestoreBase.list` y mira si ya está viva,
// para poder mostrar el costo real en pantalla.
//
// Las opciones que se le pasan tienen que ser EXACTAMENTE las de la llamada
// real: la clave es `collection::{wheres,order,take}`, así que cualquier
// diferencia forma otra clave y el contador pasa a mentir en vez de avisar.
export async function countedList(service, opts = {}) {
  const key = cacheKey(service.collectionName, {
    wheres: opts.wheres || [],
    order: opts.order,
    take: opts.take,
  });
  const warm = getCache(key, { persist: !!opts.persist }) !== undefined;
  const data = await service.list(opts);
  return { data, reads: warm ? 0 : data.length };
}

export function subscribe(scopePrefix, fn) {
  if (!SUBS.has(scopePrefix)) SUBS.set(scopePrefix, new Set());
  SUBS.get(scopePrefix).add(fn);
  return () => SUBS.get(scopePrefix)?.delete(fn);
}

// Recupera el objeto de parámetros desde el sufijo de la clave, para revisar
// sus filtros. Solo lo usa la actualización aditiva.
function parseKeyParams(key, scopePrefix) {
  const prefix = `${scopePrefix}::`;
  if (!key.startsWith(prefix)) return null;
  const suffix = key.slice(prefix.length);
  if (!suffix) return null;
  try { return JSON.parse(suffix); } catch { return null; }
}

// Indica si la entrada viene de un listado completo (sin `wheres`). En una
// lista filtrada no se puede saber si el doc nuevo o cambiado cumple el filtro.
function isUnfilteredListKey(key, scopePrefix) {
  const p = parseKeyParams(key, scopePrefix);
  if (!p) return false;
  return !p.wheres || p.wheres.length === 0;
}

// Actualización aditiva: agrega (o reemplaza) el item en cada listado completo
// cacheado del scope, así una escritura no obliga a releer la colección
// entera. Las listas filtradas (con `wheres`) no se tocan: quedan como
// estaban hasta que vence su TTL.
export function mergeListItem(scopePrefix, item, { idKey = "id" } = {}) {
  if (!item || !item[idKey]) return;
  // En memoria
  for (const [key, entry] of mem) {
    if (!isUnfilteredListKey(key, scopePrefix)) continue;
    if (!Array.isArray(entry.data)) continue;
    const idx = entry.data.findIndex((x) => x?.[idKey] === item[idKey]);
    const nextData = idx >= 0
      ? entry.data.map((x, i) => (i === idx ? item : x))
      : [...entry.data, item];
    mem.set(key, { ...entry, data: nextData });
  }
  // En localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      const baseKey = k.slice(LS_PREFIX.length);
      if (!isUnfilteredListKey(baseKey, scopePrefix)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed || !Array.isArray(parsed.data)) continue;
      if (parsed.expires <= now()) continue;
      const idx = parsed.data.findIndex((x) => x?.[idKey] === item[idKey]);
      const nextData = idx >= 0
        ? parsed.data.map((x, j) => (j === idx ? item : x))
        : [...parsed.data, item];
      localStorage.setItem(k, JSON.stringify({ data: nextData, expires: parsed.expires }));
    }
  } catch { /* se ignora */ }
}

export function removeListItem(scopePrefix, id, { idKey = "id" } = {}) {
  for (const [key, entry] of mem) {
    if (!isUnfilteredListKey(key, scopePrefix)) continue;
    if (!Array.isArray(entry.data)) continue;
    mem.set(key, { ...entry, data: entry.data.filter((x) => x?.[idKey] !== id) });
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      const baseKey = k.slice(LS_PREFIX.length);
      if (!isUnfilteredListKey(baseKey, scopePrefix)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed || !Array.isArray(parsed.data)) continue;
      if (parsed.expires <= now()) continue;
      const filtered = parsed.data.filter((x) => x?.[idKey] !== id);
      localStorage.setItem(k, JSON.stringify({ data: filtered, expires: parsed.expires }));
    }
  } catch { /* se ignora */ }
}
