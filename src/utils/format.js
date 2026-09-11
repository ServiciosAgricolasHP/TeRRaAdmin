// Formatters compartidos. Estos mismos `Intl.NumberFormat` estaban duplicados
// idénticos en una decena de pantallas; el código nuevo usa este módulo.
// (Las pantallas viejas siguen con su copia local — migrarlas es una limpieza
// aparte, no se mezcla con el cambio que trajo este archivo.)

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});
const plain = new Intl.NumberFormat("es-CL");

export const fmtCurrency = (v) => clp.format(Number(v) || 0);
export const fmtNumber = (v) => plain.format(Number(v) || 0);

// Montos grandes en un eje de gráfico: "$1,2M" / "$450k". No sirve para
// mostrar plata en una tabla — ahí siempre va el monto exacto.
export function fmtCompactCLP(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export const fmtPercent = (v, digits = 0) =>
  `${(Number(v) || 0).toFixed(digits).replace(".", ",")}%`;

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-09-14" -> "14-sep". Etiqueta compacta para listados densos.
export function fmtShortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  return `${m[3]}-${MONTHS_ES[Number(m[2]) - 1] || m[2]}`;
}

// "2026-09" -> "sep 26". Las claves de mes en la app son strings YYYY-MM, así
// que se parsean a mano en vez de pasar por Date (que interpretaría UTC y
// podría correr el mes según la zona horaria).
export function fmtMonthKey(key) {
  const [y, m] = String(key || "").split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return String(key || "");
  return `${MONTHS_ES[idx]} ${y.slice(2)}`;
}
