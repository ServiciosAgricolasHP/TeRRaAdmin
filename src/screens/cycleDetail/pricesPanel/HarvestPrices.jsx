import { workdayMapKey, comboLabel, containerLabel } from "../../../utils/cosechaCombos";
import { fmtCurrency } from "../../../utils/format";
import { FloorDayRow } from "../FloorDayRow";
import { useCycleDetail } from "../CycleDetailContext";

// Barra de precios de cosecha
export function HarvestPrices() {
  "use no memo";
  const {
    activeLabor,
    askApplyPisoToAll,
    catalogs,
    dayCombosByDate,
    dayPrices,
    days,
    getPriceInputValue,
    handlePriceBlur,
    inputKey,
    isCosechaLabor,
    persistComboConfig,
    persistDayPiso,
    pisoPendingByDate,
    pricesCollapsed,
    readOnly,
    setAddComboFor,
    setLocalPriceInputs,
    setPricesCollapsed,
    setRemoveCombo,
    totalQtyByDayCombo,
    wdMap,
    workers,
  } = useCycleDetail();
  return (
    <>
      {isCosechaLabor && days.length > 0 && (
        <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
          <button
            type="button"
            onClick={() => setPricesCollapsed((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
            title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
          >
            <span>{pricesCollapsed ? "▶" : "▼"}</span>
            <span>🌾</span>
            <span>Precios por día y tipo</span>
            {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
          </button>
          {!pricesCollapsed && (
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d) => {
              const combos = dayCombosByDate[d] || [];
              return (
                <div key={d} className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs min-w-[200px]">
                  <div className="font-medium text-[var(--color-text)]">{d}</div>
                  {combos.map((c) => {
                    const totalQty = totalQtyByDayCombo[d]?.[c.key] || 0;
                    const workersWithQty = workers.filter(
                      (w) => (wdMap[workdayMapKey(w.rut, d, c.key)]?.qty || 0) > 0,
                    ).length;
                    const totalAmt = c.mode === "flat" ? c.price * workersWithQty : totalQty * c.price;
                    return (
                      <div
                        key={c.key}
                        className={`flex flex-col gap-1 rounded-md border px-2 py-1.5 ${
                          c.price > 0
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-[var(--color-text)]">
                            {comboLabel(catalogs, c.x, c.y)}
                          </span>
                          {!readOnly && (
                            <button
                              onClick={() =>
                                setRemoveCombo({
                                  laborId: activeLabor.id, date: d, comboKey: c.key,
                                  label: comboLabel(catalogs, c.x, c.y),
                                })
                              }
                              className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                              title="Quitar tipo"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--color-muted)]">
                          {totalQty.toLocaleString("es-CL")} {containerLabel(catalogs, c.y)}
                        </div>
                        <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-[10px]">
                          <button
                            disabled={readOnly}
                            onClick={() => persistComboConfig(activeLabor.id, d, c.key, { mode: "unit" }, false)}
                            className={`flex-1 px-1 py-0.5 transition-colors ${
                              c.mode === "unit"
                                ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                                : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                            } disabled:opacity-50`}
                          >
                            $/unidad
                          </button>
                          <button
                            disabled={readOnly}
                            onClick={() => persistComboConfig(activeLabor.id, d, c.key, { mode: "flat" }, false)}
                            className={`flex-1 px-1 py-0.5 transition-colors ${
                              c.mode === "flat"
                                ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                                : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                            } disabled:opacity-50`}
                          >
                            $/día
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[var(--color-muted)]">$</span>
                          <input
                            type="number" min="0" disabled={readOnly}
                            value={getPriceInputValue(activeLabor.id, d, c.key)}
                            onChange={(e) =>
                              setLocalPriceInputs((prev) => ({
                                ...prev,
                                [inputKey(activeLabor.id, d, c.key)]: e.target.value,
                              }))
                            }
                            onBlur={() => handlePriceBlur(activeLabor.id, d, c.key)}
                            placeholder={c.mode === "flat" ? "tarifa/trab." : `precio/${containerLabel(catalogs, c.y)}`}
                            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                          />
                        </div>
                        {totalAmt > 0 && (
                          <div className="text-[var(--color-accent)] text-[10px] font-medium tabular-nums">
                            = {fmtCurrency(totalAmt)}
                            {c.mode === "flat" && workersWithQty > 0 && (
                              <span className="ml-1 font-normal text-[var(--color-muted)]">({workersWithQty} trab.)</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setAddComboFor({ laborId: activeLabor.id, date: d })}
                    disabled={readOnly}
                    className="rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
                  >
                    + tipo
                  </button>
                  <FloorDayRow
                    labor={activeLabor}
                    dayPrices={dayPrices}
                    date={d}
                    readOnly={readOnly}
                    pendingCount={pisoPendingByDate[d] || 0}
                    onApplyAll={() => askApplyPisoToAll(activeLabor.id, d)}
                    onPersist={(v) => persistDayPiso(activeLabor.id, d, v)}
                  />
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}
    </>
  );
}
