import { checkOf } from "../../utils/payrollChecks/payrollChecks";
import { SEVERITY_ICON, rowFlag } from "./checkSeverity";

// El ícono de la fila: abre la revisión filtrada a esa persona.
export function RowFlag({ alerts, onClick }) {
  const flag = rowFlag(alerts);
  if (!flag) return null;
  const title = alerts
    .filter((a) => !a.review && a.severity !== "info")
    .map((a) => `${checkOf(a.checkId)?.title}: ${a.lines.join("; ")}`)
    .join("\n");
  return (
    <button type="button" onClick={onClick} title={title} aria-label="Ver la revisión de esta persona" className="ml-1.5 inline-flex min-h-8 min-w-8 items-center justify-center rounded align-middle text-xs hover:bg-[var(--color-surface-2)]">
      {SEVERITY_ICON[flag]}
    </button>
  );
}

// El resumen de la revisión en la barra de filtros: cuántas alertas sin
// revisar hay de cada nivel. Abre la revisión.
export function ChecksButton({ summary, onClick }) {
  const parts = ["red", "orange", "info"].filter((s) => summary[s] > 0);
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver la revisión de la nómina"
      className="min-h-8 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
    >
      🔎 {parts.length ? parts.map((s) => `${SEVERITY_ICON[s]} ${summary[s]}`).join(" · ") : "Revisada ✓"}
    </button>
  );
}
