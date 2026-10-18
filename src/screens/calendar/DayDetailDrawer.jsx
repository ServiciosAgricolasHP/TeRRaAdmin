import { useState, useMemo, Fragment } from "react";
import {
  cosechaUnit,
  tratoTypeLabel,
  tratoUnitLabel,
  getTratoTierTotals,
  getTratoTiers,
  qualityLabel,
  containerLabel,
} from "../../utils/cosechaCombos";
import { fmtCurrency } from "../../utils/format";
import { fmtNumber, isWeekendDate, humanDate } from "./helpers";

const LABOR_TYPE_LABEL = {
  cosecha: "cosecha",
  trato: "a trato",
  tratoHE: "jornadas (HE)",
  main: "al día",
  supervision: "supervisión",
  extra: "adicional",
};

// Texto de la columna "Métrica" según el tipo de labor: cantidad con la unidad
// del envase en cosecha, con la unidad del tier y el tipo del catálogo (ej.
// "poda") en trato, jornadas y HE en tratoHE, y jornadas en las labores al
// día. Vacío si no hay cantidad.
function laborMetricLabel(l, catalogs) {
  if (l.laborType === "cosecha") {
    if (!(l.harvestQty > 0)) return "";
    const unit = cosechaUnit(catalogs, l.containers).toLowerCase();
    return `${fmtNumber(l.harvestQty)} ${unit}`;
  }
  if (l.laborType === "trato") {
    if (!(l.pieceworkQty > 0)) return "";
    const typeLabel = tratoTypeLabel(catalogs, l.tratoType ?? 0);
    // Con unidades de tier (plantas, metros…) el rótulo es la unidad, con el
    // tipo entre paréntesis; sin unidad configurada, el tipo.
    const units = l.pieceworkUnits ? [...l.pieceworkUnits]
      .map((u) => tratoUnitLabel(catalogs, u))
      .filter(Boolean)
      .map((s) => s.toLowerCase()) : [];
    if (units.length === 1) {
      return `${fmtNumber(l.pieceworkQty)} ${units[0]} (${typeLabel.toLowerCase()})`;
    }
    if (units.length > 1) {
      return `${fmtNumber(l.pieceworkQty)} ${units.join("/")} (${typeLabel.toLowerCase()})`;
    }
    return `${fmtNumber(l.pieceworkQty)} ${typeLabel}`;
  }
  if (l.laborType === "tratoHE") {
    const parts = [];
    if (l.workdayCount > 0) parts.push(`${fmtNumber(l.workdayCount)} jornadas`);
    if (l.overtimeHours > 0) parts.push(`${fmtNumber(l.overtimeHours)} HE`);
    return parts.join(" + ");
  }
  // main / supervision / extra → solo jornadas
  return l.workdayCount > 0 ? `${fmtNumber(l.workdayCount)} jornadas` : "";
}

// ============================================================================
// Detalle del día (drawer)
// ============================================================================

