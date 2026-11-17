// Cómo se ve cada nivel de una alerta de la revisión de la nómina.
export const SEVERITY_ICON = { red: "🔴", orange: "🟠", info: "⚪" };
export const SEVERITY_LABEL = { red: "Rojas: puede ser plata mal pagada", orange: "Naranjas: conviene revisar", info: "Blancas: solo informan" };

// El nivel más grave entre las alertas sin revisar de una lista, o `null`.
export function worstOpenSeverity(alerts = []) {
  const open = alerts.filter((a) => !a.review);
  if (open.some((a) => a.severity === "red")) return "red";
  if (open.some((a) => a.severity === "orange")) return "orange";
  return open.length ? "info" : null;
}
