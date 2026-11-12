// El estado de una faena según sus ciclos: activa, pausada o cerrada. Es lo
// que agrupa las tarjetas de Faenas en la vista "Por estado".
import { timestampIso } from "./syncedList";

// Días sin movimiento desde los que una faena con ciclos abiertos cuenta como
// pausada.
export const PAUSED_AFTER_DAYS = 15;

export const JOB_STATES = [
  { id: "active", name: "Activas", color: "var(--color-success)", hint: `Con ciclos abiertos y movimiento en los últimos ${PAUSED_AFTER_DAYS} días` },
  { id: "paused", name: "Pausadas", color: "var(--color-warning)", hint: `Con ciclos abiertos, sin movimiento hace más de ${PAUSED_AFTER_DAYS} días` },
  { id: "closed", name: "Cerradas", color: "var(--color-muted)", hint: "Sin ciclos abiertos" },
];

// `days` días antes de `isoDate` (YYYY-MM-DD).
function daysBefore(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

// El último día con movimiento de un ciclo: el último de sus días o, si
// todavía no tiene, su inicio o el día en que se creó.
function lastMovement(cycle) {
  const days = Array.isArray(cycle.days) ? cycle.days : [];
  if (days.length > 0) return days.reduce((max, d) => (d > max ? d : max), days[0]);
  return cycle.startDate || timestampIso(cycle.createdAt).slice(0, 10) || "";
}

// `closed` sin ciclos abiertos; `paused` si el último movimiento de todos sus
// ciclos abiertos es anterior a `PAUSED_AFTER_DAYS` días; si no, `active`.
export function jobStateOf(cycles, today) {
  const open = cycles.filter((c) => c.status !== "closed");
  if (open.length === 0) return "closed";
  const limit = daysBefore(today, PAUSED_AFTER_DAYS);
  return open.some((c) => lastMovement(c) >= limit) ? "active" : "paused";
}

// Las faenas de cada estado, en el orden en que vienen.
export function jobsByState(jobs, cycles, today) {
  const cyclesByJob = new Map();
  for (const c of cycles) {
    if (!cyclesByJob.has(c.faenaId)) cyclesByJob.set(c.faenaId, []);
    cyclesByJob.get(c.faenaId).push(c);
  }
  const out = Object.fromEntries(JOB_STATES.map((s) => [s.id, []]));
  for (const job of jobs) out[jobStateOf(cyclesByJob.get(job.id) || [], today)].push(job);
  return out;
}
