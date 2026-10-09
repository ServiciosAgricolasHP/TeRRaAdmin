// Fecha de calendario (`YYYY-MM-DD`) en la hora local del navegador.
// `toISOString()` la da en UTC: en Chile, desde las 20 o 21 h ya es el día
// siguiente. Devuelve "" si la fecha no es válida.
export function localIsoDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
