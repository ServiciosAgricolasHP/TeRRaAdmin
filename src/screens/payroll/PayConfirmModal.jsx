import { useState, useEffect } from "react";
import { pendingCashOf } from "../../services/payrollsService";
import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";

export function PayConfirmModal({ info, onCancel, onConfirm }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (info) { setText(""); setBusy(false); } }, [info]);
  if (!info) return null;
  const { payroll: p, mode } = info;
  const isRevert = mode === "revert" || mode === "revertBank";
  const owedCash = pendingCashOf(p);
  const COPY = {
    pay: {
      keyword: "Pagado",
      title: "Marcar como pagada",
      intro: p.bankPaidAt
        ? "Las transferencias ya estaban selladas, así que esto cierra el efectivo que faltaba. Los días de efectivo quedan sellados con la fecha de hoy."
        : "Vas a marcar esta nómina como pagada. Los días asociados quedan sellados con la fecha de pago.",
    },
    revert: {
      keyword: "No pagado",
      title: "Marcar como NO pagada",
      intro:
        "Vas a revertir esta nómina: el estado vuelve a pendiente y se liberan los días asociados (quedan disponibles para una nueva nómina). También se borra el sello de las transferencias y quiénes habían cobrado sueltos.",
    },
    bank: {
      keyword: "Transferencias",
      title: "Marcar solo las transferencias como pagadas",
      intro:
        "Vas a registrar que salieron las transferencias pero el efectivo todavía no. La nómina sigue PENDIENTE (porque no está pagada entera), pero su efectivo pasa a contarse como deuda y aparece al armar la nómina siguiente.",
    },
    revertBank: {
      keyword: "Revertir",
      title: "Revertir el pago de las transferencias",
      intro:
        "Vas a deshacer el sello de las transferencias: los días de los trabajadores de banco vuelven a quedar sin fecha de pago y el efectivo deja de contarse como deuda.",
    },
  };
  const { keyword, title, intro } = COPY[mode] || COPY.pay;
  const ok = text.trim().toLowerCase() === keyword.toLowerCase();
  return (
    <Modal
      open
      onClose={() => !busy && onCancel()}
      title={title}
      size="md"
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              if (!ok) return;
              setBusy(true);
              try { await onConfirm(); } finally { setBusy(false); }
            }}
            disabled={!ok || busy}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              isRevert
                ? "border border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white"
                : "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
            }`}
          >
            {busy ? "Procesando..." : isRevert ? "Revertir" : "Confirmar"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-[var(--color-muted)] mt-1">
            {p.workerCount || 0} trab. · {fmtCurrency(p.total || 0)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-[var(--color-muted)]">
            <span>🏦 {fmtCurrency(p.bankTotal || 0)}</span>
            <span>💵 {fmtCurrency(p.cashTotal || 0)}</span>
            {owedCash > 0 && (
              <span className="font-semibold text-[var(--color-warning)]">
                Efectivo debiendo: {fmtCurrency(owedCash)}
              </span>
            )}
          </div>
        </div>
        <p className="text-[var(--color-muted)]">{intro}</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
            Para confirmar, escribe <code className="rounded bg-[var(--color-surface-2)] px-1 font-semibold">{keyword}</code>:
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            placeholder={keyword}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}