export function DayDetailDrawer({ date, subjobId, workdays, trips, cycleById, subjobById, jobById, carrierById, workerById, catalogs, onClose }) {
  // Labores expandidas, que muestran el desglose por trabajador y por
  // calidad. Arrancan cerradas.
  const [expandedLabors, setExpandedLabors] = useState(() => new Set());
  const toggleLabor = (key) =>
    setExpandedLabors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Con `subjobId`, filtra workdays y vueltas a esa subfaena, según el
  // `subfaenaId` de su ciclo.
  const filteredWorkdays = useMemo(() => {
    if (!subjobId) return workdays;
    return workdays.filter((wd) => {
      const cycle = cycleById.get(wd.cycleId);
      return cycle?.subfaenaId === subjobId;
    });
  }, [workdays, subjobId, cycleById]);

  const filteredTrips = useMemo(() => {
    if (!subjobId) return trips;
    return trips.filter((t) => {
      const cycle = cycleById.get(t.cycleId);
      return cycle?.subfaenaId === subjobId;
    });
  }, [trips, subjobId, cycleById]);

  // Totales del día. Cada métrica suma solo su tipo de labor (kilos de
  // cosecha, tratoQty de trato, etc.); las tarjetas en 0 no se muestran.
  const totals = useMemo(() => {
    const workers = new Set();
    let harvestQty = 0;
    let pieceworkQty = 0;
    let amount = 0;
    let workdayCount = 0;
    let overtimeHours = 0;
    let floorAmount = 0;
    let floorCount = 0;
    const pieceworkTypes = new Set();
    const harvestContainers = new Set();
    for (const wd of filteredWorkdays) {
      workers.add(wd.workerId || wd.workerRut);
      amount += Number(wd.amount) || 0;
      if (wd.pisoOnly) {
        floorAmount += Number(wd.amount) || 0;
        floorCount += 1;
        continue; // el monto ya se sumó; el piso no aporta producción ni jornadas
      }
      const cycle = cycleById.get(wd.cycleId);
      const labor = cycle?.labors?.find((l) => l.id === wd.laborId);
      const t = labor?.type;
      if (t === "cosecha") {
        harvestQty += Number(wd.qty) || 0;
        harvestContainers.add(Number(wd.containerY) || 0);
      } else if (t === "trato") {
        pieceworkTypes.add(labor?.tratoType ?? 0);
        pieceworkQty += getTratoTierTotals(wd).qty;
      } else if (t === "tratoHE") {
        workdayCount += Number(wd.qty) || 0;
        overtimeHours += Number(wd.overtimeHours) || 0;
      } else {
        workdayCount += 1;
      }
    }
    const tripsTotal = filteredTrips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const pieceworkLabel = pieceworkTypes.size === 1
      ? tratoTypeLabel(catalogs, [...pieceworkTypes][0])
      : "Trato";
    const harvestUnitLabel = cosechaUnit(catalogs, harvestContainers);
    return {
      workerCount: workers.size,
      harvestQty,
      harvestUnitLabel,
      pieceworkQty,
      pieceworkLabel,
      amount,
      workdayCount,
      overtimeHours,
      floorAmount,
      floorCount,
      tripsCount: filteredTrips.length,
      tripsTotal,
    };
  }, [filteredWorkdays, filteredTrips, cycleById, catalogs]);

  // Agrupa los workdays por (cycleId, laborId), con solo las métricas que
  // aplican a cada tipo de labor. Guarda además dos desgloses para la fila
  // expandida:
  //   - `workersMap`: producción por trabajador (kilos / tratoQty / jornadas /
  //     monto / piso); sale como el array `workersBreakdown`.
  //   - `qualityMap`: en cosecha, totales por combo (calidadX/envaseY); sale
  //     como `qualityDist`.
  const byLabor = useMemo(() => {
    const map = new Map();
    for (const wd of filteredWorkdays) {
      const key = `${wd.cycleId}__${wd.laborId}`;
      if (!map.has(key)) {
        const cycle = cycleById.get(wd.cycleId);
        const labor = cycle?.labors?.find((l) => l.id === wd.laborId);
        const subjob = cycle ? subjobById.get(cycle.subfaenaId) : null;
        const job = subjob ? jobById.get(subjob.faenaId) : null;
        map.set(key, {
          key,
          cycleLabel: cycle?.label || wd.cycleId,
          laborName: labor?.name || wd.laborId,
          laborType: labor?.type || "main",
          tratoType: labor?.tratoType ?? 0,
          subjobName: subjob?.name || "",
          jobName: job?.name || "",
          workers: new Set(),
          containers: new Set(),
          harvestQty: 0,
          pieceworkQty: 0,
          pieceworkUnits: new Set(),
          workdayCount: 0,
          overtimeHours: 0,
          amount: 0,
          workersMap: new Map(),
          qualityMap: new Map(),
          _cycle: cycle,
        });
      }
      const e = map.get(key);
      // Agrupa por `workerId`, que no cambia: `workerRut` es el rut que tenía
      // el trabajador al crear cada workday y puede diferir entre ellos.
      const workerId = wd.workerId || wd.workerRut;
      e.workers.add(workerId);
      e.amount += Number(wd.amount) || 0;

      if (!e.workersMap.has(workerId)) {
        e.workersMap.set(workerId, {
          id: workerId,
          rut: wd.workerRut,
          harvestQty: 0,
          pieceworkQty: 0,
          workdayCount: 0,
          overtimeHours: 0,
          amount: 0,
          floorAmount: 0,
        });
      }
      const wEntry = e.workersMap.get(workerId);
      const wdAmount = Number(wd.amount) || 0;
      wEntry.amount += wdAmount;

      if (wd.pisoOnly) {
        e.floorAmount = (e.floorAmount || 0) + wdAmount;
        e.floorCount = (e.floorCount || 0) + 1;
        wEntry.floorAmount += wdAmount;
        continue;
      }
      const t = e.laborType;
      if (t === "cosecha") {
        const kg = Number(wd.qty) || 0;
        const qx = Number(wd.qualityX) || 0;
        const cy = Number(wd.containerY) || 0;
        e.harvestQty += kg;
        e.containers.add(cy);
        wEntry.harvestQty += kg;
        // Distribución por (calidad, envase): kilos + monto.
        const qk = `${qx}_${cy}`;
        if (!e.qualityMap.has(qk)) {
          e.qualityMap.set(qk, { qx, cy, harvestQty: 0, amount: 0 });
        }
        const q = e.qualityMap.get(qk);
        q.harvestQty += kg;
        q.amount += wdAmount;
      } else if (t === "trato") {
        const q = getTratoTierTotals(wd).qty;
        e.pieceworkQty += q;
        wEntry.pieceworkQty += q;
        // Unidades (plantas, metros…) de los tiers del workday, según el
        // dayPrices del ciclo para esa labor y fecha. Junta las de todos los
        // tiers de `wd.tiers`; sin ese campo, usa el tier 0.
        if (e._cycle?.dayPrices) {
          const tiers = getTratoTiers(e._cycle.dayPrices, wd.laborId, wd.date);
          const tierKeys = wd.tiers ? Object.keys(wd.tiers) : ["0"];
          for (const tk of tierKeys) {
            const tier = tiers[Number(tk)];
            if (tier?.unit != null) e.pieceworkUnits.add(tier.unit);
          }
        }
      } else if (t === "tratoHE") {
        const j = Number(wd.qty) || 0;
        const oh = Number(wd.overtimeHours) || 0;
        e.workdayCount += j;
        e.overtimeHours += oh;
        wEntry.workdayCount += j;
        wEntry.overtimeHours += oh;
      } else {
        e.workdayCount += 1;
        wEntry.workdayCount += 1;
      }
    }
    return [...map.values()]
      .map((e) => {
        const workersBreakdown = [...e.workersMap.values()]
          .map((w) => {
            const found = workerById?.get?.(w.id);
            return { ...w, rut: found?.rut || w.rut, name: found?.name || w.rut };
          })
          .sort((a, b) => b.amount - a.amount);
        const qualityDist = [...e.qualityMap.values()].sort(
          (a, b) => b.harvestQty - a.harvestQty || b.amount - a.amount,
        );
        const { workersMap: _wm, qualityMap: _qm, ...rest } = e;
        return { ...rest, workerCount: e.workers.size, workersBreakdown, qualityDist };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filteredWorkdays, cycleById, subjobById, jobById, workerById]);

  // Por transportista — el nombre viene del lookup de carriers, no del id.
  const byCarrier = useMemo(() => {
    const map = new Map();
    for (const t of filteredTrips) {
      const key = t.carrierId || "(sin id)";
      if (!map.has(key)) {
        const carrier = carrierById?.get?.(key);
        map.set(key, {
          carrierId: key,
          alias: carrier?.alias || carrier?.name || "(transportista eliminado)",
          name: carrier?.name || "",
          tripCount: 0,
          total: 0,
        });
      }
      const e = map.get(key);
      e.tripCount += 1;
      e.total += Number(t.amount) || 0;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filteredTrips, carrierById]);

  const subjobLabel = subjobId ? subjobById.get(subjobId)?.name : "Todas las subfaenas";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className={`text-lg font-semibold ${isWeekendDate(date) ? "text-[#dc2626]" : ""}`}>
              {humanDate(date)}
            </h2>
            <p className="text-xs text-[var(--color-muted)]">{subjobLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Totales: solo las métricas que aplican al día. */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Trabajadores" value={fmtNumber(totals.workerCount)} />
            {totals.workdayCount > 0 && <Stat label="Jornadas" value={fmtNumber(totals.workdayCount)} />}
            {totals.harvestQty > 0 && <Stat label={totals.harvestUnitLabel} value={fmtNumber(totals.harvestQty)} />}
            {totals.pieceworkQty > 0 && <Stat label={totals.pieceworkLabel} value={fmtNumber(totals.pieceworkQty)} />}
            {totals.overtimeHours > 0 && <Stat label="HE (horas)" value={fmtNumber(totals.overtimeHours)} />}
            {totals.floorAmount > 0 && (
              <Stat label={`Pisos (${totals.floorCount})`} value={fmtCurrency(totals.floorAmount)} />
            )}
            <Stat label="Producción $" value={fmtCurrency(totals.amount)} />
          </section>

          {/* Por labor */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Por labor ({byLabor.length})
            </h3>
            {byLabor.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Sin actividad registrada.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-1.5">Ciclo / Labor</th>
                      <th className="px-2 py-1.5 text-right">Personas</th>
                      <th className="px-2 py-1.5 text-right">Métrica</th>
                      <th className="px-2 py-1.5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byLabor.map((l) => {
                      const isOpen = expandedLabors.has(l.key);
                      const harvestUnitForLabor = l.laborType === "cosecha"
                        ? cosechaUnit(catalogs, l.containers).toLowerCase()
                        : "";
                      // Unidad de trato para el detalle por trabajador: la
                      // del tier (plantas, metros) con el tipo (poda, amarre)
                      // entre paréntesis; sin unidad configurada, el tipo.
                      const pieceworkUnitForLabor = (() => {
                        if (l.laborType !== "trato") return "";
                        const units = l.pieceworkUnits ? [...l.pieceworkUnits]
                          .map((u) => tratoUnitLabel(catalogs, u))
                          .filter(Boolean)
                          .map((s) => s.toLowerCase()) : [];
                        const typeLabel = tratoTypeLabel(catalogs, l.tratoType ?? 0).toLowerCase();
                        if (units.length === 1) return `${units[0]} (${typeLabel})`;
                        if (units.length > 1) return `${units.join("/")} (${typeLabel})`;
                        return typeLabel;
                      })();
                      return (
                        <Fragment key={l.key}>
                          <tr
                            className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"
                            onClick={() => toggleLabor(l.key)}
                          >
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-[var(--color-muted)]">{isOpen ? "▾" : "▸"}</span>
                                <div>
                                  <div className="text-sm font-medium">{l.laborName}</div>
                                  <div className="text-[10px] text-[var(--color-muted)]">
                                    {l.cycleLabel} · {LABOR_TYPE_LABEL[l.laborType] || l.laborType}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{l.workerCount}</td>
                            <td className="px-2 py-1.5 text-right text-xs tabular-nums">
                              {l.laborType === "tratoHE" ? (
                                <div className="flex flex-col items-end leading-tight">
                                  {l.workdayCount > 0 && (
                                    <span>
                                      {fmtNumber(l.workdayCount)}{" "}
                                      <span className="text-[var(--color-muted)]">jornadas</span>
                                    </span>
                                  )}
                                  {l.overtimeHours > 0 && (
                                    <span>
                                      {fmtNumber(l.overtimeHours)}{" "}
                                      <span className="text-[var(--color-muted)]">horas extras</span>
                                    </span>
                                  )}
                                </div>
                              ) : l.laborType === "trato" ? (() => {
                                // Promedio por persona con producción ese día
                                // (tratoQty > 0), no por todas las del listado.
                                // Sale de `workersBreakdown`: byLabor no conserva
                                // `workersMap`.
                                const peopleWithProd = (l.workersBreakdown || [])
                                  .filter((w) => (w.pieceworkQty || 0) > 0);
                                const n = peopleWithProd.length;
                                const avg = n > 0 ? l.pieceworkQty / n : 0;
                                return (
                                  <div className="flex flex-col items-end leading-tight">
                                    <span>{laborMetricLabel(l, catalogs)}</span>
                                    {n > 0 && (
                                      <span className="text-[10px] text-[var(--color-muted)]">
                                        {n} persona{n === 1 ? "" : "s"} · prom {fmtNumber(avg)}/persona
                                      </span>
                                    )}
                                  </div>
                                );
                              })() : (
                                laborMetricLabel(l, catalogs)
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                              {fmtCurrency(l.amount)}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40">
                              <td colSpan={4} className="px-3 py-2">
                                {l.laborType === "cosecha" && l.qualityDist.length > 0 && (
                                  <div className="mb-2">
                                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                                      Distribución por calidad / envase
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {l.qualityDist.map((q) => {
                                        const lblQ = qualityLabel(catalogs, q.qx);
                                        const lblC = containerLabel(catalogs, q.cy);
                                        const pct = l.harvestQty > 0 ? (q.harvestQty / l.harvestQty) * 100 : 0;
                                        return (
                                          <div
                                            key={`${q.qx}_${q.cy}`}
                                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px]"
                                          >
                                            <div className="font-medium">{lblQ} / {lblC}</div>
                                            <div className="tabular-nums">
                                              {fmtNumber(q.harvestQty)} {lblC.toLowerCase()}
                                              <span className="ml-1 text-[var(--color-muted)]">
                                                ({pct.toFixed(0)}%)
                                              </span>
                                            </div>
                                            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
                                              {fmtCurrency(q.amount)}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                                  Trabajadores ({l.workersBreakdown.length})
                                </div>
                                <table className="w-full text-xs">
                                  <thead className="text-left text-[var(--color-muted)]">
                                    <tr>
                                      <th className="px-1 py-1">Nombre</th>
                                      <th className="px-1 py-1 text-right">Producción</th>
                                      <th className="px-1 py-1 text-right">Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {l.workersBreakdown.map((w) => {
                                      const prodParts = [];
                                      if (l.laborType === "cosecha" && w.harvestQty > 0) {
                                        prodParts.push(`${fmtNumber(w.harvestQty)} ${harvestUnitForLabor}`);
                                      }
                                      if (l.laborType === "trato" && w.pieceworkQty > 0) {
                                        prodParts.push(`${fmtNumber(w.pieceworkQty)} ${pieceworkUnitForLabor}`);
                                      }
                                      if (w.workdayCount > 0) {
                                        prodParts.push(`${fmtNumber(w.workdayCount)} jornadas`);
                                      }
                                      if (w.overtimeHours > 0) {
                                        prodParts.push(`${fmtNumber(w.overtimeHours)} horas extras`);
                                      }
                                      if (w.floorAmount > 0) {
                                        prodParts.push(`🪙 ${fmtCurrency(w.floorAmount)}`);
                                      }
                                      return (
                                        <tr key={w.rut} className="border-t border-[var(--color-border)]">
                                          <td className="px-1 py-1">
                                            <div>{w.name}</div>
                                            <div className="font-mono text-[10px] text-[var(--color-muted)]">{w.rut}</div>
                                          </td>
                                          <td className="px-1 py-1 text-right tabular-nums">
                                            {l.laborType === "tratoHE" ? (
                                              <div className="flex flex-col items-end leading-tight">
                                                {w.workdayCount > 0 && (
                                                  <span>
                                                    {fmtNumber(w.workdayCount)}{" "}
                                                    <span className="text-[var(--color-muted)]">jornadas</span>
                                                  </span>
                                                )}
                                                {w.overtimeHours > 0 && (
                                                  <span>
                                                    {fmtNumber(w.overtimeHours)}{" "}
                                                    <span className="text-[var(--color-muted)]">horas extras</span>
                                                  </span>
                                                )}
                                                {w.floorAmount > 0 && (
                                                  <span>🪙 {fmtCurrency(w.floorAmount)}</span>
                                                )}
                                                {w.workdayCount === 0 && w.overtimeHours === 0 && w.floorAmount === 0 && "—"}
                                              </div>
                                            ) : (
                                              prodParts.join(" · ") || "—"
                                            )}
                                          </td>
                                          <td className="px-1 py-1 text-right font-medium tabular-nums">
                                            {fmtCurrency(w.amount)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Por transportista */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Transportes ({totals.tripsCount} · {fmtCurrency(totals.tripsTotal)})
            </h3>
            {byCarrier.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Sin transportes.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-1.5">Transportista</th>
                      <th className="px-2 py-1.5 text-right">Vueltas</th>
                      <th className="px-2 py-1.5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCarrier.map((c) => (
                      <tr key={c.carrierId} className="border-t border-[var(--color-border)]">
                        <td className="px-2 py-1.5">{c.alias}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{c.tripCount}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtCurrency(c.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
