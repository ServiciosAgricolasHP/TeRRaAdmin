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
