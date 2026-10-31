import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";
import { DebtDetailList } from "./DebtDetailList";

// Los movimientos de un mes de la deuda con transportistas: lo que se generó,
// lo que se pagó y el saldo al cierre. `month` es una fila de
// `transportDebtByMonth`; sin mes, el modal está cerrado.
export function DebtMonthModal({ month, onClose }) {
  return (
    <Modal
      open={!!month}
      onClose={onClose}
      title={`🚐 Movimientos de ${month?.label || ""}`}
      size="lg"
      footer={
        <button
          onClick={onClose}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
        >
          Cerrar
        </button>
      }
    >
      {month && (
        <div className="space-y-4">
          <DebtDetailList
            title="Deuda generada"
            items={month.createdItems}
            total={month.generated}
            color="var(--color-warning)"
          />
          <div>
            <DebtDetailList
              title="Pagado"
              items={month.paidItems}
              total={month.paid}
              color="var(--color-accent)"
            />
            {month.paidItems.length > 0 && (
              <p className="mt-1.5 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-[11px] text-[var(--color-warning)]">
                ⚠ La fecha de pago es la del día en que se marcó como pagado en el sistema, no necesariamente la del
                día en que se entregó la plata. Si un resumen se marcó días después, ese pago aparece en la fecha en
                que se registró.
              </p>
            )}
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-[var(--color-muted)]">Saldo al cierre del mes</span>
              <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(month.balance)}</span>
            </div>
            <div
              className={`mt-1 text-xs font-medium ${
                month.net > 0
                  ? "text-[var(--color-accent)]"
                  : month.net < 0
                    ? "text-[var(--color-warning)]"
                    : "text-[var(--color-muted)]"
              }`}
            >
              {month.net > 0
                ? `Se pagó ${fmtCurrency(month.net)} más de lo generado`
                : month.net < 0
                  ? `Se pagó ${fmtCurrency(-month.net)} menos de lo generado`
                  : "Se pagó exactamente lo generado"}
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-muted)]">
              La deuda se cuenta en el mes del período que cubre el resumen, no en el día en que se armó. Los pagos y
              abonos van por su fecha real. Un resumen saldado muestra el remanente que se pagó al marcarlo, no su
              total original: lo que ya se había abonado antes aparece en el mes de cada abono.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
