// El estado de una faena según sus ciclos (activa, pausada o cerrada) y el
// tramo dentro de cada estado. Es lo que agrupa y ordena las tarjetas de
// Faenas en la vista "Por estado". Todo sale de los ciclos: no se leen
// jornadas.
import { localIsoDate } from "./dates";
import { millisOf } from "./syncedList";

// Días sin movimiento desde los que una faena con ciclos abiertos cuenta como
// pausada.
export const PAUSED_AFTER_DAYS = 15;
// Días con movimiento que cuentan como "esta semana".
export const RECENT_DAYS = 7;
// Días sin movimiento desde los que una faena pausada se sugiere para cerrar.
export const TO_CLOSE_AFTER_DAYS = 45;
// Días desde la última edición de sus ciclos en que una faena cerrada cuenta
// como recién cerrada.
export const RECENTLY_CLOSED_DAYS = 30;

const ACTIVE = "var(--color-success)";
const PAUSED = "var(--color-warning)";
const CLOSED = "var(--color-muted)";

// Las secciones de la vista "Por estado", en orden. `state` es el estado de
// las faenas que reúne; el archivo parte plegado (`collapsedByDefault`).
export const JOB_STATE_GROUPS = [
  { id: "active-week", state: "active", name: "Activas · esta semana", color: ACTIVE, hint: `Con movimiento en los últimos ${RECENT_DAYS} días` },
  { id: "active-recent", state: "active", name: "Activas · hace poco", color: ACTIVE, hint: `Con el último movimiento hace ${RECENT_DAYS + 1} a ${PAUSED_AFTER_DAYS} días` },
  { id: "paused", state: "paused", name: "Pausadas", color: PAUSED, hint: `Con ciclos abiertos, sin movimiento hace ${PAUSED_AFTER_DAYS + 1} a ${TO_CLOSE_AFTER_DAYS} días` },
  { id: "paused-to-close", state: "paused", name: "Pausadas · para cerrar", color: PAUSED, hint: `Con ciclos abiertos, sin movimiento hace más de ${TO_CLOSE_AFTER_DAYS} días: revisa si hay que cerrarlos` },
  { id: "closed-recent", state: "closed", name: "Cerradas · último mes", color: CLOSED, hint: `Sin ciclos abiertos, con sus ciclos editados o cerrados en los últimos ${RECENTLY_CLOSED_DAYS} días` },
  { id: "closed-archive", state: "closed", name: "Cerradas · archivo", color: CLOSED, hint: `Sin ciclos abiertos desde hace más de ${RECENTLY_CLOSED_DAYS} días`, collapsedByDefault: true },
];

// Cómo se ordenan las faenas dentro de cada sección: por su último movimiento
// o por la última edición de sus ciclos, de la más reciente a la más antigua.
export const JOB_STATE_SORTS = [
  { id: "movement", label: "Último movimiento", hint: "El último día anotado en sus ciclos" },
  { id: "edited", label: "Última edición", hint: "La última vez que se guardó uno de sus ciclos: precios, labores, cerrar o reabrir" },
];

// Días entre dos fechas YYYY-MM-DD (`to` − `from`).
function daysBetween(from, to) {
  const utc = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

// La más reciente de unas fechas YYYY-MM-DD, sin pasar de `today`; "" si no
// hay ninguna.
function latest(dates, today) {
  const max = dates.filter(Boolean).reduce((m, d) => (d > m ? d : m), "");
  return max > today ? today : max;
}

// El último día con movimiento de un ciclo: el último de sus días o, si
// todavía no tiene, su inicio o el día en que se creó.
function lastMovement(cycle) {
  const days = Array.isArray(cycle.days) ? cycle.days : [];
  if (days.length > 0) return days.reduce((max, d) => (d > max ? d : max), days[0]);
  const created = millisOf(cycle.createdAt);
  return cycle.startDate || (created ? localIsoDate(new Date(created)) : "");
}

// El día en que se guardó por última vez un ciclo (`updatedAt`) o, sin él, su
// último movimiento.
function lastEdit(cycle) {
  const ms = millisOf(cycle.updatedAt);
  return ms ? localIsoDate(new Date(ms)) : lastMovement(cycle);
}

const isOpen = (c) => c.status !== "closed";

// `closed` sin ciclos abiertos; `paused` si el último movimiento de todos sus
// ciclos abiertos es anterior a `PAUSED_AFTER_DAYS` días; si no, `active`.
export function jobStateOf(cycles, today) {
  const open = cycles.filter(isOpen);
  if (open.length === 0) return "closed";
  const movement = latest(open.map(lastMovement), today);
  return movement && daysBetween(movement, today) <= PAUSED_AFTER_DAYS ? "active" : "paused";
}

// Las fechas de una faena: su último movimiento (de los ciclos abiertos, o de
// todos si no tiene abiertos) y la última edición de sus ciclos.
export function jobDates(cycles, today) {
  const open = cycles.filter(isOpen);
  return {
    movement: latest((open.length ? open : cycles).map(lastMovement), today),
    edited: latest(cycles.map(lastEdit), today),
  };
}

// La sección de `JOB_STATE_GROUPS` de una faena.
export function jobStateGroupOf(cycles, today) {
  const state = jobStateOf(cycles, today);
  const { movement, edited } = jobDates(cycles, today);
  const age = (iso) => (iso ? daysBetween(iso, today) : Infinity);
  if (state === "active") return age(movement) <= RECENT_DAYS ? "active-week" : "active-recent";
  if (state === "paused") return age(movement) > TO_CLOSE_AFTER_DAYS ? "paused-to-close" : "paused";
  return age(edited) <= RECENTLY_CLOSED_DAYS ? "closed-recent" : "closed-archive";
}

// Las faenas de cada sección, de la más reciente a la más antigua según
// `sortBy` (`movement` o `edited`; las que no tienen fecha van al final, en el
// orden en que vienen), y la fecha de cada una (`dateOf`, por id).
export function jobsByStateGroup(jobs, cycles, today, sortBy = "movement") {
  const cyclesByJob = new Map();
  for (const c of cycles) {
    if (!cyclesByJob.has(c.faenaId)) cyclesByJob.set(c.faenaId, []);
    cyclesByJob.get(c.faenaId).push(c);
  }
  const jobsByGroup = Object.fromEntries(JOB_STATE_GROUPS.map((g) => [g.id, []]));
  const dateOf = {};
  for (const job of jobs) {
    const jobCycles = cyclesByJob.get(job.id) || [];
    const dates = jobDates(jobCycles, today);
    dateOf[job.id] = sortBy === "edited" ? dates.edited : dates.movement;
    jobsByGroup[jobStateGroupOf(jobCycles, today)].push(job);
  }
  for (const id of Object.keys(jobsByGroup)) {
    jobsByGroup[id].sort((a, b) => (dateOf[b.id] || "").localeCompare(dateOf[a.id] || ""));
  }
  return { jobsByGroup, dateOf };
}

// "hoy", "ayer", "hace 5 días" o "hace 3 meses" desde `iso` hasta `today`;
// "" sin fecha.
export function sinceLabel(iso, today) {
  if (!iso) return "";
  const days = daysBetween(iso, today);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 60) return `hace ${days} días`;
  return `hace ${Math.floor(days / 30)} meses`;
}
