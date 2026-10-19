import { getDaySingle } from "../../../utils/cosechaCombos";
import { DEFAULT_BASE_DAY } from "../../../utils/tratoHE";
import { parseAmount } from "../../../utils/formula";
import { fmtCurrency } from "../../../utils/format";
import { useCycleDetail } from "../CycleDetailContext";

// Barra de precios de labores normales (main/supervision/extra): un
// precio sugerido por día, que las celdas vacías de la grilla
// ofrecen con un click. Se guarda en dayPrices del ciclo.
export function NormalDayPrices() {
  "use no memo";
  const {
    activeLabor,
    dayPrices,
    days,
    inputKey,
    isNormalLabor,
    localPriceInputs,
    peopleByDate,
    persistNormalDayPrice,
    pricesCollapsed,
    readOnly,
    setLocalPriceInputs,
    setPricesCollapsed,
  } = useCycleDetail();
  return (
    <>
      {isNormalLabor && days.length > 0 && (
        <div className={`mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${pricesCollapsed ? "px-3 py-1.5" : "p-2"}`}>
          <button
            type="button"
            onClick={() => setPricesCollapsed((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-accent)]"
            title={pricesCollapsed ? "Mostrar precios" : "Ocultar precios"}
          >
            <span>{pricesCollapsed ? "▶" : "▼"}</span>
            <span>💵</span>
            <span>Precios por día</span>
            <span className="ml-1 normal-case text-[10px] tracking-normal text-[var(--color-muted)]">
              (un click en la celda del trabajador lo aplica al día)
            </span>
            {readOnly && <span className="text-[var(--color-warning)]">solo lectura</span>}
          </button>
          {!pricesCollapsed && (
            <div className="mt-2 flex flex-wrap gap-2">
              {days.map((d) => {
                const dayCfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
                const fallback = activeLabor.baseDayDefault ?? DEFAULT_BASE_DAY;
                const k = inputKey(activeLabor.id, d, "0_0");
                const localVal = localPriceInputs[k];
                const displayVal = localVal !== undefined
                  ? localVal
                  : (dayCfg.price ? dayCfg.price : "");
                const hasCustom = Number(dayCfg.price) > 0;
                const people = peopleByDate.get(d)?.size || 0;
                return (
                  <div
                    key={d}
                    className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs min-w-[180px] ${
                      hasCustom
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                    }`}
                  >
                    <div className="font-medium text-[var(--color-text)]">{d}</div>
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--color-muted)]">$</span>
                      <input
                        type="number" min="0" disabled={readOnly}
                        value={displayVal}
                        onChange={(e) =>
                          setLocalPriceInputs((prev) => ({ ...prev, [k]: e.target.value }))
                        }
                        onBlur={async () => {
                          if (localVal === undefined) return;
                          const price = parseAmount(String(localVal)) || 0;
                          setLocalPriceInputs((prev) => { const n = { ...prev }; delete n[k]; return n; });
                          if (price !== Number(dayCfg.price || 0)) {
                            await persistNormalDayPrice(activeLabor.id, d, price);
                          }
                        }}
                        placeholder={`sugerido ${fallback.toLocaleString("es-CL")}`}
                        className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                      />
                    </div>
                    {!hasCustom && (
                      <div className="text-[10px] text-[var(--color-muted)]">
                        usa base del ciclo · {fmtCurrency(fallback)}
                      </div>
                    )}
                    {people > 0 && (
                      <div className="text-[10px] text-[var(--color-muted)]">
                        👥 {people} {people === 1 ? "persona" : "personas"}
                      </div>
                    )}
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
