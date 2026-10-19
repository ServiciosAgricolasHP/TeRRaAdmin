import { DEFAULT_BASE_DAY } from "../../../utils/tratoHE";

// Formatos y clases de las tarjetas de día de la ficha de una persona.

export function effectiveDayPrice(labor, dayCfg) {
  return Number(dayCfg?.price) || Number(labor?.baseDayDefault) || DEFAULT_BASE_DAY;
}

const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// `d` siempre es "YYYY-MM-DD"; con T00:00:00 el día de la semana se calcula
// en hora local y no se corre un día por UTC.
export function formatDayLabel(d) {
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  const [, m, day] = d.split("-");
  return `${WEEKDAYS_SHORT[dt.getDay()]} ${day}/${m}`;
}

export const inputCls =
  "w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50";

// Borde izquierdo de acento: marca de un vistazo qué días de la lista ya
// tienen algo cargado.
export const cardAccentCls = (hasValue) =>
  `rounded-lg border border-l-4 p-3.5 border-[var(--color-border)] ${
    hasValue ? "border-l-emerald-500/70" : "border-l-transparent"
  }`;
