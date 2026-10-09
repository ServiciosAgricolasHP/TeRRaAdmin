// Si una fila de CycleDetail (rowDataRaw) tiene datos en el día `d`: el campo
// plano del día (labores de monto directo) o cualquier campo `${d}__…__amt`
// (cosecha, trato, tratoEtapas, tratoHE) con valor > 0. En una fila de sueldo
// mensual cuenta también la asistencia, que va en $0. No depende de la forma
// exacta de los campos, que cambia según el tipo de labor. Lo usan el contador
// de días con producción (CycleWorkerList.jsx) y el filtro "solo con datos"
// (CycleWorkerEditModal.jsx).
export function dayHasData(row, d) {
  if (row._monthly && row[`${d}__present`]) return true;
  if (Number(row[d]) > 0) return true;
  for (const k in row) {
    if (k.startsWith(`${d}__`) && k.endsWith("__amt") && Number(row[k]) > 0) return true;
  }
  return false;
}
