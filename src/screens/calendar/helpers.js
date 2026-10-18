// Fechas y formatos que comparten las piezas del Calendario.

export const fmtNumber = (v) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(Number(v) || 0);

// Sábado o domingo, que se marcan en rojo como en las grillas de tratoHE. Los
// feriados de cada labor viven en dayPrices, que acá no se carga: solo cubre
// fines de semana.
export function isWeekendDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const MONTH_SHORT_LIST = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Formato "vie 16-may-2026" para los encabezados de los modales.
export function humanDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${WEEKDAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}-${MONTH_SHORT_LIST[d.getMonth()]}-${d.getFullYear()}`;
}

// ============================================================================
// Carga de datos
// ============================================================================

export function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, lastDay };
}
