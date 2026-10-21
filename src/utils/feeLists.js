// Listas de honorarios (`feeLists`): una fila por persona y faena con sus
// días, el bruto, la retención y el líquido de su boleta, y los datos que pide
// la boleta (dirección y comuna) tal como estaban al generar la lista.
import { feeAmounts } from "./employment";

// Tarifa líquida por día y retención de 2026, hasta que un admin las cambie.
export const DEFAULT_FEE_CONFIG = { feeDailyNet: 18452, feeWithholdingRate: 0.1525 };

// Una fila es una persona en una faena.
export const feeItemKey = (it) => `${it.workerId}|${it.faenaId}`;

// Una fila con sus montos recalculados para la tarifa y la retención dadas.
export const feeItem = (item, dailyNet, rate) => ({ ...item, ...feeAmounts(item.days, dailyNet, rate) });

const byFaenaThenName = (a, b) =>
  String(a.faenaName).localeCompare(String(b.faenaName), "es") || String(a.name).localeCompare(String(b.name), "es");

// Las filas de `feeRows` (`utils/employment.js`) con los datos de la persona y
// el nombre de la faena, ordenadas por faena y nombre.
export function buildFeeListItems(rows, { workersById, faenaNameOf, dailyNet, rate }) {
  return rows
    .map((r) => {
      const w = workersById.get(r.workerId) || {};
      return feeItem(
        {
          workerId: r.workerId,
          rut: w.rut || r.workerId,
          name: w.name || r.workerId,
          faenaId: r.faenaId || "",
          faenaName: faenaNameOf(r.faenaId),
          days: r.days,
          address: w.address || "",
          commune: w.commune || "",
          issued: false,
          folio: "",
          issuedAt: "",
        },
        dailyNet,
        rate,
      );
    })
    .sort(byFaenaThenName);
}

// Totales de una lista: personas distintas, días, montos y boletas emitidas.
export function feeListTotals(items) {
  const sum = (k) => items.reduce((s, it) => s + (Number(it[k]) || 0), 0);
  return {
    people: new Set(items.map((it) => it.workerId)).size,
    days: sum("days"),
    gross: sum("gross"),
    withholding: sum("withholding"),
    net: sum("net"),
    issued: items.filter((it) => it.issued).length,
    count: items.length,
  };
}

// Las filas agrupadas por faena, con el total de cada una.
export function itemsByFaena(items) {
  const groups = new Map();
  for (const it of [...items].sort(byFaenaThenName)) {
    const key = it.faenaId || "";
    if (!groups.has(key)) groups.set(key, { faenaId: key, faenaName: it.faenaName || "Sin faena", items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()].map((g) => ({ ...g, totals: feeListTotals(g.items) }));
}

// Quienes no tienen dirección: la boleta la pide.
export const missingAddress = (items) => [...new Set(items.filter((it) => !String(it.address || "").trim()).map((it) => it.name))];

// "12345678-9" → ["12345678", "9"], como la planilla (sin puntos).
export function rutParts(rut) {
  const s = String(rut || "").replace(/\./g, "").trim();
  const i = s.lastIndexOf("-");
  return i > 0 ? [s.slice(0, i), s.slice(i + 1).toUpperCase()] : [s, ""];
}
