import { compactDate } from "../fortnights";

// El período de un grupo del resumen: el de su quincena o, si no tiene, el de
// sus vueltas.
export function groupPeriodLabel(group) {
  const { periodFrom: from, periodTo: to } = group;
  if (!from && !to) return "—";
  if (!to || from === to) return compactDate(from || to);
  return `${compactDate(from)} → ${compactDate(to)}`;
}
