// Revisiones de las jornadas que paga la nómina. Cada una devuelve
// `[{ person, severity, lines }]`: una entrada por persona, con una línea por
// cosa encontrada.
import { localIsoDate } from "../dates";
import { fmtCurrency, fmtNumber, fmtShortDate } from "../format";
import { isPrefixSyncing } from "../harvestSync";
import {
  DAY_LABOR_TYPES,
  PRODUCTION_LABOR_TYPES,
  SEVERITY,
  dateRanges,
  daysBetween,
  laborText,
  listText,
  originText,
  worstSeverity,
} from "./checkContext";

// Cantidad sobre esta proporción de la mediana de su labor ese día.
export const OUTLIER_FACTOR = 3;
// Cuántas jornadas necesita la labor ese día para comparar.
export const OUTLIER_MIN_PEERS = 5;
// Más días seguidos que esto, sin descanso.
export const MAX_STREAK_DAYS = 6;

// Junta lo encontrado por persona.
function byPerson(found) {
  const map = new Map();
  for (const { person, severity, line, sortKey = "" } of found) {
    if (!map.has(person)) map.set(person, []);
    map.get(person).push({ severity, line, sortKey });
  }
  return [...map].map(([person, list]) => {
    list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return { person, severity: worstSeverity(list.map((x) => x.severity)), lines: list.map((x) => x.line) };
  });
}

const groupBy = (list, keyOf) => {
  const map = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  }
  return map;
};

// La misma jornada dos veces: misma persona, ciclo, labor, día y tipo (envase,
// etapa o piso) en dos documentos. Pasa cuando la ficha cambió de RUT o se
// unió con otra: el id de la jornada lleva el RUT con que se creó.
export function duplicateWorkdays(ctx) {
  const groups = groupBy(ctx.facts, (f) => [f.person, f.wd.cycleId, f.wd.laborId, f.wd.date, f.combo].join("|"));
  const found = [];
  for (const list of groups.values()) {
    if (list.length < 2 || !list.some((f) => f.own)) continue;
    const f = list[0];
    const where = listText([...new Set(list.map((x) => originText(x, ctx)))]);
    found.push({
      person: f.person,
      severity: SEVERITY.red,
      sortKey: f.wd.date,
      line: `${fmtShortDate(f.wd.date)} ${laborText(f)}: ${list.length} jornadas iguales (${where})`,
    });
  }
  return byPerson(found);
}

// Más de una labor o cosecha el mismo día, en la nómina o contra otros ciclos
// abiertos. Puede ser verdad (mañana y tarde), pero con dos labores pagadas
// por día son dos días completos. Cada labor va con lo que paga ese día:
// todos sus envases y su piso.
export function sameDayLabors(ctx) {
  const groups = groupBy(ctx.facts, (f) => `${f.person}|${f.wd.date}`);
  const found = [];
  for (const list of groups.values()) {
    const labors = new Map();
    for (const f of list) {
      const k = `${f.wd.cycleId}|${f.wd.laborId}`;
      const prev = labors.get(k) || { fact: null, amount: 0 };
      const keep = !f.piso && (!prev.fact || (f.own && !prev.fact.own));
      labors.set(k, { fact: keep ? f : prev.fact, amount: prev.amount + f.pay });
    }
    const distinct = [...labors.values()].filter((x) => x.fact);
    if (distinct.length < 2 || !distinct.some((x) => x.fact.own)) continue;
    const dayLabors = distinct.filter((x) => DAY_LABOR_TYPES.has(x.fact.type)).length;
    const f = distinct[0].fact;
    found.push({
      person: f.person,
      severity: dayLabors >= 2 ? SEVERITY.red : SEVERITY.orange,
      sortKey: f.wd.date,
      line: `${fmtShortDate(f.wd.date)}: ${listText(distinct.map((x) => `${laborText(x.fact)} ${fmtCurrency(x.amount)} (${originText(x.fact, ctx)})`))}`,
    });
  }
  return byPerson(found);
}

