import { useMemo } from "react";
import { fmtDateTime, fmtDuration, fmtTime, toDate } from "../../utils/auditLogs";
import LogsTable from "./LogsTable";

// Una sesión: quién, cuándo y cuánto duró, con sus acciones por tipo y por
// entidad. Al abrirla muestra sus acciones en orden.
export default function SessionCard({ session, open, onToggle }) {
  "use no memo";
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)]"
      >
        <span className="mt-0.5 text-[var(--color-muted)]">
          {open ? "▾" : "▸"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">{session.email || session.uid || "(desconocido)"}</span>
            <span className="text-xs text-[var(--color-muted)]">
              {fmtDateTime(session.startDate)}
              {session.count > 1 && ` → ${fmtTime(session.endDate)} (${fmtDuration(session.durationMs)})`}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-semibold">
              {session.count} acc.
            </span>
            {session.byAction.create > 0 && (
              <span className="rounded bg-[#dcfce7] px-1.5 py-0.5 text-[#166534]">
                +{session.byAction.create}
              </span>
            )}
            {session.byAction.update > 0 && (
              <span className="rounded bg-[#fef3c7] px-1.5 py-0.5 text-[#92400e]">
                ✎{session.byAction.update}
              </span>
            )}
            {session.byAction.delete > 0 && (
              <span className="rounded bg-[#fee2e2] px-1.5 py-0.5 text-[#b91c1c]">
                −{session.byAction.delete}
              </span>
            )}
            <span className="text-[var(--color-muted)]">·</span>
            {session.byEntity.map(([e, n]) => (
              <span key={e} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[var(--color-muted)]">
                {e} × {n}
              </span>
            ))}
          </div>
        </div>
      </button>
      {open && (
        <SessionDetail logs={session.logs} />
      )}
    </div>
  );
}

// Detalle de una sesión — tabla de acciones ordenadas cronológicamente,
// envolviendo LogsTable con el borde/fondo propio de una sesión expandida.
function SessionDetail({ logs }) {
  const sorted = useMemo(
    () => [...logs].sort((a, b) => toDate(a.timestamp) - toDate(b.timestamp)),
    [logs],
  );
  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]" style={{ WebkitOverflowScrolling: "touch" }}>
        <LogsTable logs={sorted} />
      </div>
    </div>
  );
}
