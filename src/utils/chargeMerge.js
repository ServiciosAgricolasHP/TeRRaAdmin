// Tablas fusionadas del modo Cobrar del resumen del ciclo.
//
// Una labor puede marcar `mergeInto: <otra labor>` y entonces se muestra dentro
// de la tabla de esa otra, en una sola tabla día a día con un subtotal único.
// Solo cambia la presentación: cada labor sigue guardando sus propios
// overrides y filas extra, y cada fila fusionada lleva `_laborId` para que una
// edición vuelva a su labor. El total a facturar no cambia, porque ya suma
// todas las labores incluidas.

// tratoHE tiene columnas propias (base $, horas extras, bonos), así que solo
// se junta con otra tratoHE. El resto comparte cantidad × tarifa.
export const mergeFamilyOf = (laborType) => (laborType === "tratoHE" ? "he" : "std");

// Destino válido de la fusión de `ld`, o null. Vale si apunta a otra labor
// incluida, de la misma familia, que no esté a su vez fusionada en una tercera
// (las cadenas se ignoran para no esconder labores sin querer).
export function mergeTargetOf(ld, byId) {
  if (!ld?.include || !ld.mergeInto || ld.mergeInto === ld.labor?.id) return null;
  const target = byId.get(ld.mergeInto);
  if (!target || !target.include || target.mergeInto) return null;
  if (mergeFamilyOf(target.labor?.type) !== mergeFamilyOf(ld.labor?.type)) return null;
  return target;
}

// Secciones a dibujar, en el orden de las labores: cada una con su labor
// principal y las que se le fusionaron. Las labores no incluidas quedan como
// secciones propias (el render las salta igual que hoy).
export function buildChargeSections(labors) {
  const byId = new Map(labors.map((ld) => [ld.labor.id, ld]));
  const membersOf = new Map();
  for (const ld of labors) {
    const target = mergeTargetOf(ld, byId);
    if (!target) continue;
    if (!membersOf.has(target.labor.id)) membersOf.set(target.labor.id, []);
    membersOf.get(target.labor.id).push(ld);
  }
  const sections = [];
  for (const ld of labors) {
    if (mergeTargetOf(ld, byId)) continue;
    sections.push({ lead: ld, members: [ld, ...(membersOf.get(ld.labor.id) || [])] });
  }
  return sections;
}

// Filas de una tabla fusionada: las de cada labor, con su origen marcado y
// ordenadas por fecha (las filas sin fecha al final).
export function mergedRows(members, nameOf = (ld) => ld.labor.name) {
  const rows = [];
  for (const ld of members) {
    for (const r of ld.chargedRows || []) {
      rows.push({
        ...r,
        _laborId: ld.labor.id,
        _laborName: nameOf(ld),
        _laborType: ld.labor.type,
        _key: `${ld.labor.id}:${r.rowKey || r.extraId || r.date}`,
      });
    }
  }
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const da = a.r.date || "￿";
      const dbb = b.r.date || "￿";
      return da < dbb ? -1 : da > dbb ? 1 : a.i - b.i;
    })
    .map(({ r }) => r);
}

const SUM_KEYS = ["amount", "transport", "pisoAmount", "pisoCount", "workerDays", "overtimeHours", "heTotal", "bonosTotal"];

// Subtotal de una tabla fusionada. La cantidad solo se suma si todas las
// labores miden lo mismo (mismo tipo y misma unidad): sumar kilos con
// jornadas no da un número que signifique algo, y en ese caso queda en null.
export function mergedTotals(members) {
  const out = {};
  for (const k of SUM_KEYS) {
    out[k] = members.reduce((s, ld) => s + (Number(ld.chargedTotals?.[k]) || 0), 0);
  }
  const first = members[0];
  const sameMeasure = members.every(
    (ld) => ld.labor?.type === first?.labor?.type && ld.unit === first?.unit,
  );
  out.qty = sameMeasure ? members.reduce((s, ld) => s + (Number(ld.chargedTotals?.qty) || 0), 0) : null;
  out.countedQty = sameMeasure
    ? members.reduce((s, ld) => s + (Number(ld.chargedTotals?.countedQty ?? ld.chargedTotals?.qty) || 0), 0)
    : null;
  return out;
}
