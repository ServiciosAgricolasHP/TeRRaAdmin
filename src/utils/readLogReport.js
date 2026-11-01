// Informe del registro de lecturas: junta los documentos de `readLogs` de un
// rango (uno por persona, día y entorno; ver services/readMeter.js) por
// pantalla, consulta, colección, hora y persona. Las claves vienen
// codificadas con `encodeKey` (utils/readMeterKeys.js).
import { fmtDuration } from "./auditLogs";
import { fmtNumber, fmtPercent } from "./format";
import { isAdminRole } from "./userAccounts";

// Lecturas por día que Firestore no cobra.
export const FREE_DAILY_READS = 50_000;

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const SECTION_SEPARATOR = " › ";

export function decodeKey(key) {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

const emptyReads = () => ({ requests: 0, docs: 0, cacheHits: 0, cacheDocs: 0 });
const emptyMetrics = () => ({ ...emptyReads(), visits: 0, seconds: 0, writes: 0 });

function addReads(into, counts) {
  into.requests += counts.requests || 0;
  into.docs += counts.docs || 0;
  into.cacheHits += counts.cacheHits || 0;
  into.cacheDocs += counts.cacheDocs || 0;
  return into;
}

const byDocs = (a, b) => b.docs - a.docs || b.cacheDocs - a.cacheDocs;

// Cada lectura de un documento, con sus claves ya decodificadas.
function eachRead(log, fn) {
  for (const [hour, screens] of Object.entries(log.reads || {})) {
    for (const [screen, queries] of Object.entries(screens || {})) {
      for (const [query, counts] of Object.entries(queries || {})) {
        fn({ hour: Number(decodeKey(hour)), screen: decodeKey(screen), query: decodeKey(query), counts });
      }
    }
  }
}

// Visitas o segundos: `{hora: {pantalla: n}}`.
function eachCount(map, fn) {
  for (const [hour, screens] of Object.entries(map || {})) {
    for (const [screen, n] of Object.entries(screens || {})) {
      fn({ hour: Number(decodeKey(hour)), screen: decodeKey(screen), n: Number(n) || 0 });
    }
  }
}

function eachWrite(log, fn) {
  for (const [hour, screens] of Object.entries(log.writes || {})) {
    for (const [screen, collections] of Object.entries(screens || {})) {
      for (const [collection, n] of Object.entries(collections || {})) {
        fn({ hour: Number(decodeKey(hour)), screen: decodeKey(screen), collection: decodeKey(collection), n: Number(n) || 0 });
      }
    }
  }
}

// La colección de una consulta: "workdays · cycleId ==" → "workdays".
export const collectionOfQuery = (query) => String(query).split(" · ")[0];

// `person`: "all", "noAdmins" o el uid de una persona. `env`: "prod", "local"
// o "all". Los admin salen de `profiles` (los documentos de `users`).
export function filterLogs(logs, { person = "all", env = "prod", profiles = [] } = {}) {
  const admins = new Set(profiles.filter((p) => isAdminRole(p.role)).map((p) => p.id));
  return (logs || []).filter((log) => {
    if (env !== "all" && (log.env || "prod") !== env) return false;
    if (person === "noAdmins") return !admins.has(log.userId);
    if (person !== "all") return log.userId === person;
    return true;
  });
}

// Lecturas cobradas por visita y por minuto con la pantalla visible; `null`
// sin visitas o sin tiempo.
export function ratesOf({ docs, visits, seconds }) {
  return {
    perVisit: visits ? docs / visits : null,
    perMinute: seconds ? docs / (seconds / 60) : null,
  };
}

export function reportTotals(logs) {
  const totals = { ...emptyMetrics(), opens: 0, people: 0, days: 0 };
  const people = new Set();
  const days = new Set();
  for (const log of logs) {
    totals.opens += log.opens || 0;
    people.add(log.userId);
    days.add(log.date);
    eachRead(log, ({ counts }) => addReads(totals, counts));
    eachCount(log.visits, ({ n }) => { totals.visits += n; });
    eachCount(log.time, ({ n }) => { totals.seconds += n; });
    eachWrite(log, ({ n }) => { totals.writes += n; });
  }
  totals.people = people.size;
  totals.days = days.size;
  return totals;
}

// Un día por fila, del más antiguo al más nuevo.
export function readsByDay(logs) {
  const days = new Map();
  for (const log of logs) {
    if (!days.has(log.date)) days.set(log.date, { date: log.date, ...emptyReads(), writes: 0, people: new Set() });
    const day = days.get(log.date);
    day.people.add(log.userId);
    eachRead(log, ({ counts }) => addReads(day, counts));
    eachWrite(log, ({ n }) => { day.writes += n; });
  }
  return [...days.values()]
    .map((day) => ({ ...day, people: day.people.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sortedQueries(queries) {
  return [...queries.values()].sort(byDocs);
}

// Una fila por pantalla, con sus modales marcados en `sections`. La fila de
// la pantalla suma lo de sus modales, salvo las visitas, que son las de la
// ruta (abrir un modal cuenta en su sección). `queries` son las de la
// pantalla misma, sin las de sus modales.
export function readsByScreen(logs) {
  const keys = new Map();
  const nodeOf = (key) => {
    if (!keys.has(key)) keys.set(key, { key, ...emptyMetrics(), queries: new Map() });
    return keys.get(key);
  };
  for (const log of logs) {
    eachRead(log, ({ screen, query, counts }) => {
      const node = nodeOf(screen);
      addReads(node, counts);
      if (!node.queries.has(query)) node.queries.set(query, { query, ...emptyReads() });
      addReads(node.queries.get(query), counts);
    });
    eachCount(log.visits, ({ screen, n }) => { nodeOf(screen).visits += n; });
    eachCount(log.time, ({ screen, n }) => { nodeOf(screen).seconds += n; });
    eachWrite(log, ({ screen, n }) => { nodeOf(screen).writes += n; });
  }

  const screens = new Map();
  for (const node of keys.values()) {
    const [screen, ...rest] = node.key.split(SECTION_SEPARATOR);
    if (!screens.has(screen)) screens.set(screen, { screen, ...emptyMetrics(), queries: [], sections: [] });
    const row = screens.get(screen);
    addReads(row, node);
    row.seconds += node.seconds;
    row.writes += node.writes;
    if (rest.length) {
      row.sections.push({ ...node, label: rest.join(SECTION_SEPARATOR), queries: sortedQueries(node.queries) });
    } else {
      row.visits += node.visits;
      row.queries = sortedQueries(node.queries);
    }
  }
  return [...screens.values()]
    .map((row) => ({ ...row, sections: row.sections.sort(byDocs) }))
    .sort(byDocs);
}

// Una fila por forma de consulta, con las pantallas donde se pidió.
export function readsByQuery(logs) {
  const queries = new Map();
  for (const log of logs) {
    eachRead(log, ({ screen, query, counts }) => {
      if (!queries.has(query)) {
        queries.set(query, { query, collection: collectionOfQuery(query), ...emptyReads(), screens: new Map() });
      }
      const row = queries.get(query);
      addReads(row, counts);
      if (!row.screens.has(screen)) row.screens.set(screen, { screen, ...emptyReads() });
      addReads(row.screens.get(screen), counts);
    });
  }
  return [...queries.values()]
    .map((row) => ({ ...row, screens: [...row.screens.values()].sort(byDocs) }))
    .sort(byDocs);
}

// Lecturas y escrituras por colección, para comparar con la consola de
// Google Cloud: la diferencia es lo que leen el escáner, las Cloud Functions
// y la consola de Firebase.
export function readsByCollection(logs) {
  const collections = new Map();
  const rowOf = (collection) => {
    if (!collections.has(collection)) collections.set(collection, { collection, ...emptyReads(), writes: 0 });
    return collections.get(collection);
  };
  for (const log of logs) {
    eachRead(log, ({ query, counts }) => addReads(rowOf(collectionOfQuery(query)), counts));
    eachWrite(log, ({ collection, n }) => { rowOf(collection).writes += n; });
  }
  return [...collections.values()].sort((a, b) => byDocs(a, b) || b.writes - a.writes);
}

// Día de la semana de una fecha `YYYY-MM-DD`, con el lunes en 0.
export function weekdayOf(iso) {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
}

// Lecturas cobradas por hora (filas, 0 a 23) y día de la semana (columnas,
// lunes a domingo), con la hora del navegador de cada persona.
export function readsByHour(logs) {
  const grid = Array.from({ length: 24 }, () => Array(7).fill(0));
  for (const log of logs) {
    const day = weekdayOf(log.date);
    eachRead(log, ({ hour, counts }) => {
      if (hour >= 0 && hour < 24) grid[hour][day] += counts.docs || 0;
    });
  }
  const max = Math.max(0, ...grid.flat());
  return { grid, max };
}

// El nombre con que se muestra una persona: el alias, el correo o el
// principio del uid.
export function personName(profile, userId) {
  return profile?.alias || profile?.email || `${String(userId || "?").slice(0, 6)}…`;
}

export function readsByPerson(logs, profiles = []) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const people = new Map();
  for (const log of logs) {
    if (!people.has(log.userId)) {
      const profile = byId.get(log.userId);
      people.set(log.userId, {
        userId: log.userId,
        name: personName(profile, log.userId),
        admin: isAdminRole(profile?.role),
        opens: 0,
        ...emptyMetrics(),
        days: new Set(),
        versions: new Set(),
      });
    }
    const row = people.get(log.userId);
    row.opens += log.opens || 0;
    row.days.add(log.date);
    if (log.appVersion) row.versions.add(log.appVersion);
    eachRead(log, ({ counts }) => addReads(row, counts));
    eachCount(log.visits, ({ n }) => { row.visits += n; });
    eachCount(log.time, ({ n }) => { row.seconds += n; });
    eachWrite(log, ({ n }) => { row.writes += n; });
  }
  return [...people.values()]
    .map((row) => ({ ...row, days: row.days.size, versions: [...row.versions].sort() }))
    .sort((a, b) => byDocs(a, b) || a.name.localeCompare(b.name));
}

// Lo que se baja en JSON: los registros tal cual, el rango, los filtros y, de
// cada persona, solo su uid y si es admin (sin nombre ni correo).
export function exportPayload({ logs, profiles = [], from, to, person, env, exportedAt }) {
  const admins = new Set(profiles.filter((p) => isAdminRole(p.role)).map((p) => p.id));
  const people = [...new Set(logs.map((l) => l.userId))].map((userId) => ({ userId, admin: admins.has(userId) }));
  return { format: "terra-read-logs", version: 1, exportedAt, range: { from, to }, filters: { person, env }, people, logs };
}

const SCREENS_IN_TEXT = 25;
const QUERIES_IN_TEXT = 30;
const QUERIES_PER_SCREEN = 8;

const dash = (n) => (n ? fmtNumber(n) : "—");
const rate = (v) => (v == null ? "—" : fmtNumber(Math.round(v)));
const duration = (seconds) => (seconds ? fmtDuration(seconds * 1000) : "—");

function table(header, rows) {
  return [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)];
}

// El informe en texto (tablas de Markdown), para pegarlo en un mensaje: los
// totales, cada día, las pantallas con sus modales, las consultas de cada
// una, y las consultas y colecciones que más leen. `filters` describe los
// filtros aplicados ("Producción · Sin los admin").
export function reportText({ logs, from, to, filters = "" }) {
  const totals = reportTotals(logs);
  const share = (n) => (totals.docs ? fmtPercent((100 * n) / totals.docs, 1) : "—");
  const screens = readsByScreen(logs).slice(0, SCREENS_IN_TEXT);
  const lines = [
    `# Informe de lecturas, del ${from} al ${to}${filters ? ` (${filters})` : ""}`,
    "",
    `Lecturas cobradas: ${fmtNumber(totals.docs)} · ahorradas por caché: ${fmtNumber(totals.cacheDocs)} · escrituras: ${fmtNumber(totals.writes)} · visitas: ${fmtNumber(totals.visits)} · tiempo: ${duration(totals.seconds)} · personas: ${totals.people}`,
    "",
    "## Por día",
    "",
    ...table(
      ["Día", "Lecturas", "Ahorro caché", "Escrituras", "Personas"],
      readsByDay(logs).map((d) => [`${WEEKDAYS[weekdayOf(d.date)]} ${d.date}`, fmtNumber(d.docs), dash(d.cacheDocs), dash(d.writes), d.people]),
    ),
    "",
    "## Pantallas",
    "",
    "La fila de una pantalla suma sus modales (› debajo); sus visitas son las de la ruta.",
    "",
    ...table(
      ["Pantalla", "Visitas", "Tiempo", "Lecturas", "%", "Por visita", "Por minuto", "Ahorro caché"],
      screens.flatMap((screen) =>
        [screen, ...screen.sections].map((row) => {
          const { perVisit, perMinute } = ratesOf(row);
          const name = row.label ? `› ${row.label}` : screen.screen;
          return [name, fmtNumber(row.visits), duration(row.seconds), fmtNumber(row.docs), share(row.docs), rate(perVisit), rate(perMinute), dash(row.cacheDocs)];
        }),
      ),
    ),
    "",
    "## Consultas de cada pantalla",
    "",
  ];
  for (const screen of screens) {
    for (const row of [screen, ...screen.sections]) {
      if (!row.queries.length) continue;
      lines.push(`**${row.label ? `${screen.screen} › ${row.label}` : `${screen.screen} (sin sus modales)`}**`, "");
      for (const q of row.queries.slice(0, QUERIES_PER_SCREEN)) {
        lines.push(`- \`${q.query}\`: ${fmtNumber(q.docs)} en ${fmtNumber(q.requests)} peticiones${q.cacheDocs ? `, caché ${fmtNumber(q.cacheDocs)}` : ""}`);
      }
      if (row.queries.length > QUERIES_PER_SCREEN) lines.push(`- y ${row.queries.length - QUERIES_PER_SCREEN} más`);
      lines.push("");
    }
  }
  lines.push(
    "## Consultas",
    "",
    ...table(
      ["Consulta", "Peticiones", "Lecturas", "%", "Por petición", "Ahorro caché", "Pantallas"],
      readsByQuery(logs).slice(0, QUERIES_IN_TEXT).map((q) => [
        `\`${q.query}\``,
        fmtNumber(q.requests),
        fmtNumber(q.docs),
        share(q.docs),
        rate(q.requests ? q.docs / q.requests : null),
        dash(q.cacheDocs),
        q.screens.length,
      ]),
    ),
    "",
    "## Colecciones",
    "",
    ...table(
      ["Colección", "Lecturas", "%", "Peticiones", "Ahorro caché", "Escrituras"],
      readsByCollection(logs).map((c) => [`\`${c.collection}\``, fmtNumber(c.docs), share(c.docs), fmtNumber(c.requests), dash(c.cacheDocs), dash(c.writes)]),
    ),
  );
  return lines.join("\n");
}
