import { tratoTypeLabel, workdayMapKey } from "../../../utils/cosechaCombos";
import { fmtCurrency } from "../../../utils/format";
import { FloorDayRow } from "../FloorDayRow";
import { useCycleDetail } from "../CycleDetailContext";

// Barra de precios de trato
export function PieceworkPrices() {
  const {
    activeLabor,
    askApplyFloorToAll,
    catalogs,
    cycleWrite,
    dayPrices,
    days,
    dayTiersByDate,
    defaultMode,
    getPriceInputValue,
    handlePriceBlur,
    inputKey,
    isPieceworkLabor,
    persistComboConfig,
    persistDayFloor,
    floorPendingByDate,
    pricesCollapsed,
    readOnly,
    setAddPriceModal,
    setDayPrices,
    setLocalPriceInputs,
    setPricesCollapsed,
    wdMap,
    workers,
  } = useCycleDetail();
  return (
    <>
      {isPieceworkLabor && days.length > 0 && (
        <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
          <button
            type="button"
            onClick={() => setPricesCollapsed((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
            title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
          >
            <span>{pricesCollapsed ? "▶" : "▼"}</span>
            <span>🛠</span>
            <span>Precios por día · {tratoTypeLabel(catalogs, activeLabor.tratoType ?? 0)}</span>
            {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
          </button>
          {!pricesCollapsed && (
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d) => {
              const tiers = dayTiersByDate[d] || [];
              // Suma de qty y monto de cada tier en este día.
              const tierTotals = tiers.map((t) => {
                let q = 0, a = 0;
                for (const w of workers) {
                  const wd = wdMap[workdayMapKey(w.rut, d, t.key)];
                  q += Number(wd?.qty) || 0;
                  a += Number(wd?.amount) || 0;
                }
                return { qty: q, amount: a };
              });
              const totalQty = tierTotals.reduce((s, x) => s + x.qty, 0);
              const totalAmt = tierTotals.reduce((s, x) => s + x.amount, 0);
              // El desglose por tier se muestra con 2 o más tiers con
              // producción; con uno basta la línea "= $X".
              const tiersWithQty = tierTotals.filter((x) => x.qty > 0).length;
              // Personas con producción ese día (algún tier con qty > 0),
              // para el "N pers · prom X".
              const peopleCount = workers.reduce((acc, w) => {
                const hasProd = tiers.some(
                  (t) => Number(wdMap[workdayMapKey(w.rut, d, t.key)]?.qty) > 0,
                );
                return acc + (hasProd ? 1 : 0);
              }, 0);
              const avgPerPerson = peopleCount > 0 ? totalQty / peopleCount : 0;
              return (
                <div
                  key={d}
                  className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-xs ${
                    tiers.length > 0 && tiers.some((t) => t.price > 0)
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[var(--color-text)]">{d}</span>
                    {totalQty > 0 && (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-[var(--color-muted)]">{totalQty.toLocaleString("es-CL")}</span>
                        {peopleCount > 0 && (
                          <span className="text-[10px] text-[var(--color-muted)]">
                            {peopleCount} pers · prom{" "}
                            {avgPerPerson.toLocaleString("es-CL", { maximumFractionDigits: 1 })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {tiers.map((t, i) => {
                    const tt = tierTotals[i] || { qty: 0, amount: 0 };
                    return (
                    <div key={t.key} className="flex items-center gap-1 rounded-md bg-[var(--color-surface)] px-2 py-1">
                      <span className="text-[var(--color-muted)] text-[10px] w-12">P{i + 1}</span>
                      <span className="text-[var(--color-muted)]">$</span>
                      <input
                        type="number" min="0" disabled={readOnly}
                        value={getPriceInputValue(activeLabor.id, d, t.key, true)}
                        onChange={(e) => {
                          const key = inputKey(activeLabor.id, d, t.key);
                          setLocalPriceInputs((prev) => ({ ...prev, [key]: e.target.value }));
                        }}
                        onBlur={() => handlePriceBlur(activeLabor.id, d, t.key, true)}
                        placeholder="precio"
                        className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-right text-[10px] tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                      />
                      {/* Unidad del tier, guardada junto a su precio.
                          "—" = sin unidad. */}
                      <select
                        disabled={readOnly}
                        value={t.unit == null ? "" : String(t.unit)}
                        onChange={(e) => {
                          const v = e.target.value;
                          persistComboConfig(
                            activeLabor.id,
                            d,
                            t.key,
                            { unit: v === "" ? null : Number(v) },
                            true,
                          );
                        }}
                        title="Unidad de medida — qué representa cada cantidad (Metro, Polín, Planta, etc.)"
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[10px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                      >
                        <option value="">—</option>
                        {(catalogs.tratoUnits || []).map((u) => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
                      <div className="flex overflow-hidden rounded border border-[var(--color-border)] text-[10px]">
                        <button
                          disabled={readOnly}
                          onClick={() => persistComboConfig(activeLabor.id, d, t.key, { mode: "unit" }, true)}
                          title="Por unidad (cantidad × precio)"
                          className={`px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
                            t.mode === "unit"
                              ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                              : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                          }`}
                        >
                          /unid
                        </button>
                        <button
                          disabled={readOnly}
                          onClick={() => persistComboConfig(activeLabor.id, d, t.key, { mode: "flat" }, true)}
                          title="Pago al día (la cantidad es informativa)"
                          className={`px-1.5 py-0.5 transition-colors disabled:opacity-50 border-l border-[var(--color-border)] ${
                            t.mode === "flat"
                              ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                              : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                          }`}
                        >
                          /día
                        </button>
                      </div>
                      {tt.qty > 0 && (
                        <span
                          className="ml-1 text-[10px] tabular-nums text-[var(--color-muted)]"
                          title="Total de este precio en el día (cantidad · monto)"
                        >
                          {tt.qty.toLocaleString("es-CL")} · {fmtCurrency(tt.amount)}
                        </span>
                      )}
                      {tiers.length > 1 && (
                        <button
                          disabled={readOnly}
                          onClick={async () => {
                            const newEntry = { ...dayPrices };
                            const dayEntry = { ...(newEntry[activeLabor.id]?.[d] || {}) };
                            delete dayEntry[t.key];
                            newEntry[activeLabor.id] = { ...(newEntry[activeLabor.id] || {}), [d]: dayEntry };
                            setDayPrices(newEntry);
                            await cycleWrite({ dayPrices: newEntry });
                          }}
                          className="ml-auto text-[var(--color-danger)] text-[10px] hover:underline disabled:opacity-40"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    );
                  })}
                  {!readOnly && (
                    <button
                      onClick={() =>
                        setAddPriceModal({
                          laborId: activeLabor.id,
                          date: d,
                          nextKey: `t${tiers.length}`,
                          defaultMode,
                          value: "",
                        })
                      }
                      className="text-[var(--color-accent)] text-[10px] hover:underline"
                    >
                      + Agregar precio
                    </button>
                  )}
                  {totalAmt > 0 && (
                    <div className="text-[var(--color-accent)] font-medium tabular-nums text-[11px]">
                      {tiersWithQty > 1 && (
                        <div className="mb-0.5 text-[10px] font-normal text-[var(--color-muted)]">
                          {tierTotals
                            .map((tt, i) => (tt.qty > 0 ? `P${i + 1} ${fmtCurrency(tt.amount)}` : null))
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      = {fmtCurrency(totalAmt)}
                    </div>
                  )}
                  <FloorDayRow
                    labor={activeLabor}
                    dayPrices={dayPrices}
                    date={d}
                    readOnly={readOnly}
                    pendingCount={floorPendingByDate[d] || 0}
                    onApplyAll={() => askApplyFloorToAll(activeLabor.id, d)}
                    onPersist={(v) => persistDayFloor(activeLabor.id, d, v)}
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
