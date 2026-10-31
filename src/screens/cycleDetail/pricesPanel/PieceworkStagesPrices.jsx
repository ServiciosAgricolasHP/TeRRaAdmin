import { getStageDayPrice } from "../../../utils/tratoEtapas";
import { useCycleDetail } from "../CycleDetailContext";

// Barra de precios de tratoEtapas: precio por día de cada etapa (fijas de la labor)
export function PieceworkStagesPrices() {
  const {
    activeLabor,
    dayPrices,
    days,
    activeStages,
    isPieceworkStagesLabor,
    persistStagePrice,
    pricesCollapsed,
    readOnly,
    setPricesCollapsed,
    stagesDaySummary,
  } = useCycleDetail();
  return (
    <>
      {isPieceworkStagesLabor && days.length > 0 && (
        <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
          <button
            type="button"
            onClick={() => setPricesCollapsed((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
            title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
          >
            <span>{pricesCollapsed ? "▶" : "▼"}</span>
            <span>🏕</span>
            <span>Precios por día y etapa</span>
            {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
          </button>
          {!pricesCollapsed && (
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d) => (
              <div key={d} className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1.5 text-xs min-w-[210px]">
                <div className="font-medium text-[var(--color-muted)]">{d}</div>
                {activeStages.map((st) => {
                  const { price, mode } = getStageDayPrice(dayPrices, activeLabor.id, d, st.id);
                  return (
                    <div
                      key={st.id}
                      className={`flex flex-col gap-0.5 rounded-md border px-1.5 py-1 ${
                        price > 0
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)]"
                      }`}
                    >
                      <span className="truncate font-medium text-[var(--color-text)]">
                        {st.name}
                        {st.counts && <span className="ml-1 text-[10px] text-[var(--color-accent)]" title="cuenta para el conteo de unidades">✓</span>}
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="flex shrink-0 rounded overflow-hidden border border-[var(--color-border)] text-[9px]">
                          <button
                            disabled={readOnly}
                            onClick={() => persistStagePrice(activeLabor.id, d, st.id, { mode: "unit" })}
                            title="Precio por unidad"
                            className={`px-1 py-0.5 transition-colors ${mode === "unit" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"} disabled:opacity-50`}
                          >
                            u
                          </button>
                          <button
                            disabled={readOnly}
                            onClick={() => persistStagePrice(activeLabor.id, d, st.id, { mode: "flat" })}
                            title="Precio fijo por día"
                            className={`px-1 py-0.5 transition-colors ${mode === "flat" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"} disabled:opacity-50`}
                          >
                            d
                          </button>
                        </div>
                        <div className="flex min-w-0 flex-1 items-center gap-0.5">
                          <span className="text-[var(--color-muted)]">$</span>
                          <input
                            key={`${d}_${st.id}_${price}_${mode}`}
                            type="number" min="0" disabled={readOnly}
                            defaultValue={price > 0 ? price : ""}
                            onBlur={(e) => {
                              const v = Number(e.target.value) || 0;
                              if (v !== price) persistStagePrice(activeLabor.id, d, st.id, { price: v });
                            }}
                            placeholder={mode === "flat" ? "día" : "unid"}
                            className="w-full min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const s = stagesDaySummary[d];
                  if (!s || (s.counted === 0 && s.people === 0)) return null;
                  const avg = s.people > 0 ? s.counted / s.people : 0;
                  return (
                    <div
                      className="flex items-center justify-between gap-1 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-1.5 py-1 text-[10px] tabular-nums"
                      title={`Producción del día: ${s.counted.toLocaleString("es-CL")} unid. que cuentan · ${s.people} persona${s.people === 1 ? "" : "s"} · promedio ${avg.toLocaleString("es-CL", { maximumFractionDigits: 1 })} por persona`}
                    >
                      <span className="font-semibold text-[var(--color-accent)]">{s.counted.toLocaleString("es-CL")} unid.</span>
                      <span className="text-[var(--color-muted)]">{s.people} pers.</span>
                      <span className="text-[var(--color-text)]">prom {avg.toLocaleString("es-CL", { maximumFractionDigits: 1 })}</span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
          )}
        </div>
      )}
    </>
  );
}
