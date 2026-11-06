// "✓ Septiembre pagado" o "✓ Todas pagadas": marca de una vez lo pendiente de
// un mes o de un cliente de la pestaña Pendientes, después de confirmar.
export function BulkPaidButton({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[32px] whitespace-nowrap rounded-md border border-[var(--color-success)] bg-[var(--color-success-soft)] px-2 py-1 text-xs font-medium text-[var(--color-success)] hover:opacity-90 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
