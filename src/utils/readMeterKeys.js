// Cálculo del registro de lecturas (services/readMeter.js): la pantalla como
// patrón, la forma de cada consulta y la cuenta acumulada que se manda a
// `readLogs`. Nunca guarda el valor de un filtro ni el id de un documento.

// Segmentos de ruta que van seguidos de un id: "/cycles/abc" → "/cycles/:id".
const PARAM_AFTER = new Set(["cycles"]);
// Un id automático de Firestore: 20 letras y números.
const AUTO_ID = /^[A-Za-z0-9]{20}$/;

// La ruta de la app como patrón, sin la base del deploy.
export function screenOf(pathname, base = "/TeRRaAdmin") {
  let path = String(pathname || "/");
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i += 1) {
    if (PARAM_AFTER.has(parts[i - 1]) || AUTO_ID.test(parts[i])) parts[i] = ":id";
  }
  return parts.join("/") || "/";
}

// La pantalla con los modales abiertos encima, del primero al último:
// "/payroll › Detalle de nómina".
export function sectionKey(screen, sections) {
  return [screen, ...(sections || [])].join(" › ");
}

// ¿Registra hoy? La configuración (`readLogConfig/main`) dice si está
// encendido y hasta qué día; sin configuración, no registra.
export function meterEnabled(config, today) {
  return !!config?.enabled && (!config.until || today <= config.until);
}

// Ruta de una colección con los ids de documento como ":id"
// ("cycles/abc/notes" → "cycles/:id/notes").
export function collectionPathOf(path) {
  return String(path || "?")
    .split("/")
    .map((seg, i) => (i % 2 === 1 ? ":id" : seg))
    .join("/");
}

// Forma de una lectura: "workdays · cycleId == · date >= · orden date ·
// límite". `filters` son pares [campo, operador], sin el valor.
export function describeQuery({ collection, doc = false, filters = [], order = [], limit = null }) {
  const parts = [collection || "?"];
  if (doc) parts.push("doc");
  for (const [field, op] of filters) parts.push(`${field} ${op}`);
  for (const field of order) parts.push(`orden ${field}`);
  if (limit != null) parts.push("límite");
  return parts.join(" · ");
}

// Lecturas que cobra Firestore por una respuesta: un documento por cada uno
// devuelto, uno si la consulta vino vacía, y un conteo, uno por cada mil.
export function billedReads(kind, size) {
  const n = Math.max(0, Number(size) || 0);
  if (kind === "count") return Math.max(1, Math.ceil(n / 1000));
  if (kind === "doc") return 1;
  return Math.max(1, n);
}

export function emptyBuffer({ date, userId }) {
  return { date, userId, opens: 0, reads: {}, visits: {}, writes: {}, time: {} };
}

const SECTIONS = ["reads", "visits", "writes", "time"];

export function isEmptyBuffer(buffer) {
  return !buffer || (!buffer.opens && SECTIONS.every((s) => !Object.keys(buffer[s] || {}).length));
}

const hourKey = (hour) => String(hour).padStart(2, "0");

function bump(node, path, field, n) {
  let cur = node;
  for (const key of path) {
    if (!cur[key]) cur[key] = {};
    cur = cur[key];
  }
  cur[field] = (cur[field] || 0) + n;
}

// Una lectura que fue al servidor (`docs` = lecturas cobradas) o que se
// ahorró una caché (`cacheHit`, con los documentos que habría traído).
export function addRead(buffer, { hour, screen, query, docs = 0, cacheHit = false }) {
  const path = [hourKey(hour), screen, query];
  if (cacheHit) {
    bump(buffer.reads, path, "cacheHits", 1);
    bump(buffer.reads, path, "cacheDocs", docs);
  } else {
    bump(buffer.reads, path, "requests", 1);
    bump(buffer.reads, path, "docs", docs);
  }
}

export function addVisit(buffer, { hour, screen }) {
  const key = hourKey(hour);
  if (!buffer.visits[key]) buffer.visits[key] = {};
  buffer.visits[key][screen] = (buffer.visits[key][screen] || 0) + 1;
}

// Segundos con la pantalla visible.
export function addTime(buffer, { hour, screen, seconds }) {
  bump(buffer.time, [hourKey(hour)], screen, seconds);
}

// Una petición de escritura: suma la lectura que cobran las reglas.
export function addWrite(buffer, { hour, screen, collection }) {
  bump(buffer.writes, [hourKey(hour), screen], collection, 1);
}

function mergeCounts(into, from) {
  for (const [key, value] of Object.entries(from || {})) {
    if (typeof value === "number") into[key] = (into[key] || 0) + value;
    else mergeCounts((into[key] = into[key] || {}), value);
  }
  return into;
}

// Junta dos cuentas del mismo día y la misma persona.
export function mergeBuffers(into, from) {
  into.opens += from.opens || 0;
  for (const s of SECTIONS) mergeCounts((into[s] = into[s] || {}), from[s]);
  return into;
}

// Una clave de mapa de Firestore sin "." ni "/", que se leen con
// `decodeURIComponent`.
export const encodeKey = (key) => String(key).replace(/%/g, "%25").replace(/\./g, "%2E").replace(/\//g, "%2F");

// La cuenta como sumas para un `setDoc` con `merge`: cada número pasa por
// `increment`, así varias pestañas suman sobre el mismo documento sin leerlo.
// Una sección vacía no va: con `merge`, un mapa vacío reemplaza al guardado.
export function toIncrements(buffer, increment) {
  const walk = (node) => {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      out[encodeKey(key)] = typeof value === "number" ? increment(value) : walk(value);
    }
    return out;
  };
  const payload = {};
  for (const section of SECTIONS) {
    if (Object.keys(buffer[section] || {}).length) payload[section] = walk(buffer[section]);
  }
  if (buffer.opens) payload.opens = increment(buffer.opens);
  return payload;
}
