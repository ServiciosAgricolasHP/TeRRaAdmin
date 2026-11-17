// Revisiones de las personas de la nómina: su grupo, su ficha y su contrato.
// Cada una devuelve `[{ person, severity, lines }]`.
import { isActiveOn } from "../employment";
import { fmtShortDate } from "../format";
import { newWorkerDefaults } from "../harvestImport";
import { normalizeLeader } from "../payroll";
import { formatRutForDisplay } from "../rutUtils";
import { similarNamePairs } from "../similarity";
import { SEVERITY, dateRanges, listText } from "./checkContext";

// Desde cuánto parecido dos nombres se marcan como la misma persona.
export const SIMILAR_NAME = 0.88;

const leaderNameOf = (d) => normalizeLeader(d?.name || d?.nombre || d?.id);

// Los grupos de la lista, por nombre: `true` si está habilitado.
function leaderCatalog(leaders) {
  const map = new Map();
  for (const d of leaders || []) {
    const name = leaderNameOf(d);
    if (name) map.set(name, map.get(name) || d.habilitado === true);
  }
  return map;
}

const rutText = (r) => formatRutForDisplay(r.item.rut || r.person);

// Sin grupo. En efectivo no tiene sobre.
export function missingGroup(ctx) {
  return ctx.rows
    .filter((r) => !normalizeLeader(r.item.groupLeader))
    .map((r) => ({
      person: r.person,
      severity: r.cash ? SEVERITY.red : SEVERITY.orange,
      lines: [r.cash ? "Sin grupo: cobra en efectivo y no tiene sobre" : "Sin grupo"],
    }));
}

// Un grupo que no está en la lista de líderes (un error de tipeo arma otro
// sobre) o que está deshabilitado. Sin la lista, no revisa.
export function unknownGroup(ctx) {
  if (!ctx.leaders) return [];
  const catalog = leaderCatalog(ctx.leaders);
  const found = [];
  for (const r of ctx.rows) {
    const leader = normalizeLeader(r.item.groupLeader);
    if (!leader || catalog.get(leader) === true) continue;
    const line = catalog.has(leader) ? `El grupo ${leader} está deshabilitado` : `El grupo ${leader} no está en la lista de líderes`;
    found.push({ person: r.person, severity: SEVERITY.orange, lines: [line] });
  }
  return found;
}

// Dos filas que son la misma ficha (rojo) o dos nombres muy parecidos con
// RUT distintos (naranja): puede ser una ficha duplicada.
export function similarNames(ctx) {
  const lines = new Map();
  const severity = new Map();
  const add = (person, line, sev) => {
    if (!lines.has(person)) lines.set(person, []);
    lines.get(person).push(line);
    if (sev === SEVERITY.red || !severity.has(person)) severity.set(person, sev);
  };
  const rows = ctx.rows;
  const firstRow = new Map();
  for (const r of rows) {
    const first = firstRow.get(r.person);
    if (first) add(r.person, `Está dos veces en la nómina: ${rutText(first)} y ${rutText(r)}`, SEVERITY.red);
    else firstRow.set(r.person, r);
  }
  for (const [i, j] of similarNamePairs(rows.map((r) => r.name), SIMILAR_NAME)) {
    const a = rows[i];
    const b = rows[j];
    if (a.person === b.person) continue;
    add(a.person, `Se parece a ${b.name} (${rutText(b)})`, SEVERITY.orange);
    add(b.person, `Se parece a ${a.name} (${rutText(a)})`, SEVERITY.orange);
  }
  return [...lines].map(([person, list]) => ({ person, severity: severity.get(person), lines: list }));
}

// Una fila sin ficha en Trabajadores, o de una ficha unida a otra.
export function missingWorker(ctx) {
  const found = [];
  for (const r of ctx.rows) {
    if (r.rawWorker?.mergedInto) {
      const kept = ctx.workerById.get(r.person);
      found.push({ person: r.person, severity: SEVERITY.red, lines: [`Su ficha está unida a ${kept?.name || "otra ficha"}`] });
    } else if (!r.worker) {
      found.push({ person: r.person, severity: SEVERITY.red, lines: ["Sin ficha en Trabajadores"] });
    }
  }
  return found;
}

const rangeText = ([from, to]) => (from === to ? fmtShortDate(from) : `${fmtShortDate(from)} a ${fmtShortDate(to)}`);

// Días que paga la nómina sin contrato ni honorarios vigentes. Sin la lista
// de contratos, no revisa.
export function withoutEmployment(ctx) {
  if (!ctx.employments) return [];
  const byPerson = new Map();
  for (const e of ctx.employments) {
    const person = ctx.targetOf(e.workerId);
    if (!byPerson.has(person)) byPerson.set(person, []);
    byPerson.get(person).push(e);
  }
  const found = [];
  for (const r of ctx.rows) {
    const periods = byPerson.get(r.person) || [];
    const dates = (ctx.factsByPerson.get(r.person) || []).filter((f) => f.own && !f.piso).map((f) => f.wd.date);
    const missing = [...new Set(dates)].filter((d) => !periods.some((e) => isActiveOn(e, d)));
    if (!missing.length) continue;
    const ranges = dateRanges(missing);
    found.push({ person: r.person, severity: SEVERITY.orange, lines: [`Sin contrato ni honorarios: ${listText(ranges.map(rangeText))}`] });
  }
  return found;
}

// El grupo que se le sugiere a alguien sin grupo: el de su última nómina, el
// más común entre quienes trabajan en sus mismas labores o el que le toca por
// su RUT (la regla de Importar cosecha). Con la lista de líderes, solo uno
// habilitado. `null` si no hay ninguno.
export function suggestGroupLeader(ctx, person) {
  const catalog = ctx.leaders ? leaderCatalog(ctx.leaders) : null;
  const allowed = (name) => !!name && (!catalog || catalog.get(name) === true);

  const last = ctx.historyOf(person).map(({ item }) => normalizeLeader(item.groupLeader)).find(Boolean);
  if (allowed(last)) return { leader: last, reason: "su última nómina" };

  const myLabors = new Set((ctx.factsByPerson.get(person) || []).map((f) => `${f.wd.cycleId}|${f.wd.laborId}`));
  const leaderOfPerson = (p) => normalizeLeader(ctx.rowByPerson.get(p)?.item.groupLeader || ctx.workerById.get(p)?.groupLeader?.[0]);
  const counts = new Map();
  const counted = new Set();
  for (const f of ctx.facts) {
    if (f.person === person || counted.has(f.person) || !myLabors.has(`${f.wd.cycleId}|${f.wd.laborId}`)) continue;
    counted.add(f.person);
    const leader = leaderOfPerson(f.person);
    if (allowed(leader)) counts.set(leader, (counts.get(leader) || 0) + 1);
  }
  const common = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (common) return { leader: common[0], reason: "el de sus compañeros de labor" };

  const rut = ctx.rowByPerson.get(person)?.item.rut || person;
  const byRut = normalizeLeader(newWorkerDefaults(rut).groupLeader);
  return allowed(byRut) ? { leader: byRut, reason: "por su RUT" } : null;
}
