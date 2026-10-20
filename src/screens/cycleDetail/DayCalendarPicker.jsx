import { localIsoDate } from "../../utils/dates";

// ============================================================
// Selector de días en calendario (selección múltiple)
// ============================================================
const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const WEEKDAYS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function pad2(n) { return String(n).padStart(2, "0"); }

function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

export function DayCalendarPicker({ viewMonth, setViewMonth, selectedDays, toggleDay, existingDays }) {
  const { year, month } = viewMonth;
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Semana ISO: lunes = 0, domingo = 6
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const existingSet = new Set(existingDays);
  const todayIso = localIsoDate();

  const prevMonth = () =>
    setViewMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  const nextMonth = () =>
    setViewMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={prevMonth} className="rounded px-2 py-1 text-sm hover:bg-[var(--color-accent-soft)]">‹</button>
        <div className="text-sm font-semibold">{MONTHS_ES[month]} {year}</div>
        <button onClick={nextMonth} className="rounded px-2 py-1 text-sm hover:bg-[var(--color-accent-soft)]">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-[var(--color-muted)]">
        {WEEKDAYS_ES.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} className="aspect-square" />;
          const iso = isoDate(year, month, d);
          const isExisting = existingSet.has(iso);
          const isSelected = selectedDays.has(iso);
          const isToday = iso === todayIso;
          let cls = "aspect-square rounded text-sm transition-colors flex items-center justify-center cursor-pointer ";
          if (isExisting) {
            cls += "bg-[var(--color-surface-2)] text-[var(--color-muted)] cursor-not-allowed line-through";
          } else if (isSelected) {
            cls += "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-semibold";
          } else {
            cls += "hover:bg-[var(--color-accent-soft)] " + (isToday ? "ring-1 ring-[var(--color-accent)]" : "");
          }
          return (
            <button
              key={i}
              type="button"
              disabled={isExisting}
              onClick={() => toggleDay(iso)}
              className={cls}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
