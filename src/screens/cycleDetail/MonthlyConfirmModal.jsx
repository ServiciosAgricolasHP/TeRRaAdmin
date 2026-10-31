import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";
import { useCycleDetail } from "./CycleDetailContext";

// Confirma marcar como mensual a alguien que ya tiene días con monto: pasa a
// asistencia en $0 los días que no están en una nómina, o deja los montos.
export function MonthlyConfirmModal() {
  const { confirmMonthly, monthlyBusy, monthlyConfirm, setMonthlyConfirm } = useCycleDetail();
  return (
    <Modal
      open={!!monthlyConfirm}
      onClose={() => !monthlyBusy && setMonthlyConfirm(null)}
      title={`Marcar a ${monthlyConfirm?.name || ""} como mensual`}
      size="sm"
      footer={monthlyConfirm && (
        <>
          <button
            type="button"
            onClick={() => setMonthlyConfirm(null)}
            disabled={monthlyBusy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => confirmMonthly(false)}
            disabled={monthlyBusy}
            className={monthlyConfirm.free.length > 0
              ? "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              : "rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"}
          >
            {monthlyConfirm.free.length > 0 ? "Dejar los montos" : "Marcar mensual"}
          </button>
          {monthlyConfirm.free.length > 0 && (
            <button
              type="button"
              onClick={() => confirmMonthly(true)}
              disabled={monthlyBusy}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {monthlyBusy ? "..." : "Pasar a asistencia en $0"}
            </button>
          )}
        </>
      )}
    >
      {monthlyConfirm && (
        <div className="space-y-2 text-sm text-[var(--color-muted)]">
          <p>
            Como mensual, sus días en esta labor son solo asistencia en $0 y no entran a la nómina.
          </p>
          {monthlyConfirm.free.length > 0 && (
            <p>
              Ya tiene <b className="text-[var(--color-text)]">{monthlyConfirm.free.length} día{monthlyConfirm.free.length === 1 ? "" : "s"} con monto</b>{" "}
              por <b className="text-[var(--color-text)]">{fmtCurrency(monthlyConfirm.freeTotal)}</b> que todavía no están en una nómina.
              Si dejas los montos, la grilla va a mostrar ✓ en esos días pero se van a seguir pagando.
            </p>
          )}
          {monthlyConfirm.inPayroll > 0 && (
            <p>
              {monthlyConfirm.inPayroll} día{monthlyConfirm.inPayroll === 1 ? "" : "s"} con monto ya{" "}
              {monthlyConfirm.inPayroll === 1 ? "está" : "están"} en una nómina y no se {monthlyConfirm.inPayroll === 1 ? "toca" : "tocan"}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
