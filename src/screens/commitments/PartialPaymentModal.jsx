import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import { addDebtPartialPayment, addPartialPayment, removePartialPayment } from "../../services/commitmentsService";
import { isOpen, remainingOf, allocatePartialPayment } from "../../utils/commitments";
import { fmtCurrency } from "../../utils/format";
import { fmtDate } from "./helpers";
import { btnCls, primaryCls, labelCls, inputCls } from "./styles";
import { attempt } from "../../utils/attempt";

// Orden de una serie: por fecha y, a igual fecha, por número de cuota.
const bySeriesOrder = (a, b) =>
  a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : (a.installment?.n || 0) - (b.installment?.n || 0);

const installmentLabel = (c) => (c.installment?.of ? `Cuota ${c.installment.n}/${c.installment.of}` : fmtDate(c.dueDate));

// Abonos de una deuda personal: a una cuota o a toda la deuda (se reparte de
// la cuota más antigua a la más nueva). Muestra lo abonado hasta ahora y deja
// quitar un abono; uno a toda la deuda se quita entero.
export function PartialPaymentModal({ item, items, today, onClose, onSaved }) {
  const toast = useToast();
  const debt = (item.seriesId ? items.filter((c) => c.seriesId === item.seriesId) : items.filter((c) => c.id === item.id)).sort(
    bySeriesOrder,
  );
  const open = debt.filter(isOpen);
  const inSeries = debt.length > 1;
  const [target, setTarget] = useState(inSeries ? "debt" : item.id);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const value = Math.round(Number(amount) || 0);
  const totalOriginal = debt.filter((c) => c.status !== "cancelled").reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalRemaining = open.reduce((s, c) => s + remainingOf(c), 0);
  const targetItem = target === "debt" ? null : debt.find((c) => c.id === target);
  const available = targetItem ? remainingOf(targetItem) : totalRemaining;
  const allocation = target === "debt" && value > 0 ? allocatePartialPayment(debt, value).parts : [];
  const error = value > available ? `Es más que lo que falta (${fmtCurrency(available)})` : "";
  const canSave = open.length > 0 && value > 0 && !!date && !error && (target === "debt" || isOpen(targetItem || {}));
  // Un abono escrito y sin registrar.
  const dirty = !busy && (String(amount).trim() !== "" || notes.trim() !== "");

  // Historial: un abono a toda la deuda se muestra una vez, con sus partes.
  const historyRows = new Map();
  for (const c of debt) {
    for (const p of c.partialPayments || []) {
      const key = p.groupId || p.id;
      if (!historyRows.has(key)) historyRows.set(key, { key, payment: p, date: p.date, notes: p.notes, amount: 0, parts: [] });
      const row = historyRows.get(key);
      row.amount += Number(p.amount) || 0;
      row.parts.push(installmentLabel(c));
    }
  }
  const history = [...historyRows.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const save = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const input = { date, amount: value, notes };
      if (target === "debt") await addDebtPartialPayment(debt, input);
      else await addPartialPayment(targetItem, input);
      setAmount("");
      setNotes("");
      await onSaved(`Abono de ${fmtCurrency(value)} registrado`);
    });
    if (err) toast.error(err.message || String(err));
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      await removePartialPayment(debt, removing.payment);
      setRemoving(null);
      await onSaved("Abono quitado");
    });
    if (err) toast.error(err.message || String(err));
    setBusy(false);
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dirty={dirty}
      title={`Abonos · ${item.counterparty}`}
      footer={
        <>
          <ModalCloseButton className={btnCls}>Cerrar</ModalCloseButton>
          {open.length > 0 && (
            <button type="button" className={primaryCls} disabled={!canSave || busy} onClick={save}>
              {busy ? "Guardando…" : "Registrar abono"}
            </button>
          )}
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
        {[
          { label: "Deuda", value: totalOriginal },
          { label: "Pagado", value: totalOriginal - totalRemaining },
          { label: "Falta", value: totalRemaining, strong: true },
        ].map((x) => (
          <div key={x.label} className="rounded-md border border-[var(--color-border)] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{x.label}</div>
            <div className={`tabular-nums ${x.strong ? "font-semibold" : ""}`}>{fmtCurrency(x.value)}</div>
          </div>
        ))}
      </div>

      {open.length === 0 ? (
        <p className="mb-4 text-sm text-[var(--color-muted)]">La deuda está pagada completa.</p>
      ) : (
        <div className="space-y-3">
          {inSeries && (
            <div>
              <label className={labelCls}>Abonar a</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls}>
                <option value="debt">Toda la deuda (desde la cuota más antigua)</option>
                {open.map((c) => (
                  <option key={c.id} value={c.id}>
                    {installmentLabel(c)} · vence {fmtDate(c.dueDate)} · falta {fmtCurrency(remainingOf(c))}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Fecha del abono</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monto (falta {fmtCurrency(available)})</label>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
              />
              {error && <div className="mt-1 text-xs text-[var(--color-danger)]">{error}</div>}
            </div>
          </div>
          <div>
            <label className={labelCls}>Nota (opcional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </div>
          {allocation.length > 0 && !error && (
            <div className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <div className="mb-1 text-xs text-[var(--color-muted)]">Se reparte así:</div>
              {allocation.map((p) => {
                const c = debt.find((x) => x.id === p.id);
                return (
                  <div key={p.id} className="flex justify-between gap-2 tabular-nums">
                    <span>{installmentLabel(c)}</span>
                    <span>
                      {fmtCurrency(p.amount)}
                      <span className="text-xs text-[var(--color-muted)]">
                        {p.closes ? " · queda pagada" : ` · falta ${fmtCurrency(remainingOf(c) - p.amount)}`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <h3 className="mb-2 mt-5 text-sm font-semibold">Abonos registrados</h3>
      {history.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Todavía no hay abonos.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {history.map((h) => (
            <div key={h.key} className="flex items-start gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div>
                  <span className="tabular-nums">{fmtDate(h.date)}</span> · <b className="tabular-nums">{fmtCurrency(h.amount)}</b>
                  <span className="text-[var(--color-muted)]">
                    {" "}· {h.payment.groupId ? `a toda la deuda (${h.parts.join(", ")})` : h.parts[0]}
                  </span>
                </div>
                {h.notes && <div className="text-xs text-[var(--color-muted)]">{h.notes}</div>}
              </div>
              <button
                type="button"
                title="Quitar abono"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-danger)] hover:bg-[var(--color-surface-2)]"
                onClick={() => setRemoving(h)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        title="Quitar abono"
        message={
          removing
            ? `¿Quitar el abono del ${fmtDate(removing.date)} por ${fmtCurrency(removing.amount)}?${
                removing.payment.groupId ? " Era a toda la deuda: se quita de todas las cuotas a las que se repartió." : ""
              } Lo que había dejado pagado vuelve a pendiente.`
            : ""
        }
        confirmLabel="Quitar"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  );
}
