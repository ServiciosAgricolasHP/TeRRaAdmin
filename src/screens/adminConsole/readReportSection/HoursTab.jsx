import { fmtNumber } from "../../../utils/format";
import { WEEKDAYS, readsByHour } from "../../../utils/readLogReport";

const hourLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;

// "1,2k" para que quepa en la celda.
function fmtCell(value) {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace(".", ",")}k`;
}

// Mapa de lecturas por hora (filas) y día de la semana (columnas). Muestra de
// la primera a la última hora con lecturas.
export function HoursTab({ logs }) {
  const { grid, max } = readsByHour(logs);
  const used = grid.map((row) => row.some((v) => v > 0));
  const firstHour = used.indexOf(true);
  const lastHour = used.lastIndexOf(true);

  if (firstHour < 0) return <p className="text-sm text-[var(--color-muted)]">Nada que mostrar con estos filtros.</p>;

  const hours = [];
  for (let h = firstHour; h <= lastHour; h += 1) hours.push(h);

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-muted)]">
        Lecturas cobradas, con la hora del navegador de cada persona. Un día de la semana suma todas sus fechas del rango.
      </p>
      <div
        className="grid gap-px text-[10px]"
        style={{ gridTemplateColumns: "2.75rem repeat(7, minmax(0, 1fr))" }}
      >
        <div />
        {WEEKDAYS.map((day) => (
          <div key={day} className="pb-1 text-center font-medium text-[var(--color-muted)]">
            {day}
          </div>
        ))}
        {hours.flatMap((hour) => [
          <div key={`h-${hour}`} className="pr-1 text-right leading-6 text-[var(--color-muted)]">
            {hourLabel(hour)}
          </div>,
          ...grid[hour].map((value, day) => {
            const strength = max ? Math.round((80 * value) / max) + (value ? 10 : 0) : 0;
            return (
              <div
                key={`${hour}-${WEEKDAYS[day]}`}
                title={`${WEEKDAYS[day]} ${hourLabel(hour)}: ${fmtNumber(value)} lecturas`}
                className="h-6 rounded-sm bg-[var(--color-surface-2)] text-center leading-6 tabular-nums"
                style={value ? { backgroundColor: `color-mix(in srgb, var(--color-accent) ${strength}%, var(--color-surface-2))` } : undefined}
              >
                {value ? fmtCell(value) : ""}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}
