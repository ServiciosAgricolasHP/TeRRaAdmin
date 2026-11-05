// Limpiar una labor del ciclo: borrar sus jornadas, sacar a sus personas y
// quitar del ciclo los días que quedan vacíos. Sirve para cualquier tipo de
// labor. El cálculo vive acá, sin Firestore; lo escribe `clearLabor`
// (services/laborClearService.js).
//
// - Las jornadas que ya están en una nómina (`payrollId`) quedan, con sus
//   personas y sus días.
// - Un día sale del ciclo solo si la labor tenía jornadas ese día y, después
//   de limpiar, no le queda ninguna en ninguna labor ni una vuelta de
//   transporte (las vueltas no se borran: quedarían colgando de un día que el
//   ciclo ya no muestra).
// - Las vueltas de esos días quedan, y las que no están pagadas se avisan.
// - Los precios, los pisos configurados y la labor misma no se tocan.
//
// `workdays` son las jornadas de todo el ciclo; una sin `laborId` es de la
// primera labor, como en la grilla. `trips`, las vueltas del ciclo.
export function planLaborClear({ cycle, laborId, workdays, trips }) {
  const labors = cycle?.labors || [];
  const labor = labors.find((l) => l.id === laborId);
  const fallback = labors[0]?.id;
  const ofLabor = (w) => (w.laborId || fallback) === laborId;
  const deletes = [];
  const kept = [];
  const remainingDates = new Set();
  for (const w of workdays || []) {
    if (!w) continue;
    if (ofLabor(w) && !w.payrollId) deletes.push(w);
    else {
      if (ofLabor(w)) kept.push(w);
      remainingDates.add(w.date);
    }
  }
  const keptKeys = new Set(kept.flatMap((w) => [w.workerId, w.workerRut]).filter(Boolean));
  const allWorkers = labor?.workers || [];
  const workers = allWorkers.filter((lw) => keptKeys.has(lw.id) || keptKeys.has(lw.rut));

  const deletedDates = new Set(deletes.map((w) => w.date));
  const tripsOnDays = (trips || []).filter((t) => deletedDates.has(t.date));
  const tripDates = new Set(tripsOnDays.map((t) => t.date));
  const cycleDays = cycle?.days || [];
  const emptied = cycleDays.filter((d) => deletedDates.has(d) && !remainingDates.has(d));
  const daysRemoved = emptied.filter((d) => !tripDates.has(d));
  const removed = new Set(daysRemoved);

  return {
    deletes,
    kept,
    workers,
    workersRemoved: allWorkers.length - workers.length,
    days: cycleDays.filter((d) => !removed.has(d)),
    daysRemoved,
    tripDays: emptied.filter((d) => tripDates.has(d)),
    trips: tripsOnDays,
    pendingTrips: tripsOnDays.filter((t) => t.status !== "paid"),
  };
}

// Las jornadas del mapa de la grilla (`workdaysByLabor`), en una lista con la
// labor de cada una.
export const workdaysOfGrid = (workdaysByLabor) =>
  Object.entries(workdaysByLabor || {}).flatMap(([laborId, byKey]) =>
    Object.values(byKey || {}).filter(Boolean).map((w) => ({ ...w, laborId })));
