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
