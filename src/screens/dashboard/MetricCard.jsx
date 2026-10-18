// Tarjeta de KPI, con las mismas props que `SummaryCard` de Facturación más
// `hint` y `title`.
export default function MetricCard({
  label,
  value,
  hint,
  highlight = false,
  warning = false,
  subtle = false,
  title,
}) {
  const box = highlight
    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
    : warning
      ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)]"
      : subtle
        ? "border-[var(--color-border)] bg-[var(--color-surface-2)]"
        : "border-[var(--color-border)] bg-[var(--color-surface)]";
  const valueColor = highlight
    ? "text-[var(--color-accent)]"
    : warning
      ? "text-[var(--color-warning)]"
      : "";
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${box}`} title={title}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {hint != null && hint !== "" && (
        <div className="mt-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">{hint}</div>
      )}
    </div>
  );
}
