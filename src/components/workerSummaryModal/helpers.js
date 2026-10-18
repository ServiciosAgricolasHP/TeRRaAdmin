// Formatos que comparten las piezas del resumen del trabajador.

export const fmtNumber = (v) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(Number(v) || 0);

export const dateLabel = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const month = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()];
  return `${String(d.getDate()).padStart(2, "0")}-${month}`;
};

// Título por defecto de un ciclo (lo que se muestra si el usuario no editó nada).
export const defaultCycleTitle = ({ faena, subfaena, cycle }) =>
  [faena?.name, subfaena?.name, cycle.label].filter(Boolean).join(" · ");
