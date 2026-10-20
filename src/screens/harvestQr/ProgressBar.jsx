// Sin `total` la barra queda indeterminada: sirve para los pasos que no se
// pueden contar de antemano (leer, actualizar el ciclo) y que igual tardan.
export function ProgressBar({ label, done, total }) {
  const pct = total ? Math.round((done / total) * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
        <span>{label}</span>
        {pct != null && <span>{done}/{total}</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div
          className={`h-full bg-[var(--color-accent)] ${pct == null ? "w-1/3 animate-pulse" : "transition-[width] duration-200"}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
