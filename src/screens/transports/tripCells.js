// Lo que muestran las columnas de una vuelta en las tablas imprimibles de
// Transportes: la fecha, la labor y la observación. Lo usan el detalle de un
// resumen y el resumen del transportista.

export const MONTH_NAMES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

// "2026-10-02" → "02-oct".
export function tripDateLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}-${MONTH_NAMES[d.getMonth()].slice(0, 3).toLowerCase()}`;
}

// La faena y la subfaena de la vuelta, o la etiqueta del ciclo si no las trae.
export function tripLaborLabel(t, { faenaById, subfaenaById, cycleById } = {}) {
  const fa = faenaById?.get(t.faenaId);
  const sb = subfaenaById?.get(t.subfaenaId);
  const cy = cycleById?.get(t.cycleId);
  return [fa?.name, sb?.name].filter(Boolean).join(" / ") || cy?.label || "—";
}

// Las personas, si es acercamiento y las notas, separadas por " · ".
export function tripObservation(t) {
  return [
    t.personCount != null ? `${t.personCount} PERS` : "",
    t.kind === "approach" ? "acercamiento" : "",
    t.notes || "",
  ].filter(Boolean).join(" · ");
}
