import { useState } from "react";
import Modal from "../../components/Modal";
import { isCheque, partialPaidOf, paidLabel, remainingOf } from "../../utils/commitments";
import { fmtCurrency } from "../../utils/format";
import { fmtDate } from "./helpers";
import { btnCls, primaryCls, labelCls, inputCls } from "./styles";
import { attempt } from "../../utils/attempt";

// Marcar pagado (con la fecha y lo que se pagó de verdad) o reprogramar algo
// aplazado o protestado (con la fecha nueva).
export function DateActionModal({ action, onChange, onCancel, onConfirm }) {
  const { item, mode, date } = action;
  const [busy, setBusy] = useState(false);
  const pay = mode === "pay";
  const cheque = isCheque(item.kind);
  const amount = Number(item.amount) || 0;
  const partial = partialPaidOf(item);
  const paid = Math.round(Number(action.paid) || 0);
  const extra = pay ? partial + paid - amount : 0;
  const invalid = !date || (pay && extra < 0);

  const confirm = async () => {
    setBusy(true);
    const { error: err } = await attempt(() => onConfirm({ item, mode, date, extra }));
    setBusy(false);
    if (err) throw err;
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onCancel}
      title={pay ? `Marcar como ${paidLabel(item.kind).toLowerCase()}` : "Reprogramar"}
      footer={
        <>
          <button type="button" className={btnCls} onClick={onCancel}>Cancelar</button>
          <button type="button" className={primaryCls} disabled={invalid || busy} onClick={confirm}>
            {busy ? "Guardando…" : "Confirmar"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm">
        {item.counterparty} · <b>{fmtCurrency(amount)}</b>
        {item.chequeNumber ? ` · cheque N° ${item.chequeNumber}` : ""}
        {pay && partial > 0 && (
          <span className="text-[var(--color-muted)]"> · abonado {fmtCurrency(partial)}, falta {fmtCurrency(remainingOf(item))}</span>
        )}
        {!pay && <span className="text-[var(--color-muted)]"> · vencía el {fmtDate(item.dueDate)}</span>}
      </p>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>
            {pay ? `Fecha en que se ${cheque ? "cobró" : "pagó"}` : `Nueva fecha de ${cheque ? "cobro" : "pago"}`}
          </label>
          <input type="date" value={date} onChange={(e) => onChange({ date: e.target.value })} className={inputCls} />
        </div>
        {pay && (
          <div>
            <label className={labelCls}>Monto {cheque ? "cobrado" : "pagado"}{partial > 0 ? " ahora" : ""}</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={action.paid}
              onChange={(e) => onChange({ paid: e.target.value })}
              className={inputCls}
            />
            {extra > 0 && (
              <div className="mt-1 text-sm">
                Monto original {fmtCurrency(amount)}{partial > 0 ? ` (abonado ${fmtCurrency(partial)})` : ""} + <b>{fmtCurrency(extra)} de interés / extra</b>
              </div>
            )}
            {extra < 0 && (
              <div className="mt-1 text-xs text-[var(--color-danger)]">
                {partial > 0
                  ? `No puede ser menos que lo que falta (${fmtCurrency(remainingOf(item))}). Si cambió el monto, edítalo primero.`
                  : "No puede ser menos que el monto original. Si cambió el monto, edítalo primero."}
              </div>
            )}
            {extra === 0 && (
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                Si se pagó con interés o recargo, pon el total: la diferencia queda como interés.
              </div>
            )}
          </div>
        )}
        {!pay && (
          <p className="text-xs text-[var(--color-muted)]">Vuelve a quedar pendiente con esta fecha y se avisa por correo como cualquier vencimiento.</p>
        )}
      </div>
    </Modal>
  );
}
