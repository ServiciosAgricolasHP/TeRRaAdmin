// Los indicadores del header: sueldo base, día y hora extra.
export const INDICATOR_DEFS = [
  { key: "sueldoBase", label: "Sueldo base", icon: "💵" },
  { key: "dia", label: "Día", icon: "📅" },
  { key: "hora", label: "Hora extra", icon: "⏱" },
];

export const fmtCLP = (v) =>
  Number(v) > 0
    ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(v))
    : "—";
