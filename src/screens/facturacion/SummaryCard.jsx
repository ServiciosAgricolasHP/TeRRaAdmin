export function SummaryCard({ label, value, highlight = false, warning = false, subtle = false }) {
  const cls = highlight
    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
    : warning
      ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)]"
      : subtle
        ? "border-[var(--color-border)] bg-[var(--color-surface-2)]"
        : "border-[var(--color-border)] bg-[var(--color-surface)]";
  const valueCls = highlight
    ? "text-[var(--color-accent)]"
    : warning
      ? "text-[var(--color-warning)]"
      : "";
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueCls}`}>{value}</div>
    </div>
  );
}
