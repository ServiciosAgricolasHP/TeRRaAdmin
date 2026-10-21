// Listas de imposiciones (`contributionLists`): por empleador y mes, una fila
// por persona y faena (el centro de costo) con los días imponibles y lo que se
// le pide al contador (liquidación, o liquidación y finiquito si el contrato
// terminó ese mes). Sueldo y bono los completa el contador.

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// "2026-09" → "Septiembre 2026".
export function monthTitle(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : String(month || "");
}

// Una fila es una persona en una faena.
export const contributionItemKey = (it) => `${it.workerId}|${it.faenaId}`;

// Por faena y nombre; quien no trabajó (sin faena) va al final.
const byFaenaThenName = (a, b) =>
  (a.faenaId ? 0 : 1) - (b.faenaId ? 0 : 1) ||
  String(a.faenaName).localeCompare(String(b.faenaName), "es") ||
  String(a.name).localeCompare(String(b.name), "es");

// Las filas de `contributionRows` (`utils/employment.js`) con el nombre y rut
// de la persona y el de la faena, ordenadas por faena y nombre.
export function buildContributionItems(rows, { workersById, faenaNameOf }) {
  return rows
    .map((r) => {
      const w = workersById.get(r.workerId) || {};
      return {
        workerId: r.workerId,
        rut: w.rut || r.workerId,
        name: w.name || r.workerId,
        faenaId: r.faenaId || "",
        faenaName: r.faenaId ? faenaNameOf(r.faenaId) : "",
        days: r.days,
        request: r.request,
        endDate: r.endDate || "",
        endReason: r.endReason || null,
      };
    })
    .sort(byFaenaThenName);
}

// Totales: personas distintas, días, filas y personas con finiquito.
export function contributionTotals(items) {
  return {
    people: new Set(items.map((it) => it.workerId)).size,
    days: items.reduce((s, it) => s + (Number(it.days) || 0), 0),
    count: items.length,
    settlements: new Set(items.filter((it) => it.request === "payslipAndSettlement").map((it) => it.workerId)).size,
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
