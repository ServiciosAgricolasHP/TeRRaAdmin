// Revisiones de las personas de la nómina: su grupo, su ficha y su contrato.
// Cada una devuelve `[{ person, severity, lines }]`.
import { isActiveOn } from "../employment";
import { fmtShortDate } from "../format";
import { newWorkerDefaults } from "../harvestImport";
import { leaderIndex as leaderCatalog } from "../groupLeaders";
import { normalizeLeader } from "../payroll";
import { formatRutForDisplay } from "../rutUtils";
import { nameSearchOf, similarNamePairs } from "../similarity";
import { SEVERITY, dateRanges, laborText, listText, severityRank, worstSeverity } from "./checkContext";

// Desde cuánto parecido letra por letra se marcan dos nombres de la nómina.
// Además, palabra por palabra, dos tercios del nombre más corto y al menos dos
// palabras (`nameSearchOf`), contra todas las personas que se comparan.
export const SIMILAR_NAME = 0.88;
// En cuántas nóminas anteriores se mira quién cobraba.
export const RECENT_PAYROLLS = 3;

const rutText = (r) => formatRutForDisplay(r.item.rut || r.person);
const rangeText = ([from, to]) => (from === to ? fmtShortDate(from) : `${fmtShortDate(from)} a ${fmtShortDate(to)}`);
const daysText = (dates) => listText(dateRanges([...dates]).map(rangeText));

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
// sobre) o que está deshabilitado. El que no está va también en
// `missingLeader`, para agregarlo a la lista. Sin la lista, no revisa.
export function unknownGroup(ctx) {
  if (!ctx.leaders) return [];
  const catalog = leaderCatalog(ctx.leaders);
  const found = [];
  for (const r of ctx.rows) {
    const leader = normalizeLeader(r.item.groupLeader);
    if (!leader || catalog.get(leader) === true) continue;
    if (catalog.has(leader)) found.push({ person: r.person, severity: SEVERITY.orange, lines: [`El grupo ${leader} está deshabilitado`] });
    else found.push({ person: r.person, severity: SEVERITY.orange, lines: [`El grupo ${leader} no está en la lista de líderes`], missingLeader: leader });
  }
  return found;
}

// Las personas contra las que se compara cada nombre de la nómina: las de la
// nómina, las que tienen días en los ciclos abiertos y las que cobraron en las
// últimas nóminas. `recent` dice en cuáles cobró cada una.
function peopleInPlay(ctx, rows) {
  const people = new Map();
  const put = (person, name, rut) => {
    if (person && name && !people.has(person)) people.set(person, { person, name, rut: rut || person });
  };
  const nameOf = (person, fallback) => ctx.workerById.get(person)?.name || fallback;
  for (const r of rows) put(r.person, r.name, r.item.rut);
  for (const f of ctx.facts) put(f.person, nameOf(f.person, f.wd.workerName), f.wd.workerRut);
  const recent = new Map();
  for (const payroll of ctx.previousPayrolls.slice(0, RECENT_PAYROLLS)) {
    const name = payroll.name || "otra nómina";
    for (const item of payroll.items || []) {
      const person = ctx.personOfItem(item);
      put(person, nameOf(person, item.name), item.rut);
      if (!recent.has(person)) recent.set(person, []);
      if (!recent.get(person).includes(name)) recent.get(person).push(name);
    }
  }
  return { people, recent };
}

// Los días de una persona en cada labor de un ciclo, sin el piso solo.
function daysByLabor(facts) {
  const byLabor = new Map();
  for (const f of facts || []) {
    if (f.piso) continue;
    const key = `${f.wd.cycleId}|${f.wd.laborId}`;
    if (!byLabor.has(key)) byLabor.set(key, { fact: f, dates: new Set() });
    byLabor.get(key).dates.add(f.wd.date);
  }
  return byLabor;
}

