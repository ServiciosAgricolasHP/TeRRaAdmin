// Las copias por mes de las jornadas que guarda el Calendario
// (services/workdayMonths.js): cómo se les aplica lo que cambió y cuáles se
// dejan de guardar.

// "2026-10-05" → "2026-10".
export const monthOfDate = (date) => String(date || "").slice(0, 7);

// La copia de un mes (`month`, YYYY-MM) con lo que cambió en `workdays`:
// agrega o reemplaza las jornadas de ese mes y saca las que ya no son de él.
export function applyMonthChanges(list, changed, month) {
  const byId = new Map(list.map((d) => [d.id, d]));
  for (const d of changed) {
    if (monthOfDate(d.date) === month) byId.set(d.id, d);
    else byId.delete(d.id);
  }
  return [...byId.values()];
}

// Los meses que se dejan de guardar: los usados hace más tiempo, más allá de
// los `keep` más recientes. `months`: { [mes]: { usedAt } }.
export function monthsToDrop(months, keep) {
  return Object.entries(months)
    .sort(([, a], [, b]) => (b.usedAt || 0) - (a.usedAt || 0))
    .slice(keep)
    .map(([month]) => month);
}
