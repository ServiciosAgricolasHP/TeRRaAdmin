import { fmtCurrency } from "../../utils/format";

// Los indicadores del header: sueldo base, día y hora extra.
export const INDICATOR_DEFS = [
  { key: "sueldoBase", label: "Sueldo base", icon: "💵" },
  { key: "dia", label: "Día", icon: "📅" },
  { key: "hora", label: "Hora extra", icon: "⏱" },
];

// Un indicador sin cargar (o en cero) se muestra como "—".
export const fmtIndicator = (v) => (Number(v) > 0 ? fmtCurrency(v) : "—");
