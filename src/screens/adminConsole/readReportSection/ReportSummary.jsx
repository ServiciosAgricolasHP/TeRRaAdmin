import { fmtNumber, fmtShortDate } from "../../../utils/format";
import { fmtDuration } from "../../../utils/auditLogs";
import { FREE_DAILY_READS, WEEKDAYS, readsByDay, weekdayOf } from "../../../utils/readLogReport";

// Los totales del rango filtrado y las lecturas de cada día, marcando los
// que pasan la cuota gratis.
export function ReportSummary({ logs, totals }) {
  const days = readsByDay(logs);
  const maxDocs = Math.max(1, ...days.map((d) => d.docs));
  const tiles = [
    { label: "Lecturas cobradas", value: fmtNumber(totals.docs), strong: true },
    { label: "Ahorradas por caché", value: fmtNumber(totals.cacheDocs) },
    { label: "Escrituras", value: fmtNumber(totals.writes) },
    { label: "Visitas", value: fmtNumber(totals.visits) },
    { label: "Tiempo de uso", value: totals.seconds ? fmtDuration(totals.seconds * 1000) : "—" },
    { label: "Personas", value: fmtNumber(totals.people) },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
            <div className="text-[11px] text-[var(--color-muted)]">{t.label}</div>
            <div className={`tabular-nums ${t.strong ? "text-lg font-semibold" : "text-base"}`}>{t.value}</div>
          </div>
        ))}
      </div>

      {days.length ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-[var(--color-muted)]">Lecturas por día</div>
          {days.map((d) => {
            const over = d.docs > FREE_DAILY_READS;
            return (
              <div key={d.date} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 tabular-nums text-[var(--color-muted)]">
                  {WEEKDAYS[weekdayOf(d.date)]} {fmtShortDate(d.date)}
                </span>
                <div className="h-3 min-w-0 flex-1 rounded-sm bg-[var(--color-surface-2)]">
                  <div
                    className={`h-3 rounded-sm ${over ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent)]"}`}
                    style={{ width: `${Math.max(1, (100 * d.docs) / maxDocs)}%` }}
                  />
                </div>
                <span className={`w-16 shrink-0 text-right tabular-nums ${over ? "font-semibold text-[var(--color-danger)]" : ""}`}>
                  {fmtNumber(d.docs)}
                </span>
              </div>
            );
          })}
          <p className="text-[11px] text-[var(--color-muted)]">
            En rojo, los días que pasan las {fmtNumber(FREE_DAILY_READS)} lecturas que Firestore no cobra. Es una cuota de todo el
            proyecto: el escáner, las Cloud Functions y la consola de Firebase también la usan.
          </p>
        </div>
      ) : null}
    </div>
  );
}
