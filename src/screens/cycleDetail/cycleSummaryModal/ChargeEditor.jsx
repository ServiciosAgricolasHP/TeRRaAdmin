import { mergeFamilyOf } from "../../../utils/chargeMerge";
import { fmtNumber } from "../../../utils/cycleSummary";
import { fmtCurrency } from "../../../utils/format";

export function ChargeEditor({ labors, carriers, carrierById, onLaborChange, onCarrierChange, onRemoveImported }) {
  // Destinos posibles para "Juntar con": otra labor incluida, de la misma
  // familia y que no esté a su vez fusionada (mismas reglas que mergeTargetOf).
  const mergeTargetsFor = (l) => labors.filter(
    (o) => o.labor.id !== l.labor.id && o.include && !o.mergeInto &&
      mergeFamilyOf(o.labor.type) === mergeFamilyOf(l.labor.type),
  );
  const mergedInto = (l) => labors.filter((o) => o.include && o.mergeInto === l.labor.id);
  return (
    <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
        Tarifas para cobrar (compartidas con el equipo)
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[var(--color-muted)]">
            <tr>
              <th className="px-2 py-1">Incluir</th>
              <th className="px-2 py-1">Concepto</th>
              <th className="px-2 py-1 text-right">Cantidad</th>
              <th className="px-2 py-1 text-right" title="Mediana del precio por día — no la mueven los valores fuera de lo común, como una jornada mensual. Entre paréntesis el promedio simple cuando difiere.">
                Pago tipo
              </th>
              <th className="px-2 py-1 text-right">Tarifa cobro</th>
              <th className="px-2 py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {labors.map((l) => {
              const showMeanHint =
                l.meanRate &&
                l.medianRate &&
                Math.abs(l.meanRate - l.medianRate) / Math.max(1, l.medianRate) > 0.1;
              return (
              <tr key={l.labor.id} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={l.include}
                    onChange={(e) => onLaborChange(l.labor.id, { include: e.target.checked })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  {l.activity && (
                    <div>
                      <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                        {l.activity}
                      </span>
                    </div>
                  )}
                  <div className="mt-0.5">
                    <span className="font-medium">{l.labor.name}</span>
                    <span className="ml-1 text-[var(--color-muted)]">({l.unit.toLowerCase()})</span>
                  </div>
                  {l.importedFrom && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
                      <span>📥 importada de {l.importedFrom.cycleLabel}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveImported(l.labor.id)}
                        className="rounded border border-[var(--color-border)] px-1.5 py-0.5 hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                        title="Quita esta labor importada del resumen, con sus tarifas y ajustes"
                      >
                        ✕ Quitar
                      </button>
                    </div>
                  )}
                  {l.include && (() => {
                    const joined = mergedInto(l);
                    if (joined.length > 0) {
                      return (
                        <div className="mt-1 text-[10px] text-[var(--color-muted)]">
                          En la misma tabla: {joined.map((o) => o.labor.name).join(", ")}
                        </div>
                      );
                    }
                    const targets = mergeTargetsFor(l);
                    if (targets.length === 0 && !l.mergeInto) return null;
                    const current = l.mergeInto || "";
                    const currentValid = !current || targets.some((o) => o.labor.id === current);
                    return (
                      <label
                        className="mt-1 flex items-center gap-1 text-[10px] text-[var(--color-muted)]"
                        title="Muestra esta labor dentro de la tabla de otra, con un solo subtotal. No cambia el total a facturar."
                      >
                        Juntar con
                        <select
                          value={current}
                          onChange={(e) => onLaborChange(l.labor.id, { mergeInto: e.target.value || null })}
                          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[11px] text-[var(--color-text)]"
                        >
                          <option value="">— tabla propia —</option>
                          {targets.map((o) => (
                            <option key={o.labor.id} value={o.labor.id}>{o.labor.name}</option>
                          ))}
                          {!currentValid && <option value={current}>(destino no disponible)</option>}
                        </select>
                      </label>
                    );
                  })()}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(l.chargedTotals.qty)}</td>
                <td className="px-2 py-1.5 text-right text-[var(--color-muted)] tabular-nums">
                  <div>{fmtCurrency(l.defaultRate)}</div>
                  {showMeanHint && (
                    <div
                      className="text-[10px] opacity-70"
                      title="Promedio simple — lo mueven los valores fuera de lo común; la mediana es lo que ves arriba."
                    >
                      prom. {fmtCurrency(l.meanRate)}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    value={l.rate || ""}
                    placeholder="0"
                    onChange={(e) => onLaborChange(l.labor.id, { chargeRate: Number(e.target.value) || 0 })}
                    className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)]"
                  />
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {l.include
                    ? fmtCurrency((l.chargedTotals.amount || 0) + (l.chargedTotals.transport || 0))
                    : <span className="text-[var(--color-muted)]">—</span>}
                </td>
              </tr>
              );
            })}
            {carriers.map((c) => {
              const ci = carrierById.get(c.carrierId);
              return (
                <tr key={c.carrierId} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={c.include}
                      onChange={(e) => onCarrierChange(c.carrierId, { include: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    🚐 <span className="font-medium">{ci ? ci.alias : c.carrierId}</span>
                    <span className="ml-1 text-[var(--color-muted)]">(vueltas)</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.chargedTotalCount}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--color-muted)] tabular-nums">{fmtCurrency(c.defaultRate)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      value={c.rate || ""}
                      placeholder="0"
                      onChange={(e) => onCarrierChange(c.carrierId, { chargeRate: Number(e.target.value) || 0 })}
                      className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)]"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                    {c.include ? fmtCurrency(c.chargedTotalAmount || 0) : <span className="text-[var(--color-muted)]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
