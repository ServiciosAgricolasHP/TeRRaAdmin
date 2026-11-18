// Cómo se ve cada nivel de una alerta de la revisión de la nómina.
export { SEVERITY_ICON } from "../../utils/payrollChecks/checkContext";
export const SEVERITY_LABEL = { red: "Rojas: puede ser plata mal pagada", orange: "Naranjas: conviene revisar", info: "Blancas: solo informan" };

// El nivel más grave entre las alertas sin revisar de una lista, o `null`.
// Sin lista (`null` o `undefined`: una persona sin alertas), `null`.
export function worstOpenSeverity(alerts) {
  const open = (alerts || []).filter((a) => !a.review);
  if (open.some((a) => a.severity === "red")) return "red";
  if (open.some((a) => a.severity === "orange")) return "orange";
  return open.length ? "info" : null;
}

// La alerta más grave sin revisar de una fila, roja o naranja; las que solo
// informan no marcan la fila.
export function rowFlag(alerts) {
  const worst = worstOpenSeverity(alerts);
  return worst === "red" || worst === "orange" ? worst : null;
}