// Lo que se ve de una persona de la nómina (`mine`) y otra con nombre
// parecido (`theirs`): `[{ severity, line }]`, más fuerte cuanto más se nota
// que un día pudo quedar en la ficha equivocada.
function pairFindings(ctx, mine, theirs, { recent, inPayroll }) {
  const other = `${theirs.name} (${formatRutForDisplay(theirs.rut)})`;
  const myDays = daysByLabor(ctx.factsByPerson.get(mine.person));
  const theirDays = daysByLabor(ctx.factsByPerson.get(theirs.person));
  const found = [];
  const together = [];
  for (const [key, own] of myDays) {
    const their = theirDays.get(key);
    if (!their) continue;
    if ([...own.dates].some((d) => their.dates.has(d))) {
      together.push(laborText(own.fact));
      continue;
    }
    found.push({
      severity: SEVERITY.red,
      line: `En ${laborText(own.fact)} no coinciden nunca: ${other} tiene ${daysText(their.dates)} y esta persona ${daysText(own.dates)}. Un día puede haber quedado en la ficha equivocada`,
    });
  }
  if (together.length) {
    found.push({ severity: SEVERITY.orange, line: `Trabaja en ${listText(together)} con ${other}: revisa que cada día esté en la ficha que corresponde` });
  }
  if (found.length) return found;
  if (inPayroll.has(theirs.person)) return [{ severity: SEVERITY.info, line: `Nombre parecido a ${other}, que también está en esta nómina` }];
  if (theirDays.size) {
    const cycles = [...new Set([...theirDays.values()].map((d) => d.fact.cycle?.label || "otro ciclo"))];
    return [{ severity: SEVERITY.info, line: `Nombre parecido a ${other}, que tiene días en ${listText(cycles)}` }];
  }
  const paid = recent.get(theirs.person);
  if (!paid) return [];
  if (!recent.has(mine.person)) {
    return [{ severity: SEVERITY.red, line: `${other} cobró en ${listText(paid)} y esta vez no tiene días, y esta persona no estaba en esas nóminas: sus días pueden haber quedado en esta ficha` }];
  }
  return [{ severity: SEVERITY.info, line: `Nombre parecido a ${other}, que cobró en ${listText(paid)} y esta vez no tiene días` }];
}

// Una persona de la nómina con un nombre parecido al de otra: si la
// asistencia no trae RUT, un día de una puede quedar en la ficha de la otra.
// Se compara con las de la nómina, las que tienen días en los ciclos
// abiertos y las que cobraron en las últimas nóminas (`peopleInPlay`):
// - rojo si en una labor se reparten los días sin coincidir nunca, o si la
//   otra cobraba, esta vez no tiene días y esta persona no estaba;
// - naranja si trabajan en la misma labor;
// - blanco si la otra tiene días en otra labor, está en la nómina o cobró
//   antes junto con esta.
// Dos filas de la misma ficha también van aquí, en rojo.
export function similarNames(ctx) {
  const found = new Map();
  const add = (person, severity, line) => {
    if (!found.has(person)) found.set(person, []);
    if (!found.get(person).some((f) => f.line === line)) found.get(person).push({ severity, line });
  };
  const firstRow = new Map();
  for (const r of ctx.rows) {
    const first = firstRow.get(r.person);
    if (first) add(r.person, SEVERITY.red, `Está dos veces en la nómina: ${rutText(first)} y ${rutText(r)}`);
    else firstRow.set(r.person, r);
  }
  const rows = [...firstRow.values()];
  const inPayroll = new Set(firstRow.keys());
  const { people, recent } = peopleInPlay(ctx, rows);

  const pairs = new Map();
  const pair = (a, b) => {
    if (a === b) return;
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!inPayroll.has(x)) continue;
      if (!pairs.has(x)) pairs.set(x, new Set());
      pairs.get(x).add(y);
    }
  };
  for (const [i, j] of similarNamePairs(rows.map((r) => r.name), SIMILAR_NAME)) pair(rows[i].person, rows[j].person);
  const search = nameSearchOf([...people.values()]);
  for (const r of rows) for (const { worker } of search(r.name)) pair(r.person, worker.person);

  for (const r of rows) {
    const mine = people.get(r.person);
    for (const other of pairs.get(r.person) || []) {
      const theirs = people.get(other);
      if (!mine || !theirs) continue;
      for (const { severity, line } of pairFindings(ctx, mine, theirs, { recent, inPayroll })) add(r.person, severity, line);
    }
  }
  return [...found].map(([person, list]) => {
    const sorted = [...list].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
    return { person, severity: worstSeverity(sorted.map((f) => f.severity)), lines: sorted.map((f) => f.line) };
  });
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
