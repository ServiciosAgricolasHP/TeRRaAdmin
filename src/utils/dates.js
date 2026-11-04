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

// Las celdas de la grilla de un mes `YYYY-MM`, con la semana desde el lunes:
// la fecha de cada día y `null` en los huecos del principio y del final.
export function monthCells(month) {
  const [y, m] = String(month).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = Array(offset).fill(null);
  for (let d = 1; d <= last; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
