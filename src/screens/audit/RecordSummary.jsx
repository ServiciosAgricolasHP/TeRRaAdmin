import { entityLabelEs } from "../../utils/auditLabels";
import { recordSummary } from "../../utils/auditRecord";
import { ActionPill } from "./LogsTable";

const shortDay = (isoDay) => {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
};

// El resumen arriba del historial de un registro: cuántas acciones hubo por
// tipo de registro y acción, por quién y, si abarca más de un día, por día.
export default function RecordSummary({ logs }) {
  const summary = recordSummary(logs);
  if (summary.total === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {summary.byEntity.map((e) => (
          <div key={e.entity} className="flex flex-wrap items-center gap-1">
            <span className="font-semibold">
              {entityLabelEs(e.entity)} <span className="tabular-nums">{e.count}</span>
            </span>
            {e.actions.map((a) => (
              <span key={a.action} className="inline-flex items-center gap-0.5">
                <ActionPill action={a.action} />
                <span className="tabular-nums text-[var(--color-muted)]">{a.count}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="text-[var(--color-muted)]">
        <span className="font-medium text-[var(--color-text)]">Quién:</span>{" "}
        {summary.byAuthor.map((a) => `${a.who} ${a.count}`).join(" · ")}
      </div>
      {summary.byDay.length > 1 && (
        <div className="text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-text)]">Días:</span>{" "}
          {summary.byDay.map((d) => `${shortDay(d.day)} ${d.count}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
