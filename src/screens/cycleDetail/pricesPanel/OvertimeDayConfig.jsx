import { getDaySingle } from "../../../utils/cosechaCombos";
import { isRedDay, isWeekendDate, DEFAULT_BASE_DAY } from "../../../utils/tratoHE";
import { useCycleDetail } from "../CycleDetailContext";

// Barra de configuración por día de tratoHE
export function OvertimeDayConfig() {
  const {
    activeLabor,
    dayPrices,
    days,
    isOvertimeDayLabor,
    pricesCollapsed,
    readOnly,
    setDayModeEdit,
    setPricesCollapsed,
  } = useCycleDetail();
  return (
    <>
      {isOvertimeDayLabor && days.length > 0 && (
        <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
          <button
            type="button"
            onClick={() => setPricesCollapsed((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
            title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
          >
            <span>{pricesCollapsed ? "▶" : "▼"}</span>
            <span>🛠</span>
            <span>Configuración por día</span>
            {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
          </button>
          {!pricesCollapsed && (
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d) => {
              const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
              const red = isRedDay(d, cfg);
              const isWeekend = isWeekendDate(d);
              return (
                <div
                  key={d}
                  className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-xs min-w-[200px] ${
                    red ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                  }`}
                >
                  <button
                    onClick={() => !readOnly && setDayModeEdit({ laborId: activeLabor.id, date: d })}
                    disabled={readOnly}
                    className="flex items-center justify-between gap-2 text-left disabled:opacity-60"
                    title="Editar configuración del día"
                  >
                    <span className="font-medium text-[var(--color-text)]">
                      {d}
                      {cfg.isHoliday && <span className="ml-1">🎉</span>}
                      {!cfg.isHoliday && isWeekend && <span className="ml-1 text-[var(--color-danger)]">·</span>}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]">editar</span>
                  </button>
                  <div className="text-[10px] text-[var(--color-muted)]">
                    Base: ${(cfg.price || activeLabor.baseDayDefault || DEFAULT_BASE_DAY).toLocaleString("es-CL")}
                  </div>
                  <div className="text-[10px]">
                    {cfg.mode === "overtimeOnly" ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">solo HE</span>
                    ) : (
                      <span className="text-[var(--color-muted)]">jornada normal</span>
                    )}
                  </div>
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
