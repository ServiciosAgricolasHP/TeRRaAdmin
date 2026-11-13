import Modal from "../../../components/Modal";
import { fmtCurrency } from "../../../utils/format";
import { advancesAndBonusesOf } from "../../../utils/payrollDetail";

// Los anticipos y bonos que aplicó la nómina, por persona, con la fecha y la
// nota de cada uno. Arriba, cómo se llega del bruto al total a pagar.
// `advances` son los del snapshot; mientras carga, las filas van sin fecha ni
// nota. Con `onChangeBonus(item, bonusId)`, cada bono que se puede cambiar
// (`canChangeBonus(item)`) lleva "✎ Editar".
export function AdvancesAndBonusesModal({ open, onClose, items, advances, grossTotal, total, onChangeBonus = null, canChangeBonus }) {
  const itemOf = (rut) => items.find((it) => it.rut === rut);
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
      title="↩ Anticipos y bonos de la nómina"
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
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Figure label="Bruto" value={fmtCurrency(grossTotal)} />
        <Figure label="Anticipos" value={`− ${fmtCurrency(advanceTotal)}`} tone="text-[var(--color-warning)]" />
        <Figure label="Bonos" value={`+ ${fmtCurrency(bonusTotal)}`} tone="text-[var(--color-success)]" />
        <Figure label="Total a pagar" value={fmtCurrency(total)} tone="text-[var(--color-accent)]" />
      </div>
      <div className="space-y-4">
        <AdjustmentList title="↩ Anticipos" rows={advanceRows} total={`− ${fmtCurrency(advanceTotal)}`} tone="text-[var(--color-warning)]" actionColumn={!!bonusAction} />
        <AdjustmentList title="🎁 Bonos" rows={bonuses} total={`+ ${fmtCurrency(bonusTotal)}`} tone="text-[var(--color-success)]" action={bonusAction} actionColumn={!!bonusAction} />
      </div>
    </Modal>
  );
}

function Figure({ label, value, tone = "" }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`whitespace-nowrap text-base font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

// `actionColumn` deja la columna de la acción también en la lista que no la
// usa, así las dos tablas quedan alineadas.
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
              <th className="w-24 px-2 py-1.5 text-left sm:w-28">Fecha</th>
              <th className="hidden px-2 py-1.5 text-left sm:table-cell">Nota</th>
              <th className="w-24 px-2 py-1.5 text-right sm:w-28">Monto</th>
              {actionColumn && <th className="w-24 px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.advanceId}-${r.rut}-${i}`} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1.5">
                  <div className="font-medium break-words sm:truncate" title={r.name}>{r.name}</div>
                  {r.note && <div className="text-[11px] text-[var(--color-muted)] sm:hidden">{r.note}</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-[var(--color-muted)]">{r.date || "—"}</td>
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
