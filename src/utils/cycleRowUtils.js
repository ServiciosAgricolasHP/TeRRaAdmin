// El nombre de los campos de un día en una fila de CycleDetail (rowDataRaw)
// varía por tipo de labor (combo/tier/etapa vs. monto directo), así que en
// vez de conocer la forma exacta, buscamos cualquier campo del día con
// `__amt` (cosecha/trato/tratoEtapas/tratoHE) o el campo plano del día mismo
// (normal) con valor > 0. Compartido entre CycleWorkerList.jsx (contador de
// días con producción) y CycleWorkerEditModal.jsx (filtro "solo con datos").
export function dayHasData(row, d) {
  if (Number(row[d]) > 0) return true;
  for (const k in row) {
    if (k.startsWith(`${d}__`) && k.endsWith("__amt") && Number(row[k]) > 0) return true;
  }
  return false;
}
