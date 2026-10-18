import { useState } from "react";
import { unshout } from "../../utils/textCase";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import { todayIso } from "./docs";

// Tipos de pago que se pueden registrar en una factura. Cada entrada del array
// `payments` tiene un `kind` que sirve para categorizar (auditoría) y para
// sugerir un monto al agregar. La suma de `amount` de todos los pagos no puede
// superar `factura.total`: se valida al guardar.
const PAYMENT_KINDS = {
  abono: { label: "Abono" },
  neto: { label: "Solo neto" },
  iva: { label: "Solo IVA" },
  total: { label: "Total" },
};

function newPaymentId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Sección de pagos / abonos de una factura. Lista los pagos existentes con
// fecha, tipo, monto y notas, calcula pagado/saldo, y permite agregar nuevos
// con validación de no superar el total de la factura.
export function PaymentsSection({ dteDoc, payments, amountPaid, balance, onSavePayments }) {
  const toast = useToast();
  const total = Number(dteDoc?.total) || 0;
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Sugiere el monto según el kind elegido (saldo completo, neto, IVA); el
  // usuario lo puede cambiar.
  const suggestAmount = (kind) => {
    if (kind === "total") return Math.max(0, total - amountPaid);
    if (kind === "neto") return Number(dteDoc?.neto) || 0;
    if (kind === "iva") return Number(dteDoc?.iva) || 0;
    return ""; // abono: sin sugerencia
  };
  const [newPay, setNewPay] = useState(() => ({
    date: todayIso(), kind: "abono", amount: "", notes: "",
  }));

  const start = () => {
    setNewPay({ date: todayIso(), kind: "abono", amount: "", notes: "" });
    setAdding(true);
  };
  const cancel = () => setAdding(false);

  const onKindChange = (kind) => {
    const s = suggestAmount(kind);
    setNewPay((p) => ({ ...p, kind, amount: s === "" ? p.amount : String(s) }));
  };

  const submit = async () => {
    const amount = Math.round(Number(newPay.amount) || 0);
    if (amount <= 0) { toast.warning("El monto debe ser mayor a 0."); return; }
    if (amountPaid + amount > total + 0.01) {
      toast.error(
        `Total: ${fmtCurrency(total)}\nYa pagado: ${fmtCurrency(amountPaid)}\nSaldo: ${fmtCurrency(balance)}\nIntento: ${fmtCurrency(amount)}`,
        { title: "El abono excede el total de la factura" },
      );
      return;
    }
    if (!newPay.date) { toast.warning("Tienes que indicar la fecha del pago."); return; }
    const entry = {
      id: newPaymentId(),
      date: newPay.date,
      kind: newPay.kind,
      amount,
      notes: unshout((newPay.notes || "").trim()),
      recordedAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      await onSavePayments([...payments, entry]);
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = (id) => setConfirmDeleteId(id);
  const doRemove = async () => {
    if (!confirmDeleteId) return;
    setBusy(true);
    try {
      await onSavePayments(payments.filter((p) => p.id !== confirmDeleteId));
    } finally {
      setBusy(false);
      setConfirmDeleteId(null);
    }
  };

  const fullyPaid = balance <= 0.01;

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
          Pagos / abonos
        </div>
        <div className="text-xs">
          <span className="text-[var(--color-muted)]">Pagado: </span>
          <span className="font-semibold tabular-nums">{fmtCurrency(amountPaid)}</span>
          <span className="mx-2 text-[var(--color-border)]">·</span>
          <span className="text-[var(--color-muted)]">Saldo: </span>
          <span className={`font-semibold tabular-nums ${fullyPaid ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
            {fmtCurrency(balance)}
          </span>
        </div>
      </div>
      {payments.length === 0 ? (
        <div className="px-1 py-2 text-xs italic text-[var(--color-muted)]">Sin pagos registrados.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[var(--color-muted)]">
              <tr>
                <th className="px-1 py-1 text-left">Fecha</th>
                <th className="px-1 py-1 text-left">Tipo</th>
                <th className="px-1 py-1 text-right">Monto</th>
                <th className="px-1 py-1 text-left">Notas</th>
                <th className="px-1 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {[...payments]
                .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                .map((p) => (
                  <tr key={p.id} className="border-t border-[var(--color-border)]">
                    <td className="px-1 py-1 font-mono">{p.date || "—"}</td>
                    <td className="px-1 py-1">
                      <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5">
                        {PAYMENT_KINDS[p.kind]?.label || p.kind}
                      </span>
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums">{fmtCurrency(p.amount)}</td>
                    <td className="px-1 py-1 truncate max-w-[200px]">{p.notes || "—"}</td>
                    <td className="px-1 py-1 text-right">
                      <button
                        onClick={() => remove(p.id)}
                        disabled={busy}
                        title="Eliminar pago"
                        className="rounded px-1 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {adding ? (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className="mb-0.5 block text-[10px] text-[var(--color-muted)]">Fecha</label>
              <input
                type="date"
                value={newPay.date}
                onChange={(e) => setNewPay({ ...newPay, date: e.target.value })}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-[var(--color-muted)]">Tipo</label>
              <select
                value={newPay.kind}
                onChange={(e) => onKindChange(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
              >
                {Object.entries(PAYMENT_KINDS).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-[var(--color-muted)]">
                Monto <span className="text-[var(--color-muted)]">(máx {fmtCurrency(balance)})</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={newPay.amount}
                onChange={(e) => setNewPay({ ...newPay, amount: e.target.value })}
                placeholder="0"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-[var(--color-muted)]">Notas</label>
              <input
                type="text"
                value={newPay.notes}
                onChange={(e) => setNewPay({ ...newPay, notes: e.target.value })}
                placeholder="opcional"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={cancel}
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              {busy ? "Guardando..." : "Registrar pago"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
          <div className="text-[10px] text-[var(--color-muted)]">
            {fullyPaid && payments.length > 0
              ? "✓ Factura totalmente pagada."
              : `Total factura: ${fmtCurrency(total)}.`}
          </div>
          <button
            onClick={start}
            disabled={fullyPaid && payments.length > 0}
            title={fullyPaid && payments.length > 0 ? "Ya no hay saldo pendiente" : "Registrar un nuevo pago o abono"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            + Registrar pago / abono
          </button>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Eliminar pago"
        message="¿Eliminar este pago del registro?"
        confirmLabel="Eliminar"
        danger
        busy={busy}
        onConfirm={doRemove}
        onCancel={() => !busy && setConfirmDeleteId(null)}
      />
    </div>
  );
}
