import { formatRutForDisplay } from "../../utils/rutUtils";
import { CONTRIBUTION_REQUESTS, END_REASONS } from "../../utils/employment";
import { contributionItemKey, contributionsByFaena } from "../../utils/contributionLists";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const daysLabel = (n) => `${n} día${n === 1 ? "" : "s"}`;

const cellInput =
  "w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-right text-sm outline-none focus:border-[var(--color-accent)]";

// Lo que se pide al contador por una fila: la liquidación y, si el contrato
// terminó ese mes, el finiquito con su fecha y motivo.
function RequestTag({ it }) {
  const settlement = it.request === "payslipAndSettlement";
  return (
    <span className={settlement ? "text-[var(--color-warning)]" : ""}>
      {CONTRIBUTION_REQUESTS[it.request] || "—"}
      {settlement && it.endDate && <span className="text-xs"> · {fmt(it.endDate)}{it.endReason ? ` · ${END_REASONS[it.endReason]}` : ""}</span>}
    </span>
  );
}

// Las filas de una lista de imposiciones, por faena y con su total. Al armarla
// (`editable`) se editan los días y se quitan filas. `onChange(key, patch)` y
// `onRemove(key)` usan `contributionItemKey` (`utils/contributionLists.js`).
export default function ContributionItemsTable({ items, editable = false, onChange, onRemove }) {
  const days = (it) =>
    editable ? (
      <input
        type="number"
        min="0"
        value={it.days}
        onChange={(e) => onChange(contributionItemKey(it), { days: Math.max(0, Number(e.target.value) || 0) })}
        className={cellInput}
        aria-label={`Días de ${it.name}`}
      />
    ) : (
      it.days
    );
  const remove = (it) =>
    editable && (
      <button type="button" onClick={() => onRemove(contributionItemKey(it))} aria-label={`Quitar a ${it.name}`} className="rounded px-2 text-[var(--color-muted)] hover:text-[var(--color-danger)]">
        ✕
      </button>
    );

  return (
    <div className="space-y-4">
      {contributionsByFaena(items).map((g) => (
        <section key={g.faenaId || "none"}>
          <h3 className="mb-1 text-sm font-semibold">
            {g.faenaName}
            <span className="font-normal text-[var(--color-muted)]"> · {g.items.length} · {daysLabel(g.totals.days)}</span>
          </h3>
          <div className="hidden overflow-x-auto rounded-md border border-[var(--color-border)] md:block">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="px-2 py-1.5">Persona</th>
                  <th className="px-2 py-1.5 text-right">Días</th>
                  <th className="px-2 py-1.5">Solicitud</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={contributionItemKey(it)} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-[var(--color-muted)]">{formatRutForDisplay(it.rut)}</div>
                    </td>
                    <td className="w-24 px-2 py-1.5 text-right tabular-nums">{days(it)}</td>
                    <td className="px-2 py-1.5"><RequestTag it={it} /></td>
                    <td className="w-px px-2 py-1.5">{remove(it)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {g.items.map((it) => (
              <div key={contributionItemKey(it)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="text-xs text-[var(--color-muted)]">{formatRutForDisplay(it.rut)}</div>
                  </div>
                  {remove(it)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1">Días {days(it)}</span>
                  <RequestTag it={it} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
