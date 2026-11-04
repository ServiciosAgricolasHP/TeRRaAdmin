// Listas de imposiciones (`contributionLists`): por empleador y mes, una fila
// por persona y faena (el centro de costo) con los días imponibles, sus fechas
// y lo ganado, el sueldo y el bono (`contributionPay`, `utils/employment.js`) y
// lo que se le pide al contador (liquidación, o liquidación y finiquito si el
// contrato terminó ese mes).
import { contributionPay, datesWithEarnings } from "./employment";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// "2026-09" → "Septiembre 2026".
export function monthTitle(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : String(month || "");
}

// Una fila es una persona en una faena.
export const contributionItemKey = (it) => `${it.workerId}|${it.faenaId}`;

// Una fila con su sueldo y su bono recalculados para el mínimo por día dado.
export const contributionItem = (item, dailyBase) => ({ ...item, ...contributionPay(item.days, item.earned, dailyBase) });

// Por faena y nombre; quien no trabajó (sin faena) va al final.
const byFaenaThenName = (a, b) =>
  (a.faenaId ? 0 : 1) - (b.faenaId ? 0 : 1) ||
  String(a.faenaName).localeCompare(String(b.faenaName), "es") ||
  String(a.name).localeCompare(String(b.name), "es");

// Las filas de `contributionRows` (`utils/employment.js`) con el nombre y rut
// de la persona, el de la faena, sus fechas con lo ganado cada día (`earned`,
// de `earnedByDay`) y el sueldo y el bono, ordenadas por faena y nombre.
export function buildContributionItems(rows, { workersById, faenaNameOf, earned, dailyBase }) {
  return rows
    .map((r) => {
      const w = workersById.get(r.workerId) || {};
      const dates = datesWithEarnings(r.dates, earned?.get(r.workerId));
      return contributionItem(
        {
          workerId: r.workerId,
          rut: w.rut || r.workerId,
          name: w.name || r.workerId,
          faenaId: r.faenaId || "",
          faenaName: r.faenaId ? faenaNameOf(r.faenaId) : "",
          days: r.days,
          dates,
          earned: dates.reduce((s, d) => s + d.amount, 0),
          request: r.request,
          endDate: r.endDate || "",
          endReason: r.endReason || null,
        },
        dailyBase,
      );
    })
    .sort(byFaenaThenName);
}

// Totales: personas distintas, días, filas, personas con finiquito, y lo
// ganado, el sueldo y el bono.
export function contributionTotals(items) {
  const sum = (k) => items.reduce((s, it) => s + (Number(it[k]) || 0), 0);
  return {
    people: new Set(items.map((it) => it.workerId)).size,
    days: sum("days"),
    count: items.length,
    settlements: new Set(items.filter((it) => it.request === "payslipAndSettlement").map((it) => it.workerId)).size,
    earned: sum("earned"),
    baseSalary: sum("baseSalary"),
    bonus: sum("bonus"),
  };
}

// Las filas por faena, con el total de cada una. Quien tuvo contrato y no
// trabajó va en "Sin días trabajados".
export function contributionsByFaena(items) {
  const groups = new Map();
  for (const it of [...items].sort(byFaenaThenName)) {
    const key = it.faenaId || "";
    if (!groups.has(key)) groups.set(key, { faenaId: key, faenaName: it.faenaId ? it.faenaName || "Sin nombre" : "Sin días trabajados", items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()].map((g) => ({ ...g, totals: contributionTotals(g.items) }));
}
