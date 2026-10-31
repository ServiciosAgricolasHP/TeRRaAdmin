import { useMemo, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import { commitmentSeriesService, saveSeriesEdit } from "../../services/commitmentsService";
import { seriesRows, seriesChanges, seriesRowError, remainingOf, partialPaidOf, applySeriesTool } from "../../utils/commitments";
import { fmtCurrency } from "../../utils/format";
import { fmtDate } from "./helpers";
import { StatusChip } from "./StatusChip";
import { btnCls, primaryCls } from "./styles";
import { attempt } from "../../utils/attempt";

// Ajuste de una serie (crédito, deuda personal en cuotas o pago recurrente):
// fecha y monto de cada vencimiento abierto, a mano o con herramientas que se
// aplican desde un vencimiento en adelante. En un pago recurrente, el día y el
// monto aplicados con las herramientas también valen para lo que se genere
// después. Nada se guarda hasta "Guardar".
export function SeriesEditModal({ item, items, today, onCancel, onSaved }) {
  const toast = useToast();
  const seriesItems = useMemo(() => items.filter((c) => c.seriesId === item.seriesId), [items, item.seriesId]);
  const byId = useMemo(() => new Map(seriesItems.map((c) => [c.id, c])), [seriesItems]);
  const recurring = !item.installment?.of;
  const [rows, setRows] = useState(() => seriesRows(seriesItems));
  const [seriesPatch, setSeriesPatch] = useState({});
  const [fromIndex, setFromIndex] = useState(() => Math.max(0, seriesRows(seriesItems).findIndex((r) => r.editable)));
  const [tool, setTool] = useState({ months: "1", day: "", amount: "" });
  const [busy, setBusy] = useState(false);

  const editableIdx = rows.map((r, i) => (r.editable ? i : -1)).filter((i) => i >= 0);
  const changes = seriesChanges(seriesItems, rows);
  const errors = rows.map((r) => seriesRowError(r, byId.get(r.id)));
  const hasErrors = errors.some(Boolean);
  const pendingBefore = seriesItems.reduce((s, c) => s + remainingOf(c), 0);
  const pendingAfter = rows.reduce((s, r) => {
    const c = byId.get(r.id);
    return r.editable ? s + Math.max(0, Math.round(Number(r.amount) || 0) - partialPaidOf(c)) : s;
  }, 0);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const apply = (kind) => {
    if (kind === "months") {
      const months = Math.trunc(Number(tool.months) || 0);
      if (!months) return;
      setRows((rs) => applySeriesTool(rs, { fromIndex, months }));
    } else if (kind === "day") {
      const day = Math.trunc(Number(tool.day) || 0);
      if (day < 1 || day > 31) return toast.error("El día va de 1 a 31");
      setRows((rs) => applySeriesTool(rs, { fromIndex, day }));
      if (recurring) setSeriesPatch((p) => ({ ...p, dayOfMonth: day }));
    } else {
      const amount = Math.round(Number(tool.amount) || 0);
      if (!(amount > 0)) return toast.error("El monto debe ser mayor a 0");
      setRows((rs) => applySeriesTool(rs, { fromIndex, amount }));
      if (recurring) setSeriesPatch((p) => ({ ...p, amount }));
    }
  };

  const reset = () => {
    setRows(seriesRows(seriesItems));
    setSeriesPatch({});
  };

  const save = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const series = recurring ? await commitmentSeriesService.getById(item.seriesId) : null;
      const n = await saveSeriesEdit(series, seriesItems, changes, seriesPatch);
      await onSaved(n);
    });
    if (err) toast.error(err.message || String(err));
    setBusy(false);
  };

  const toolInputCls = "w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";
  const dirty = changes.length > 0 || Object.keys(seriesPatch).length > 0;

  return (
    <Modal
      open
      size="xl"
      onClose={onCancel}
      dirty={dirty && !busy}
      title={`${recurring ? "Ajustar vencimientos" : "Ajustar cuotas"} · ${item.counterparty}`}
      footer={
        <>
          <div className="mr-auto self-center text-xs text-[var(--color-muted)]">
            {changes.length} cambio(s) · pendiente {fmtCurrency(pendingBefore)}
            {pendingAfter !== pendingBefore && <> → <b className="text-[var(--color-text)]">{fmtCurrency(pendingAfter)}</b></>}
          </div>
          {dirty && (
            <button type="button" className={btnCls} onClick={reset} disabled={busy}>
              Deshacer cambios
            </button>
          )}
          <ModalCloseButton className={btnCls}>Cancelar</ModalCloseButton>
          <button type="button" className={primaryCls} disabled={!dirty || hasErrors || busy} onClick={save}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      {editableIdx.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No queda nada abierto para ajustar: todo está pagado o anulado.</p>
      ) : (
        <div className="mb-4 space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">Aplicar desde</span>
            <select
              value={fromIndex}
              onChange={(e) => setFromIndex(Number(e.target.value))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            >
              {editableIdx.map((i) => (
                <option key={rows[i].id} value={i}>
                  {rows[i].n ? `Cuota ${rows[i].n}` : fmtDate(byId.get(rows[i].id)?.dueDate)} en adelante
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={tool.months}
                onChange={(e) => setTool((t) => ({ ...t, months: e.target.value }))}
                className={toolInputCls}
                title="Meses (negativo para adelantar)"
              />
              <button type="button" className={btnCls} onClick={() => apply("months")}>Correr meses</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="31"
                inputMode="numeric"
                placeholder="Día"
                value={tool.day}
                onChange={(e) => setTool((t) => ({ ...t, day: e.target.value }))}
                className={toolInputCls}
              />
              <button type="button" className={btnCls} onClick={() => apply("day")}>Cambiar día</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="Monto"
                value={tool.amount}
                onChange={(e) => setTool((t) => ({ ...t, amount: e.target.value }))}
                className={`${toolInputCls} w-32`}
              />
              <button type="button" className={btnCls} onClick={() => apply("amount")}>Poner monto</button>
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Las herramientas solo cambian lo abierto. Un aplazado o protestado al que se le cambia la fecha vuelve a pendiente.
            {recurring && " En un pago recurrente, el día y el monto también valen para los vencimientos que se generen después."}
          </p>
        </div>
      )}

      <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
        {rows.map((r, i) => {
          const c = byId.get(r.id);
          const changed = changes.some((x) => x.id === r.id);
          const partial = partialPaidOf(c);
          return (
            <div
              key={r.id}
              className={`grid grid-cols-[3rem_1fr_1fr] items-center gap-x-2 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[3.5rem_11rem_10rem_1fr] ${
                r.editable ? "" : "opacity-60"
              } ${changed ? "bg-[var(--color-accent-soft)]" : ""}`}
            >
              <div className="tabular-nums text-[var(--color-muted)]">{r.n ? `${r.n}/${c.installment.of}` : i + 1}</div>
              {r.editable ? (
                <>
                  <input
                    type="date"
                    value={r.dueDate}
                    onChange={(e) => setRow(i, { dueDate: e.target.value })}
                    className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={r.amount}
                    onChange={(e) => setRow(i, { amount: e.target.value })}
                    className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm tabular-nums"
                  />
                </>
              ) : (
                <>
                  <div className="tabular-nums">{fmtDate(r.dueDate)}</div>
                  <div className="text-right tabular-nums">{fmtCurrency(r.amount)}</div>
                </>
              )}
              <div className="col-span-3 flex flex-wrap items-center gap-2 sm:col-span-1">
                <StatusChip c={c} today={today} />
                {partial > 0 && <span className="text-xs text-[var(--color-muted)]">abonado {fmtCurrency(partial)}</span>}
                {errors[i] && <span className="text-xs text-[var(--color-danger)]">{errors[i]}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
