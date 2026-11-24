// Lo que comparten las revisiones de la nómina: quién es cada persona, de qué
// ciclo y labor es cada jornada, qué paga la nómina y qué le pagaron antes.
// Sirve igual con las jornadas completas (Generar) y con las del JSON de la
// nómina (el detalle), que no traen `workerId`, `pisoOnly` ni
// `attendanceOnly`: la persona sale del RUT guardado, el piso del id de la
// jornada y la asistencia de la marca de sueldo mensual de la labor.
import { isCashBank } from "../banks";
import { getTratoTierTotals, isFloorKey, workdayComboKeyOf } from "../cosechaCombos";
import { workdayPayAmount } from "../payroll";
import { millisOf } from "../syncedList";
import { mergedTargetResolver } from "../workerMerge";
import { workerIdResolver } from "../workerRut";

export const SEVERITY = { red: "red", orange: "orange", info: "info" };
export const SEVERITY_ORDER = [SEVERITY.red, SEVERITY.orange, SEVERITY.info];
// Cómo se ve cada nivel, en pantalla y en el texto que se copia.
export const SEVERITY_ICON = { red: "🔴", orange: "🟠", info: "⚪" };

// Las labores que se pagan por día: dos el mismo día son dos días completos.
export const DAY_LABOR_TYPES = new Set(["main", "supervision", "extra", "tratoHE"]);
// Las que se pagan por lo que se produce: su cantidad es la que se compara.
export const PRODUCTION_LABOR_TYPES = new Set(["cosecha", "trato", "tratoEtapas"]);

export const severityRank = (s) => {
  const i = SEVERITY_ORDER.indexOf(s);
  return i < 0 ? SEVERITY_ORDER.length : i;
};
export const worstSeverity = (list) => [...list].sort((a, b) => severityRank(a) - severityRank(b))[0] || SEVERITY.info;

// Milisegundos de una fecha de creación: un Timestamp (o su forma guardada en
// el navegador), un Date, un texto ISO o un número.
function timeOf(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value instanceof Date) return value.getTime();
  return millisOf(value);
}

// Las personas de una labor marcadas con sueldo mensual, por RUT o id.
function monthlyKeysOf(labor) {
  const keys = new Set();
  for (const lw of labor?.workers || []) {
    if (!lw?.monthly) continue;
    if (lw.rut) keys.add(lw.rut);
    if (lw.id) keys.add(lw.id);
  }
  return keys;
}

