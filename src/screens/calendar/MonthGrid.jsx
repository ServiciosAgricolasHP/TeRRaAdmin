import { localIsoDate } from "../../utils/dates";
import { monthBounds, isWeekendDate } from "./helpers";

// ============================================================================
// Grilla del mes
// ============================================================================

export function MonthGrid({ year, month, dayIndex, loading, onCellClick, onBarClick }) {
  const { lastDay } = monthBounds(year, month);
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Domingo
  // Desfase con la semana empezando en lunes (dom=0 → 6, lun=1 → 0…)
  const offset = (firstWeekday + 6) % 7;
  const todayStr = localIsoDate();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push({ empty: true, key: `e${i}` });
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ empty: true, key: `f${cells.length}` });

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div key={`h${i}`} className="py-1">{d}</div>
        ))}
      </div>
      <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
        {cells.map((c) => {
          if (c.empty) return <div key={c.key} className="aspect-square" />;
          const items = dayIndex[c.date] || [];
          const isToday = c.date === todayStr;
          return (
            <div
              key={c.date}
              onClick={() => onCellClick(c.date)}
              className={`flex aspect-square cursor-pointer flex-col rounded border p-1 transition-colors hover:border-[var(--color-accent)] ${
                isToday
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}
            >
              <div
                className={`text-xs ${
                  isToday
                    ? "font-semibold text-[var(--color-accent)]"
                    : isWeekendDate(c.date)
                      ? "font-medium text-[#dc2626]"
                      : "text-[var(--color-muted)]"
                }`}
              >
                {c.day}
              </div>
              <div className="mt-1 flex-1 space-y-0.5 overflow-hidden">
                {items.slice(0, 4).map((it) => (
                  <button
                    key={it.subfaenaId}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBarClick(c.date, it.subfaenaId);
                    }}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-white hover:opacity-90"
                    style={{ backgroundColor: it.color }}
                    title={`${it.faenaName ? it.faenaName + " · " : ""}${it.name} · ${it.workerCount} trabajador${it.workerCount === 1 ? "" : "es"}`}
                  >
                    {it.name}
                  </button>
                ))}
                {items.length > 4 && (
                  <div className="text-[9px] text-[var(--color-muted)]">
                    +{items.length - 4} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
