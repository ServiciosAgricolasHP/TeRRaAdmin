// Helpers del tipo de labor "tratoHE" (jornadas con horas extras).
// Workday de tratoHE:
//   { qty, overtimeHours, hasManejo, hasSupervision, extras, amount }
//   `qty` guarda el MONTO BASE del día de ese trabajador, en pesos (p. ej.
//   25000). Vacío o 0 = no trabajó ese día.
// Config del día en dayPrices[laborId][date]["0_0"]:
//   { price, mode: "normal"|"overtimeOnly", isHoliday }
//   `price` es la base SUGERIDA para la columna (sirve para precargar las filas).

export const TRATO_HE_MODES = [
  { value: "normal", label: "Jornada normal (base + HE + bonos)" },
  { value: "overtimeOnly", label: "Solo horas extras (sin base)" },
];

export const DEFAULT_BONUS_MANEJO = 12000;
export const DEFAULT_BONUS_SUPERVISION = 5000;
export const DEFAULT_OVERTIME_RATE = 3500;
export const DEFAULT_BASE_DAY = 25000;

export function isWeekendDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isRedDay(dateStr, dayConfig) {
  return isWeekendDate(dateStr) || !!dayConfig?.isHoliday;
}

export function calcTratoHEAmount(input) {
  const {
    qty = 0,
    overtimeHours = 0,
    hasManejo = false,
    hasSupervision = false,
    extras = 0,
    dayMode = "normal",
    bonusManejo = DEFAULT_BONUS_MANEJO,
    bonusSupervision = DEFAULT_BONUS_SUPERVISION,
    overtimeRate = DEFAULT_OVERTIME_RATE,
  } = input || {};
  // qty ya es el monto base en pesos: no se multiplica por el precio del día.
  const base = dayMode === "overtimeOnly" ? 0 : Number(qty) || 0;
  const oh = (Number(overtimeHours) || 0) * (Number(overtimeRate) || 0);
  const m = hasManejo ? (Number(bonusManejo) || 0) : 0;
  const s = hasSupervision ? (Number(bonusSupervision) || 0) : 0;
  const x = Number(extras) || 0;
  return base + oh + m + s + x;
}

// Si el workday tiene algún dato que valga la pena guardar.
export function workdayHasData(wd) {
  if (!wd) return false;
  return (
    (Number(wd.qty) || 0) > 0 ||
    (Number(wd.overtimeHours) || 0) > 0 ||
    !!wd.hasManejo ||
    !!wd.hasSupervision ||
    (Number(wd.extras) || 0) !== 0
  );
}
