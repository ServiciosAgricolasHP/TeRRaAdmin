// Fila etiqueta + valor. Toda la fila es un botón que copia el valor, así
// funciona en móvil, donde no hay hover. Con el valor vacío no renderiza nada.
export default function Field({ label, value, copyValue, onCopy, mono = false }) {
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => onCopy(copyValue ?? value, label)}
      title={`Copiar ${label}`}
      className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-sm transition-colors hover:bg-[var(--color-accent-soft)] active:bg-[var(--color-accent-soft)]"
    >
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
      <span className={`min-w-0 flex-1 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
      <span className="shrink-0 text-xs text-[var(--color-muted)]">📋</span>
    </button>
  );
}
