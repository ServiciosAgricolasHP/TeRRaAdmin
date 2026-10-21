import { fmtCurrency } from "../../utils/format";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { feeItemKey, itemsByFaena } from "../../utils/feeLists";

const cellInput =
  "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-sm outline-none focus:border-[var(--color-accent)]";

// Las filas de una lista de honorarios, por faena y con su total. Al armarla
// (`mode="draft"`) se editan los días y se quitan filas; en una lista guardada
// (`mode="saved"`) se marca cada boleta emitida con su folio. `onChange(key,
// patch)` y `onRemove(key)` usan `feeItemKey` (`utils/feeLists.js`).
export default function FeeItemsTable({ items, mode, onChange, onRemove }) {
  const draft = mode === "draft";
  const days = (it) =>
    draft ? (
      <input
        type="number"
        min="0"
        value={it.days}
        onChange={(e) => onChange(feeItemKey(it), { days: Math.max(0, Number(e.target.value) || 0) })}
        className={`${cellInput} w-16 text-right`}
        aria-label={`Días de ${it.name}`}
      />
    ) : (
      it.days
    );
  const issued = (it) => (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={!!it.issued}
        onChange={(e) => onChange(feeItemKey(it), { issued: e.target.checked })}
        aria-label={`Boleta emitida de ${it.name}`}
      />
      <input
        value={it.folio || ""}
        onChange={(e) => onChange(feeItemKey(it), { folio: e.target.value, issued: it.issued || !!e.target.value.trim() })}
        placeholder="Folio"
        className={`${cellInput} w-20`}
        aria-label={`Folio de ${it.name}`}
      />
    </span>
  );

  return (
    <div className="space-y-4">
      {itemsByFaena(items).map((g) => (
        <section key={g.faenaId || "none"}>
          <h3 className="mb-1 text-sm font-semibold">
            {g.faenaName}
            <span className="font-normal text-[var(--color-muted)]">
              {" "}· {g.items.length} · {g.totals.days} días · {fmtCurrency(g.totals.gross)} bruto
            </span>
          </h3>
          <div className="hidden overflow-x-auto rounded-md border border-[var(--color-border)] md:block">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="px-2 py-1.5">Persona</th>
                  <th className="px-2 py-1.5 text-right">Días</th>
                  <th className="px-2 py-1.5 text-right">Bruto</th>
                  <th className="px-2 py-1.5 text-right">Retención</th>
                  <th className="px-2 py-1.5 text-right">Líquido</th>
                  <th className="px-2 py-1.5">Dirección</th>
                  <th className="px-2 py-1.5">{draft ? "" : "Boleta"}</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={feeItemKey(it)} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-[var(--color-muted)]">{formatRutForDisplay(it.rut)}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{days(it)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(it.gross)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[var(--color-muted)]">{fmtCurrency(it.withholding)}</td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{fmtCurrency(it.net)}</td>
                    <td className="px-2 py-1.5 text-xs">
                      {it.address ? `${it.address}${it.commune ? `, ${it.commune}` : ""}` : <span className="text-[var(--color-warning)]">Falta la dirección</span>}
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-1.5">
                      {draft ? (
                        <button type="button" onClick={() => onRemove(feeItemKey(it))} aria-label={`Quitar a ${it.name}`} className="rounded px-2 text-[var(--color-muted)] hover:text-[var(--color-danger)]">
                          ✕
                        </button>
                      ) : (
                        issued(it)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {g.items.map((it) => (
              <div key={feeItemKey(it)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="text-xs text-[var(--color-muted)]">{formatRutForDisplay(it.rut)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{fmtCurrency(it.net)}</div>
                    <div className="text-xs text-[var(--color-muted)]">bruto {fmtCurrency(it.gross)}</div>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1">Días {days(it)}</span>
                  {!it.address && <span className="text-[var(--color-warning)]">Falta la dirección</span>}
                  <span className="ml-auto">
                    {draft ? (
                      <button type="button" onClick={() => onRemove(feeItemKey(it))} className="rounded border border-[var(--color-border)] px-2 py-1">
                        Quitar
                      </button>
                    ) : (
                      issued(it)
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
