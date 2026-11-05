import { normalizeRut } from "./rutUtils";

// Rut vigente de un trabajador a partir de lo que guardó otro documento.
//
// Un item de nómina, un workday o una entrada de labor guardan el rut que el
// trabajador tenía al crearse, que es el id de su ficha. Si después se corrigió
// (cédula provisoria → definitiva), el vigente está en `worker.rut`. Es para
// mostrar: las claves que cruzan documentos siguen siendo las guardadas.
//
// Devuelve `(storedRut, workerId?) => rut`. Sin ficha, devuelve el guardado.
export function currentRutResolver(workers) {
  const byId = new Map();
  for (const w of workers || []) {
    if (w?.id) byId.set(w.id, w.rut || w.id);
  }
  return (storedRut, workerId) => byId.get(workerId || storedRut) ?? storedRut ?? "";
}

// Id de la ficha a partir de lo que guardó una jornada: su `workerId` o, en
// las antiguas que no lo tienen, el rut guardado, que puede ser el id, el rut
// vigente o uno anterior (`rutHistory`). Sin ficha, devuelve lo guardado.
export function workerIdResolver(workers) {
  const byKey = new Map();
  for (const w of workers || []) {
    if (!w?.id) continue;
    for (const k of [w.id, w.rut, ...(w.rutHistory || [])]) if (k && !byKey.has(k)) byKey.set(k, w.id);
  }
  return (wd) => wd?.workerId || byKey.get(wd?.workerRut) || wd?.workerRut || "";
}

// La ficha de un RUT sobre la lista de trabajadores, como `findWorkerByRut`
// pero sin leer: busca el RUT sin puntos entre los id, después entre los RUT
// vigentes y al final entre los anteriores (`rutHistory`). Una ficha unida a
// otra (`mergedInto`) devuelve la otra. Sin ficha, null.
export function workerByRutResolver(workers) {
  const list = (workers || []).filter((w) => w?.id);
  const byId = new Map(list.map((w) => [w.id, w]));
  const byKey = new Map(byId);
  for (const w of list) if (w.rut && !byKey.has(w.rut)) byKey.set(w.rut, w);
  for (const w of list) {
    for (const k of w.rutHistory || []) if (k && !byKey.has(k)) byKey.set(k, w);
  }
  return (rut) => {
    const found = byKey.get(normalizeRut(rut));
    return (found?.mergedInto && byId.get(found.mergedInto)) || found || null;
  };
}
