import { fmtCurrency } from "../../../utils/format";

// Tarjetas de totales del resumen: transferencias, efectivo (con lo que falta
// entregar y el estimador), anticipos, bonos y el total a pagar.
export function PayrollTotalsCards({ bank, cash, cashGroups, cashPaidMode, items, owedCash, payroll, setShowCashEstimation }) {
  // Totales para el encabezado del resumen.
  const bankTotal = bank.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const cashTotal = cash.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const grossTotal = items.reduce((s, x) => s + (Number(x.grossAmount) || Number(x.amount) || 0), 0);
  const advanceTotal = items.reduce((s, x) => s + (Number(x.advance) || 0), 0);
  const bonusTotal = items.reduce((s, x) => s + (Number(x.bonus) || 0), 0);
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div>
        <div className="text-xs text-[var(--color-muted)]">🏦 Transferencias</div>
        <div className="text-lg font-semibold">{fmtCurrency(bankTotal)}</div>
        <div className="text-[10px] text-[var(--color-muted)]">{bank.length} persona(s)</div>
      </div>
      <div>
        <div className="text-xs text-[var(--color-muted)]">💵 Efectivo</div>
        <div className="text-lg font-semibold">{fmtCurrency(cashTotal)}</div>
        <div className="text-[10px] text-[var(--color-muted)]">{cash.length} persona(s) · {cashGroups.length} grupo(s)</div>
        {cashPaidMode && (
          <div
            className="mt-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-warning)]"
            title="Efectivo que todavía falta entregar. Las transferencias de esta nómina ya se pagaron."
          >
            Falta entregar: {fmtCurrency(owedCash)}
          </div>
        )}
        {cash.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCashEstimation(true)}
            title="Estimar cuántos billetes y monedas se necesitan para pagar el efectivo de esta nómina"
            className="mt-1.5 flex min-h-8 w-full max-w-[220px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
          >
            🧮 Estimar efectivo
          </button>
        )}
      </div>
      {advanceTotal > 0 && (
        <div>
          <div className="text-xs text-[var(--color-muted)]">↩ Anticipos aplicados</div>
          <div className="text-lg font-semibold text-[var(--color-warning)]">− {fmtCurrency(advanceTotal)}</div>
          <div className="text-[10px] text-[var(--color-muted)]">Bruto: {fmtCurrency(grossTotal)}</div>
        </div>
      )}
      {bonusTotal > 0 && (
        <div>
          <div className="text-xs text-[var(--color-muted)]">🎁 Bonos aplicados</div>
          <div className="text-lg font-semibold text-[var(--color-success)]">+ {fmtCurrency(bonusTotal)}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-[var(--color-muted)]">Total a pagar</div>
        <div className="text-lg font-semibold text-[var(--color-accent)]">{fmtCurrency(payroll.total || 0)}</div>
        <div className="text-[10px] text-[var(--color-muted)]">{items.length} trabajador(es)</div>
      </div>
    </div>
  );
}
