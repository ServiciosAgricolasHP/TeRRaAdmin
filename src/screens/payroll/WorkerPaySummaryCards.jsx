import { fmtCurrency } from "../../utils/format";

// Tarjetas bruto/anticipos/bonos/neto de un item de nómina — usado tanto en
// la fila expandible de PayrollDetailModal como en el modal enfocado que se
// abre desde el historial del trabajador (mismo contenido, dos entradas).
export function WorkerPaySummaryCards({ item }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Bruto</div>
        <div className="font-bold tabular-nums">{fmtCurrency(item.grossAmount || item.amount || 0)}</div>
      </div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Anticipos</div>
        <div className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {Number(item.advance) > 0 ? `−${fmtCurrency(item.advance)}` : "—"}
        </div>
        {(item.anticipoApplications || []).length > 0 && (
          <div className="mt-0.5 text-[9px] text-[var(--color-muted)]">
            {(item.anticipoApplications || []).length} aplicación{(item.anticipoApplications || []).length === 1 ? "" : "es"}
          </div>
        )}
      </div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Bonos</div>
        <div className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {Number(item.bonus) > 0 ? `+${fmtCurrency(item.bonus)}` : "—"}
        </div>
        {(item.bonoApplications || []).length > 0 && (
          <div className="mt-0.5 text-[9px] text-[var(--color-muted)]">
            {(item.bonoApplications || []).length} aplicación{(item.bonoApplications || []).length === 1 ? "" : "es"}
          </div>
        )}
      </div>
      <div className="rounded border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Neto</div>
        <div className="font-bold tabular-nums text-[var(--color-accent)]">{fmtCurrency(item.amount || 0)}</div>
      </div>
    </div>
  );
}
