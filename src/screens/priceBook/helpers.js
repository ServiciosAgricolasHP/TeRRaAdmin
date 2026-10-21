// Lo que comparten la pantalla del Libro de Precios y sus piezas.
export const DATALIST_ID = "pricebook-units-list";

export const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("es-CL") : "—");
export const fmtRange = (from, to) => `${fmtDate(from)} – ${to ? fmtDate(to) : "vigente"}`;
