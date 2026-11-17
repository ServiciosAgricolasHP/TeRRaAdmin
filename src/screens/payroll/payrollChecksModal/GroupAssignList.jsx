import { useState } from "react";
import { formatRutForDisplay } from "../../../utils/rutUtils";
import { SEVERITY_ICON } from "../checkSeverity";

// Las personas sin grupo, cada una con un selector que trae elegido el grupo
// sugerido, y un botón que asigna los elegidos de una vez (en las fichas).
// `onAssign([{ person, rut, leader }])` devuelve si se guardó.
export function GroupAssignList({ alerts, leaderOptions, onAssign, busy }) {
  const [choice, setChoice] = useState(() => Object.fromEntries(alerts.map((a) => [a.person, a.suggestion?.leader || ""])));
  const chosen = alerts.filter((a) => choice[a.person]);

  const assign = () => onAssign(chosen.map((a) => ({ person: a.person, rut: a.rut, leader: choice[a.person] })));

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-[var(--color-border)]">
        {alerts.map((a) => (
          <li key={a.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span aria-hidden="true">{SEVERITY_ICON[a.severity]}</span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">
                {a.name || "(sin nombre)"} <span className="font-mono text-xs font-normal text-[var(--color-muted)]">{formatRutForDisplay(a.rut)}</span>
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {a.lines.join(" · ")}
                {a.suggestion && ` · Sugerido: ${a.suggestion.leader} (${a.suggestion.reason})`}
              </div>
            </div>
            <select
              value={choice[a.person] || ""}
              onChange={(e) => setChoice((prev) => ({ ...prev, [a.person]: e.target.value }))}
              disabled={busy}
              aria-label={`Grupo de ${a.name || a.rut}`}
              className="min-h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)] sm:w-48"
            >
              <option value="">— Elegir grupo —</option>
              {leaderOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {leaderOptions.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">No hay grupos habilitados en la lista de líderes.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-[var(--color-muted)]">Se guarda en la ficha de cada persona.</span>
          <button
            type="button"
            onClick={assign}
            disabled={busy || chosen.length === 0}
            className="min-h-8 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? "Asignando…" : chosen.length === 1 ? "Asignar grupo a 1 persona" : `Asignar grupo a ${chosen.length} personas`}
          </button>
        </div>
      )}
    </div>
  );
}
