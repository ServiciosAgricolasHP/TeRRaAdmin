// Ayudas de las quincenas: el rango compacto del encabezado, cuánto de cada
// resumen está cobrado y el orden por período.

// "2026-04-16" → "16-04-26". Así el rango del encabezado de cada quincena va en
// dos líneas (~55 px) y el ancho de la columna lo decide el nombre, que se
// envuelve; en ISO y en una línea ocuparía ~145 px, por encima del `minWidth`.
export const compactDate = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}-${m}-${y.slice(2)}` : iso || "?";
};

// Cuánto de un resumen está cobrado y cuánto falta. Lo usan la tabla del
// balance y el modal por transportista, así el modal cuadra con la fila que lo
// abrió.
//
// Un resumen `paid` está cerrado entero. Si sigue pendiente, los abonos cuentan
// como cobrado (topados al total con `Math.min`) y el resto es deuda.
export function paymentSplit(p) {
  const total = Number(p?.total) || 0;
  if (p?.status === "paid") return { pending: 0, paid: total, total };
  const abonado = (p?.abonos || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return { pending: Math.max(0, total - abonado), paid: Math.min(abonado, total), total };
}

// Ordena quincenas por período (periodFrom, la más reciente primero), no por
// fecha de creación: una quincena armada tarde queda en su lugar cronológico.
// Las que no tienen período van después de las que sí; con el mismo
// periodFrom, o sin período las dos, decide createdAt (la más nueva primero).
export function comparePayrollPeriod(a, b) {
  if (a.periodFrom && b.periodFrom && a.periodFrom !== b.periodFrom) {
    return a.periodFrom < b.periodFrom ? 1 : -1; // desc: más reciente primero
  }
  if (!!a.periodFrom !== !!b.periodFrom) return a.periodFrom ? -1 : 1;
  const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0;
  const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0;
  return tb - ta;
}
