import { useEffect, useEffectEvent, useState } from "react";
import Modal from "../../../components/Modal";
import { fetchRecordHistory } from "../../../services/auditService";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";
import { filterPayrollHistory, payrollHistoryOf } from "../../../utils/payrollHistory";
import { workerSearchInput } from "../../../utils/workerSearch";
import { ProgressOverlay } from "../ProgressOverlay";

const dateTime = (d) =>
  d && !isNaN(d.getTime())
    ? d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

// La línea de tiempo de la nómina: cada cambio con quién lo hizo, cuándo y a
// quién le cambió algo, armada con sus registros de auditoría (una lectura por
// registro, al abrir). Se filtra por quién hizo el cambio y por una persona.
export function PayrollHistoryModal({ onClose, payroll }) {
  const [state, setState] = useState({ entries: null, error: "" });
  const [who, setWho] = useState("");
  const [query, setQuery] = useState("");

  const load = useEffectEvent(async (isCancelled) => {
    const { value, error: err } = await attempt(() => fetchRecordHistory("payroll", payroll.id));
    if (isCancelled()) return;
    setState(err ? { entries: null, error: errorText(err) } : { entries: payrollHistoryOf(value, payroll.items || []), error: "" });
  });
  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [payroll.id]);

  const entries = state.entries ? filterPayrollHistory(state.entries, { who, query }) : null;
  const authors = state.entries ? [...new Set(state.entries.map((e) => e.who))].sort((a, b) => a.localeCompare(b, "es")) : [];

  return (
    <Modal open onClose={onClose} title={`🕘 Historial · ${payroll.name || "Nómina"}`} size="lg" section="Historial de nómina">
      <ProgressOverlay info={!state.entries && !state.error ? { step: "Leyendo el historial…", indeterminate: true } : null} />
      {state.error && <p className="py-6 text-center text-sm text-[var(--color-danger)]">No se pudo leer el historial. {state.error}</p>}
      {state.entries && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">🔍</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(workerSearchInput(e.target.value))}
                placeholder="Buscar una persona por nombre o RUT"
                className="min-h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
              />
            </div>
            {authors.length > 1 && (
              <select
                value={who}
                onChange={(e) => setWho(e.target.value)}
                aria-label="Quién hizo el cambio"
                className="min-h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)]"
              >
                <option value="">Todos</option>
                {authors.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
          </div>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              {state.entries.length === 0 ? "Esta nómina no tiene registros." : "Nada calza con el filtro."}
            </p>
          ) : (
            <ol className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
                    <span className="tabular-nums">{dateTime(e.at)}</span>
                    <span>·</span>
                    <span className="font-medium text-[var(--color-text)]">{e.who}</span>
                  </div>
                  <div className={`mt-0.5 text-sm font-semibold ${e.truncated ? "text-[var(--color-warning)]" : ""}`}>{e.title}</div>
                  {e.lines.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs tabular-nums">
                      {e.lines.map((l, i) => (
                        <li key={i} className="[overflow-wrap:anywhere]">{l.text}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="text-[11px] text-[var(--color-muted)]">
            Sale de la auditoría: cada cambio guardado de la nómina. Los cambios del JSON y de las jornadas no van acá.
          </p>
        </div>
      )}
    </Modal>
  );
}
