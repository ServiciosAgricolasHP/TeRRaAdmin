import { fmtCurrency } from "../../utils/format";
import { containerLabel, tratoTypeLabel } from "../../utils/cosechaCombos";
import { useCycleDetail } from "./CycleDetailContext";

// Métricas del ciclo, plegables: una tarjeta por labor con su total y lo que
// produjo, el transporte y el total del ciclo.
export function LaborMetrics() {
  "use no memo";
  const {
    activeLabor,
    balanceWithTransport,
    catalogs,
    cycle,
    cycleTrips,
    floorMetricsByLabor,
    grandTotal,
    metricsCollapsed,
    overtimeDayMetricsByLabor,
    pieceworkPeopleCountByLabor,
    pieceworkTierMetricsByLabor,
    qrLockedLabors,
    setActiveLaborId,
    setMetricsCollapsed,
    setTransportsOpen,
    totalQtyByContainerByLabor,
    totalQtyByLabor,
    totalsByLabor,
    transportTotal,
  } = useCycleDetail();
  return (
    <>
      <button
        type="button"
        onClick={() => setMetricsCollapsed((v) => !v)}
        className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted)] hover:text-[var(--color-accent)]"
        title={metricsCollapsed ? "Mostrar métricas" : "Ocultar métricas"}
      >
        <span>{metricsCollapsed ? "▶" : "▼"}</span>
        <span>Métricas</span>
      </button>
      {!metricsCollapsed && (
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cycle.labors.map((l) => {
          const isCo = l.type === "cosecha";
          const isTr = l.type === "trato";
          const isEt = l.type === "tratoEtapas";
          const isHE = l.type === "tratoHE";
          const totalAmt = totalsByLabor[l.id] || 0;
          const qtyByContainer = totalQtyByContainerByLabor[l.id] || {};
          const totalQty = totalQtyByLabor[l.id] || 0;
          const heMetrics = overtimeDayMetricsByLabor[l.id];
          const pisoMetrics = floorMetricsByLabor[l.id] || { count: 0, amount: 0 };
          const tag = isCo ? "cosecha" : isTr ? "trato" : isEt ? "por etapas" : isHE ? "jornadas+HE" : l.type === "main" ? "al día" : l.type;
          const tagClass = isCo
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            : isTr
              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              : isEt
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                : isHE
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-[var(--color-surface-2)]";
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => setActiveLaborId(l.id)}
              className={`rounded-lg border bg-[var(--color-surface)] p-3 shadow-sm text-left transition-all hover:border-[var(--color-accent)] hover:shadow-md ${
                l.id === activeLabor?.id ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent-soft)]" : "border-[var(--color-border)]"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>{l.name}</span>
                <span className="flex items-center gap-1">
                  {qrLockedLabors.has(l.id) && (
                    <span
                      title={`Cosecha sincronizada desde los pesajes QR del prefijo ${qrLockedLabors.get(l.id).id}`}
                      className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                    >
                      📱 {qrLockedLabors.get(l.id).id}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${tagClass}`}>{tag}</span>
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{fmtCurrency(totalAmt)}</div>
              {isCo && Object.keys(qtyByContainer).length > 0 && (
                <div className="mt-0.5 text-[11px] text-[var(--color-muted)] tabular-nums">
                  {Object.entries(qtyByContainer)
                    .filter(([, qty]) => qty > 0)
                    .map(([y, qty]) => `${qty.toLocaleString("es-CL")} ${containerLabel(catalogs, Number(y))}`)
                    .join(" · ")}
                </div>
              )}
              {isTr && (
                <div className="mt-1 space-y-0.5 text-[11px] tabular-nums">
                  <div className="text-[var(--color-muted)]">
                    {tratoTypeLabel(catalogs, l.tratoType ?? 0)} · {totalQty.toLocaleString("es-CL")} unid.
                  </div>
                  {(() => {
                    const n = pieceworkPeopleCountByLabor[l.id] || 0;
                    if (n === 0) return null;
                    const avg = totalQty / n;
                    return (
                      <div className="text-[var(--color-muted)]">
                        {n} persona{n === 1 ? "" : "s"} · prom{" "}
                        {avg.toLocaleString("es-CL", { maximumFractionDigits: 1 })}/persona
                      </div>
                    );
                  })()}
                  {pieceworkTierMetricsByLabor[l.id] && Object.keys(pieceworkTierMetricsByLabor[l.id]).length > 1 && (
                    <div className="mt-0.5 space-y-0">
                      {Object.entries(pieceworkTierMetricsByLabor[l.id])
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([idx, tm]) => (
                          <div key={idx} className="flex justify-between gap-2 text-[var(--color-muted)]">
                            <span>Precio {Number(idx) + 1}:</span>
                            <span>
                              {tm.qty.toLocaleString("es-CL")} unid. · {fmtCurrency(tm.amount)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {isEt && (
                <div className="mt-1 text-[11px] tabular-nums text-[var(--color-muted)]">
                  {totalQty.toLocaleString("es-CL")} unid. producidas
                  <span className="ml-1 opacity-70">(etapas que cuentan)</span>
                </div>
              )}
              {(isCo || isTr) && pisoMetrics.count > 0 && (
                <div className="mt-1 flex justify-between gap-2 text-[11px] tabular-nums">
                  <span className="text-[var(--color-muted)]">🪙 Pisos:</span>
                  <span>
                    <span className="font-medium">{pisoMetrics.count}</span>
                    <span className="text-[var(--color-muted)]"> jorn. · </span>
                    <span className="font-medium">{fmtCurrency(pisoMetrics.amount)}</span>
                  </span>
                </div>
              )}
              {isHE && heMetrics && (
                <div className="mt-1 space-y-0.5 text-[11px] tabular-nums">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--color-muted)]">Base:</span>
                    <span>
                      <span className="font-medium">{fmtCurrency(heMetrics.normalQty)}</span>
                      <span className="text-[var(--color-muted)]"> norm.</span>
                      {heMetrics.holidayQty > 0 && (
                        <span className="ml-1 text-[var(--color-danger)]">
                          + {fmtCurrency(heMetrics.holidayQty)} fer.
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--color-muted)]">Horas extras:</span>
                    <span>
                      <span className="font-medium">{heMetrics.normalOvertimeHours.toLocaleString("es-CL")}h</span>
                      <span className="text-[var(--color-muted)]"> norm.</span>
                      {heMetrics.holidayOvertimeHours > 0 && (
                        <span className="ml-1 text-[var(--color-danger)]">
                          + {heMetrics.holidayOvertimeHours.toLocaleString("es-CL")}h fer.
                        </span>
                      )}
                    </span>
                  </div>
                  {heMetrics.workersWithBonus > 0 && (
                    <div className="flex justify-between gap-2 text-[var(--color-muted)]">
                      <span>Con bonos:</span>
                      <span>{heMetrics.workersWithBonus} trab.</span>
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
        <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent)]">Total ciclo</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-[var(--color-accent)]">{fmtCurrency(grandTotal)}</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">Suma de labores</div>
        </div>
        {(transportTotal > 0 || cycleTrips.length > 0) && (
          <button
            type="button"
            onClick={() => setTransportsOpen(true)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm text-left transition-all hover:border-[var(--color-accent)] hover:shadow-md"
          >
            <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span>Transporte</span>
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">🚐 transp.</span>
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{fmtCurrency(transportTotal)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)] tabular-nums">
              {cycleTrips.length} vuelta{cycleTrips.length === 1 ? "" : "s"}
            </div>
          </button>
        )}
        {(transportTotal > 0 || cycleTrips.length > 0) && (
          <div className="rounded-lg border border-[var(--color-success)] bg-[var(--color-success-soft)] p-3 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-success)]">Balance con transporte</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-[var(--color-success)]">{fmtCurrency(balanceWithTransport)}</div>
            <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">Total ciclo + transporte</div>
          </div>
        )}
      </div>
      )}
    </>
  );
}
