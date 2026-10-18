export function ChartCard({ title, hint, empty, wide = false, children }) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-md ${
        wide ? "lg:col-span-2" : ""
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</h3>
        {hint && <span className="text-[10px] text-[var(--color-muted)]">{hint}</span>}
      </div>
      {empty ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-[var(--color-muted)]">
          Sin datos en el período.
        </div>
      ) : (
        children
      )}
    </div>
  );
}
