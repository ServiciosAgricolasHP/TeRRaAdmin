import { useState } from "react";
import Modal from "../../../components/Modal";
import { fmtCurrency } from "../../../utils/format";
import { advancesAndBonusesOf } from "../../../utils/payrollDetail";
import { payoutRowsOf } from "../../../utils/advancePayouts";

// Los anticipos y bonos que aplicó la nómina y los anticipos que entrega, por
// persona, con la fecha y la nota de cada uno. Arriba, cómo se llega del bruto
// al total a pagar. `advances` son los del snapshot; mientras carga, las filas
// van sin fecha ni nota. Con `onChangeBonus(item, bonusId)`, cada bono que se
// puede cambiar (`canChangeBonus(item)`) lleva "✎ Editar"; con
// `onRemovePayouts(rows)`, los anticipos entregados se marcan y se quitan
// todos juntos con "✕ Quitar".
export function AdvancesAndBonusesModal({ open, onClose, items, advances, grossTotal, total, onChangeBonus = null, canChangeBonus, onRemovePayouts = null }) {
  const itemOf = (rut) => items.find((it) => it.rut === rut);
  const payouts = payoutRowsOf(items);
  const payoutTotal = payouts.reduce((s, r) => s + r.amount, 0);
  // Los anticipos entregados marcados para quitar, por `advanceId`.
  const [picked, setPicked] = useState(NO_PICKS);
  const chosen = payouts.filter((r) => picked.has(r.advanceId));
  const togglePick = (advanceId) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(advanceId)) next.delete(advanceId);
      else next.add(advanceId);
      return next;
    });
  const allPicked = payouts.length > 0 && chosen.length === payouts.length;
  const payoutAction = onRemovePayouts
    ? (r) => (
        <label className="flex min-h-8 cursor-pointer items-center justify-end gap-1.5 text-xs" title="Marcar para quitarlo de la nómina">
          <span className="text-[var(--color-muted)]">Quitar</span>
          <input type="checkbox" checked={picked.has(r.advanceId)} onChange={() => togglePick(r.advanceId)} className="h-4 w-4" />
        </label>
      )
    : null;
  const payoutHeader = onRemovePayouts && payouts.length > 0 && (
    <div className="mb-1.5 flex flex-wrap items-center justify-end gap-2 text-xs">
      <button
        type="button"
        onClick={() => setPicked(allPicked ? NO_PICKS : new Set(payouts.map((r) => r.advanceId)))}
        className="min-h-8 rounded-md border border-[var(--color-border)] px-2 hover:bg-[var(--color-accent-soft)]"
      >
        {allPicked ? "Desmarcar todos" : "Marcar todos"}
      </button>
      <button
        type="button"
        disabled={chosen.length === 0}
        onClick={() => {
          onRemovePayouts(chosen);
          setPicked(NO_PICKS);
        }}
        title="Quitar de la nómina los anticipos marcados: vuelven a quedar sin entregar"
        className="min-h-8 rounded-md border border-[var(--color-danger)] px-2 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40"
      >
        ✕ Quitar{chosen.length ? ` ${chosen.length} · ${fmtCurrency(chosen.reduce((s, r) => s + r.amount, 0))}` : " los marcados"}
      </button>
    </div>
  );
  const actionColumn = !!onChangeBonus || !!onRemovePayouts;
  const bonusAction = onChangeBonus
    ? (r) => {
        const item = itemOf(r.rut);
        if (!item || !canChangeBonus(item)) return null;
        return (
          <button
            type="button"
            onClick={() => onChangeBonus(item, r.advanceId)}
            title="Editar el monto o la nota de este bono en la nómina"
            className="min-h-8 whitespace-nowrap rounded-md border border-[var(--color-border)] px-2 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            ✎ Editar
          </button>
        );
      }
    : null;
  const { advances: advanceRows, bonuses, advanceTotal, bonusTotal } = advancesAndBonusesOf(items, advances);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📋 Anticipos y bonos de la nómina"
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
      <div className={`mb-4 grid grid-cols-2 gap-3 text-sm ${payoutTotal > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        <Figure label="Bruto" value={fmtCurrency(grossTotal)} />
        <Figure label="Anticipos" value={`− ${fmtCurrency(advanceTotal)}`} tone="text-[var(--color-warning)]" />
        <Figure label="Bonos" value={`+ ${fmtCurrency(bonusTotal)}`} tone="text-[var(--color-success)]" />
        {payoutTotal > 0 && <Figure label="Entregados" value={`+ ${fmtCurrency(payoutTotal)}`} tone="text-[var(--color-accent)]" />}
        <Figure label="Total a pagar" value={fmtCurrency(total)} tone="text-[var(--color-accent)]" />
      </div>
      <div className="space-y-4">
        <AdjustmentList title="↩ Anticipos" rows={advanceRows} total={`− ${fmtCurrency(advanceTotal)}`} tone="text-[var(--color-warning)]" actionColumn={actionColumn} />
        <AdjustmentList title="🎁 Bonos" rows={bonuses} total={`+ ${fmtCurrency(bonusTotal)}`} tone="text-[var(--color-success)]" action={bonusAction} actionColumn={actionColumn} />
        <AdjustmentList title="💸 Anticipos entregados" rows={payouts} total={`+ ${fmtCurrency(payoutTotal)}`} tone="text-[var(--color-accent)]" action={payoutAction} actionColumn={actionColumn} />
        {payoutHeader}
      </div>
    </Modal>
  );
}

const NO_PICKS = new Set();

function Figure({ label, value, tone = "" }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`whitespace-nowrap text-base font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

// `actionColumn` deja la columna de la acción también en la lista que no la
// usa, así las tablas quedan alineadas. En el teléfono, la fecha y la nota van
// bajo el nombre.
function AdjustmentList({ title, rows, total, tone, action = null, actionColumn = false }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {title} ({rows.length})
        </h3>
        <span className={`ml-auto font-semibold tabular-nums ${tone}`}>{total}</span>
      </div>
      <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-2 py-1.5 text-left">Trabajador</th>
              <th className="hidden w-28 px-2 py-1.5 text-left sm:table-cell">Fecha</th>
              <th className="hidden px-2 py-1.5 text-left sm:table-cell">Nota</th>
              <th className="w-24 px-2 py-1.5 text-right sm:w-28">Monto</th>
              {actionColumn && <th className="w-[84px] px-2 py-1.5 sm:w-24" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.advanceId}-${r.rut}-${i}`} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1.5">
                  <div className="font-medium break-words sm:truncate" title={r.name}>{r.name}</div>
                  <div className="text-[11px] text-[var(--color-muted)] sm:hidden">{[r.date, r.note].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="hidden whitespace-nowrap px-2 py-1.5 text-xs text-[var(--color-muted)] sm:table-cell">{r.date || "—"}</td>
                <td className="hidden truncate px-2 py-1.5 text-xs text-[var(--color-muted)] sm:table-cell" title={r.note}>{r.note || "—"}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{fmtCurrency(r.amount)}</td>
                {actionColumn && <td className="px-2 py-1 text-right">{action ? action(r) : null}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