// `items`: las filas que paga la nómina (en Generar, solo las incluidas).
// `workdays`: las jornadas de esas filas. `openWorkdays`: las de los ciclos
// abiertos, con o sin nómina; las que también están en `workdays` cuentan una
// vez. `payrolls`: todas las nóminas; las anteriores son las creadas antes de
// `createdAt` (en Generar, todas). `leaders`, `employments` y `prefixes` (los
// prefijos QR) en `null` saltan las revisiones que los necesitan.
export function buildCheckContext({
  items = [],
  workdays = [],
  openWorkdays = [],
  cycles = [],
  workers = [],
  payrolls = [],
  payrollId = null,
  createdAt = null,
  leaders = null,
  employments = null,
  prefixes = null,
  today = "",
} = {}) {
  const workerById = new Map(workers.filter((w) => w?.id).map((w) => [w.id, w]));
  const idOf = workerIdResolver(workers);
  const targetOf = mergedTargetResolver(workers);
  const personOfWorkday = (wd) => targetOf(idOf(wd));
  const rawIdOfItem = (it) => idOf({ workerId: it?.workerId, workerRut: it?.rut });
  const personOfItem = (it) => targetOf(rawIdOfItem(it));

  const cycleById = new Map(cycles.filter((c) => c?.id).map((c) => [c.id, c]));
  const laborCache = new Map();
  const laborInfoOf = (cycleId, laborId) => {
    const k = `${cycleId}|${laborId}`;
    if (!laborCache.has(k)) {
      const cycle = cycleById.get(cycleId) || null;
      const labor = (cycle?.labors || []).find((l) => l.id === laborId) || null;
      laborCache.set(k, { cycle, labor, type: labor?.type || "", monthly: monthlyKeysOf(labor) });
    }
    return laborCache.get(k);
  };

  const factOf = (wd, own) => {
    const { cycle, labor, type, monthly } = laborInfoOf(wd.cycleId, wd.laborId);
    const combo = workdayComboKeyOf(wd, type);
    const pay = workdayPayAmount(wd, type);
    const qty = type === "trato" ? getTratoTierTotals(wd).qty : Number(wd.qty) || 0;
    const monthlyDay = monthly.has(wd.workerRut) || (wd.workerId && monthly.has(wd.workerId));
    return {
      wd,
      own,
      person: personOfWorkday(wd),
      cycle,
      labor,
      type,
      combo: type === "tratoEtapas" ? wd.stageId || combo : combo,
      piso: !!wd.pisoOnly || isFloorKey(combo),
      attendance: !!wd.attendanceOnly || (monthlyDay && pay === 0),
      qty,
      pay,
    };
  };

  const ownIds = new Set();
  const facts = [];
  for (const wd of workdays) {
    if (!wd?.id || ownIds.has(wd.id)) continue;
    ownIds.add(wd.id);
    facts.push(factOf(wd, true));
  }
  const seen = new Set(ownIds);
  for (const wd of openWorkdays) {
    if (!wd?.id || seen.has(wd.id)) continue;
    seen.add(wd.id);
    facts.push(factOf(wd, false));
  }
  const factsByPerson = new Map();
  for (const f of facts) {
    if (!factsByPerson.has(f.person)) factsByPerson.set(f.person, []);
    factsByPerson.get(f.person).push(f);
  }

  const rows = items.map((item) => {
    const person = personOfItem(item);
    return {
      item,
      person,
      rawWorker: workerById.get(rawIdOfItem(item)) || null,
      worker: workerById.get(person) || null,
      cash: isCashBank(item.bankCode),
      name: item.name || item.workerName || workerById.get(person)?.name || "",
    };
  });
  const rowByPerson = new Map();
  for (const r of rows) if (!rowByPerson.has(r.person)) rowByPerson.set(r.person, r);

  // Lo que le pagaron antes a cada persona, de la nómina más nueva a la más
  // vieja. Sin fecha de creación (recién generada en este equipo), todas.
  const cutoff = timeOf(createdAt) || Infinity;
  const previous = payrolls
    .filter((p) => p?.id && p.id !== payrollId && timeOf(p.createdAt) < cutoff)
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
  const historyByPerson = new Map();
  for (const payroll of previous) {
    for (const item of payroll.items || []) {
      const person = personOfItem(item);
      if (!historyByPerson.has(person)) historyByPerson.set(person, []);
      const list = historyByPerson.get(person);
      if (list[list.length - 1]?.payroll !== payroll) list.push({ payroll, item });
    }
  }
  const payrollNameById = new Map(payrolls.filter((p) => p?.id).map((p) => [p.id, p.name || "otra nómina"]));

  return {
    rows,
    rowByPerson,
    facts,
    factsByPerson,
    workerById,
    personOfItem,
    targetOf,
    historyOf: (person) => historyByPerson.get(person) || [],
    previousPayrolls: previous,
    payrollNameOf: (id) => payrollNameById.get(id) || "otra nómina",
    leaders,
    employments,
    prefixes,
    today,
  };
}

// "Cosecha · Ciclo 1": la labor y el ciclo de una jornada.
export const laborText = (f) => [f.labor?.name || "Labor", f.cycle?.label].filter(Boolean).join(" · ");

// Dónde está una jornada: en esta nómina, en otra o pendiente.
export function originText(f, ctx) {
  if (f.own) return "en esta nómina";
  if (f.wd.payrollId) return `en ${ctx.payrollNameOf(f.wd.payrollId)}`;
  return "pendiente";
}

// "a", "a y b", "a, b y c".
export function listText(parts) {
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

const isoToUtc = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
const DAY_MS = 86400000;

// Días entre dos fechas YYYY-MM-DD, sin pasar por la zona horaria.
export const daysBetween = (from, to) => Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS);

// Las fechas, sin repetir y ordenadas, juntas en tramos de días seguidos:
// [["2026-11-03", "2026-11-05"], ["2026-11-08", "2026-11-08"]].
export function dateRanges(dates) {
  const sorted = [...new Set(dates.filter(Boolean))].sort();
  const ranges = [];
  for (const d of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && daysBetween(last[1], d) === 1) last[1] = d;
    else ranges.push([d, d]);
  }
  return ranges;
}
