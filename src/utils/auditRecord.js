// Cálculo del buscador por registro de la Auditoría: el rango de fechas del
// historial, qué registros cuentan como abiertos, el nombre legible de una
// jornada y el enlace para crear un índice que falta.

// Los rangos del historial de un registro. `days` cuenta el día de hoy; el
// personalizado va de un día a otro, con `MAX_CUSTOM_DAYS` como máximo.
export const RECORD_RANGES = [
  { id: "today", label: "Hoy", days: 1 },
  { id: "7d", label: "7 días", days: 7 },
  { id: "30d", label: "30 días", days: 30 },
  { id: "custom", label: "Personalizado", days: null },
];

export const MAX_CUSTOM_DAYS = 30;

const parseDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const nextDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

// Por qué no sirve un rango personalizado (`from` y `to`, YYYY-MM-DD, los dos
// incluidos), o "" si sirve.
export function customRangeError(from, to) {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start || !end) return "Elige el día de inicio y el de término.";
  if (start > end) return "El inicio va antes del término.";
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days > MAX_CUSTOM_DAYS) return `El rango puede abarcar hasta ${MAX_CUSTOM_DAYS} días (este abarca ${days}).`;
  return "";
}

// Los límites de un rango: desde la medianoche local del primer día
// (`since`) hasta la del día siguiente al último (`until`, sin incluir).
// `null` si el rango personalizado no sirve.
export function rangeBounds(rangeId, now = new Date(), custom = {}) {
  if (rangeId === "custom") {
    if (customRangeError(custom.from, custom.to)) return null;
    return { since: parseDay(custom.from), until: nextDay(parseDay(custom.to)) };
  }
  const range = RECORD_RANGES.find((r) => r.id === rangeId) || RECORD_RANGES[0];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { since: new Date(today.getFullYear(), today.getMonth(), today.getDate() - (range.days - 1)), until: nextDay(today) };
}

// El enlace de la consola de Firebase para crear el índice compuesto que pide
// una consulta, o `null` si el error es otro.
export function indexLinkOf(err) {
  if (err?.code !== "failed-precondition") return null;
  const match = /https:\/\/console\.firebase\.google\.com\S+/.exec(String(err.message || ""));
  return match ? match[0] : null;
}

// Si un registro sigue abierto: el ciclo sin cerrar, la faena o subfaena con
// algún ciclo abierto, el transportista activo y el trabajador que no se unió
// a otra ficha. Los demás tipos cuentan siempre como abiertos.
export function isOpenRecord(entityType, doc, cycles = []) {
  if (!doc) return false;
  switch (entityType) {
    case "worker":
      return !doc.mergedInto;
    case "cycle":
      return doc.status !== "closed";
    case "carrier":
      return doc.active !== false;
    case "faena":
      return cycles.some((c) => c.faenaId === doc.id && c.status !== "closed");
    case "subfaena":
      return cycles.some((c) => c.subfaenaId === doc.id && c.status !== "closed");
    default:
      return true;
  }
}

// Los tipos que separan lo abierto de lo cerrado.
export const hasOpenFilter = (entityType) => ["worker", "cycle", "carrier", "faena", "subfaena"].includes(entityType);

