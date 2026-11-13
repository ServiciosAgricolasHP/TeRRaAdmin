import { entityLabelEs } from "../../utils/auditLabels";
import { recordSummary } from "../../utils/auditRecord";
import { ActionPill } from "./LogsTable";

const shortDay = (isoDay) => {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
};

// El resumen arriba del historial de un registro: cuántas acciones hubo por
// tipo de registro y acción, por quién y, si abarca más de un día, por día.
// También filtra (`filter`, `onFilter`): tocar un tipo deja solo sus acciones,
// tocar una acción deja solo esa, y tocar lo elegido lo quita.
export default function RecordSummary({ logs, filter, onFilter }) {
  const summary = recordSummary(logs);
  if (summary.total === 0) return null;
  const pick = (entity, action = null) =>
    onFilter(filter.entity === entity && filter.action === action ? { entity: null, action: null } : { entity, action });
  const chip = (active) =>
    `inline-flex min-h-8 items-center gap-1 rounded-md border px-1.5 ${
      active ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-transparent hover:border-[var(--color-border)]"
    }`;

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {summary.byEntity.map((e) => (
          <div key={e.entity} className="flex flex-wrap items-center gap-0.5">
            <button
              type="button"
              onClick={() => pick(e.entity)}
              title={`Ver solo: ${entityLabelEs(e.entity)}`}
              className={`${chip(filter.entity === e.entity && !filter.action)} font-semibold`}
            >
              {entityLabelEs(e.entity)} <span className="tabular-nums">{e.count}</span>
            </button>
            {e.actions.map((a) => (
              <button
                key={a.action}
                type="button"
                onClick={() => pick(e.entity, a.action)}
                title="Ver solo esta acción"
                className={chip(filter.entity === e.entity && filter.action === a.action)}
              >
                <ActionPill action={a.action} />
                <span className="tabular-nums text-[var(--color-muted)]">{a.count}</span>
              </button>
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