// Una jornada que la nómina paga en $0 sin ser de sueldo mensual: con
// cantidad y sin monto, falta el precio del día.
export function zeroAmountWorkdays(ctx) {
  const found = [];
  for (const f of ctx.facts) {
    if (!f.own || f.piso || f.attendance || f.pay !== 0) continue;
    const production = PRODUCTION_LABOR_TYPES.has(f.type);
    if (production && f.qty <= 0) continue;
    const what = production ? `${fmtNumber(f.qty)} sin monto (falta el precio del día)` : "jornada en $0";
    found.push({ person: f.person, severity: SEVERITY.red, sortKey: f.wd.date, line: `${fmtShortDate(f.wd.date)} ${laborText(f)}: ${what}` });
  }
  return byPerson(found);
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Una cantidad muy sobre la del resto de la labor ese día (un 1.500 donde
// todos andan en 150). En las labores por día se compara el monto.
export function outlierQuantities(ctx) {
  const comparable = ctx.facts.filter((f) => !f.piso && !f.attendance && f.type);
  const valueOf = (f) => (PRODUCTION_LABOR_TYPES.has(f.type) ? f.qty : f.pay);
  const groups = groupBy(comparable, (f) =>
    [f.wd.cycleId, f.wd.laborId, f.wd.date, PRODUCTION_LABOR_TYPES.has(f.type) ? f.combo : ""].join("|"),
  );
  const found = [];
  for (const list of groups.values()) {
    const values = list.map(valueOf).filter((v) => v > 0);
    if (values.length < OUTLIER_MIN_PEERS) continue;
    const med = median(values);
    if (med <= 0) continue;
    for (const f of list) {
      const v = valueOf(f);
      if (!f.own || v <= OUTLIER_FACTOR * med) continue;
      const fmt = PRODUCTION_LABOR_TYPES.has(f.type) ? fmtNumber : fmtCurrency;
      found.push({
        person: f.person,
        severity: SEVERITY.orange,
        sortKey: f.wd.date,
        line: `${fmtShortDate(f.wd.date)} ${laborText(f)}: ${fmt(v)}, la mediana del día es ${fmt(med)}`,
      });
    }
  }
  return byPerson(found);
}

// Una jornada con fecha fuera de los días del ciclo, o en el futuro.
export function outOfCycleDates(ctx) {
  const found = [];
  const seen = new Set();
  for (const f of ctx.facts) {
    if (!f.own) continue;
    const date = f.wd.date;
    const days = f.cycle?.days || [];
    const reason = ctx.today && date > ctx.today ? "fecha futura" : days.length && !days.includes(date) ? "fuera de los días del ciclo" : "";
    const k = `${f.person}|${f.wd.cycleId}|${f.wd.laborId}|${date}`;
    if (!reason || seen.has(k)) continue;
    seen.add(k);
    found.push({ person: f.person, severity: SEVERITY.orange, sortKey: date, line: `${fmtShortDate(date)} ${laborText(f)}: ${reason}` });
  }
  return byPerson(found);
}

// Más de `MAX_STREAK_DAYS` días seguidos trabajados, contando los de otros
// ciclos abiertos, en un tramo que toca la nómina.
export function longStreaks(ctx) {
  const found = [];
  for (const [person, facts] of ctx.factsByPerson) {
    const worked = facts.filter((f) => !f.piso);
    const ownDates = new Set(worked.filter((f) => f.own).map((f) => f.wd.date));
    if (!ownDates.size) continue;
    for (const [from, to] of dateRanges(worked.map((f) => f.wd.date))) {
      const length = daysBetween(from, to) + 1;
      if (length <= MAX_STREAK_DAYS) continue;
      if (![...ownDates].some((d) => d >= from && d <= to)) continue;
      found.push({ person, severity: SEVERITY.info, sortKey: from, line: `${length} días seguidos: ${fmtShortDate(from)} a ${fmtShortDate(to)}` });
    }
  }
  return byPerson(found);
}

// Una labor de cosecha de la nómina que sincroniza un prefijo QR, y el
// prefijo no se sincronizó después del último día que paga la nómina: puede
// haber pesajes que no llegaron a las jornadas. Avisa por prefijo, no por
// persona (`general`). Sin la lista de prefijos, no revisa.
export function staleQrSync(ctx) {
  if (!ctx.prefixes) return [];
  const found = [];
  for (const prefix of ctx.prefixes) {
    const cycleId = prefix?.cycleId;
    if (!isPrefixSyncing(prefix, cycleId)) continue;
    const paid = ctx.facts.filter((f) => f.own && !f.piso && f.wd.cycleId === cycleId && f.wd.laborId === prefix.laborId);
    if (!paid.length) continue;
    const lastPaid = paid.reduce((max, f) => (f.wd.date > max ? f.wd.date : max), "");
    const at = prefix.lastSync?.at ? new Date(prefix.lastSync.at) : null;
    const syncDay = at && !Number.isNaN(at.getTime()) ? localIsoDate(at) : "";
    if (syncDay && syncDay > lastPaid) continue;
    const what = `la nómina paga ${laborText(paid[0])} hasta el ${fmtShortDate(lastPaid)}`;
    const line = syncDay
      ? `La última sincronización de ${prefix.id} fue el ${fmtShortDate(syncDay)} y ${what}: puede haber pesajes que no llegaron. Se sincroniza en Pesajes QR.`
      : `${prefix.id} nunca se ha sincronizado y ${what}. Se sincroniza en Pesajes QR.`;
    found.push({ general: prefix.id, label: `Prefijo QR ${prefix.id}`, severity: SEVERITY.orange, lines: [line] });
  }
  return found;
}