const MONTHS_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${Number(m[3])}-${MONTHS_ABBR[Number(m[2]) - 1]}` : String(iso || "");
};

// El nombre de una jornada a partir de su id (`cycleId__laborId__rut__date[__ck]`):
// "Poda · Ciclo 6 · 12-nov · Ana Rojas". La labor y el ciclo salen de
// `cyclesById`; la persona, de `workersById` (por id o por RUT). Lo que ya se
// sabe por el registro elegido (`omit.cycleId`, `omit.workerKey`) no se
// repite. `null` si el id no es de una jornada.
export function workdayLabel(id, { cyclesById = {}, workersById = {} } = {}, omit = {}) {
  const parts = String(id || "").split("__");
  if (parts.length < 4) return null;
  const [cycleId, laborId, workerKey, date] = parts;
  const cycle = cyclesById[cycleId];
  const labor = (cycle?.labors || []).find((l) => l.id === laborId);
  const worker = workersById[workerKey];
  return [
    labor?.name || null,
    omit.cycleId === cycleId ? null : cycle?.label || null,
    shortDate(date),
    omit.workerKey === workerKey ? null : worker?.name || workerKey,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Los mapas que usa `workdayLabel`, desde las listas de ciclos y trabajadores.
export function workdayLabelContext(cycles = [], workers = []) {
  const cyclesById = {};
  for (const c of cycles) cyclesById[c.id] = c;
  const workersById = {};
  for (const w of workers) {
    if (w.rut) workersById[w.rut] = w;
    workersById[w.id] = w;
  }
  return { cyclesById, workersById };
}

// Lo que abarca el historial de una faena o subfaena: los ciclos (los abiertos
// y los cerrados) y, en una faena, sus subfaenas. Otro tipo no abarca nada más.
export function recordScope(entityType, id, { cycles = [], subjobs = [] } = {}) {
  if (entityType === "faena") {
    return {
      cycleIds: cycles.filter((c) => c.faenaId === id).map((c) => c.id),
      subjobIds: subjobs.filter((s) => s.faenaId === id).map((s) => s.id),
    };
  }
  if (entityType === "subfaena") return { cycleIds: cycles.filter((c) => c.subfaenaId === id).map((c) => c.id), subjobIds: [] };
  return { cycleIds: [], subjobIds: [] };
}

// Quién hizo un cambio: el nombre con que firma o, en los registros
// anteriores, el correo hasta la @.
export function logAuthor(log) {
  if (log?.userName) return log.userName;
  if (log?.email) return String(log.email).split("@")[0];
  return log?.uid || "—";
}

const dateOf = (ts) => {
  if (!ts) return new Date();
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  return new Date(ts);
};
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// El día local (YYYY-MM-DD) de un log.
export const logDay = (log) => localDay(dateOf(log.timestamp));

const countDesc = (map, keyName) =>
  [...map.entries()].map(([k, count]) => ({ [keyName]: k, count })).sort((a, b) => b.count - a.count);

// El resumen de un historial: cuántas acciones hubo por tipo de registro (y,
// dentro, por acción), por quién y por día, de mayor a menor (los días, del
// más nuevo al más viejo).
export function recordSummary(logs = []) {
  const byEntity = new Map();
  const byAuthor = new Map();
  const byDay = new Map();
  for (const log of logs) {
    const entity = log.entity || "?";
    if (!byEntity.has(entity)) byEntity.set(entity, new Map());
    const actions = byEntity.get(entity);
    actions.set(log.action, (actions.get(log.action) || 0) + 1);
    const who = logAuthor(log);
    byAuthor.set(who, (byAuthor.get(who) || 0) + 1);
    const day = logDay(log);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  const entities = [...byEntity.entries()]
    .map(([entity, actions]) => {
      const list = countDesc(actions, "action");
      return { entity, count: list.reduce((s, a) => s + a.count, 0), actions: list };
    })
    .sort((a, b) => b.count - a.count);
  return {
    total: logs.length,
    byEntity: entities,
    byAuthor: countDesc(byAuthor, "who"),
    byDay: countDesc(byDay, "day").sort((a, b) => b.day.localeCompare(a.day)),
  };
}

// Los logs agrupados por día y, dentro del día, por quién hizo el cambio, en
// el orden en que vienen (del más nuevo al más viejo). Cada log lleva su
// posición en la lista (`index`).
export function groupLogsByDayAndAuthor(logs = []) {
  const groups = [];
  logs.forEach((log, index) => {
    const day = logDay(log);
    const who = logAuthor(log);
    const last = groups[groups.length - 1];
    if (last && last.day === day && last.who === who) last.items.push({ log, index });
    else groups.push({ key: `${day}|${who}|${index}`, day, who, items: [{ log, index }] });
  });
  return groups;
}
