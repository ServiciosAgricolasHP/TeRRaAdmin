import { matchesSearchQuery } from "../../../utils/textSearch";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

export function LeaderPicker() {
  const { assignLeaderToWorker, enabledLeaders } = useCycleDetail();
  const {
    leaderBusy,
    leaderFilter,
    setLeaderFilter,
    setPickingLeader,
    workerRut,
  } = useWorkerEdit();
  const filteredLeaders = leaderFilter.trim()
  ? enabledLeaders.filter((l) => matchesSearchQuery(l, leaderFilter))
  : enabledLeaders;
  return <div className="space-y-3">
    <button
      type="button"
      onClick={() => setPickingLeader(false)}
      className="text-sm text-[var(--color-accent)] hover:underline"
    >
      ‹ Volver
    </button>
    <input
      type="text"
      autoFocus
      placeholder="Filtrar..."
      value={leaderFilter}
      onChange={(e) => setLeaderFilter(e.target.value)}
      className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
    />
    <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
      {enabledLeaders.length === 0 ? (
        <div className="p-3 text-sm text-[var(--color-muted)]">
          No hay líderes habilitados. Habilita líderes en la colección <code>groupLeader</code>.
        </div>
      ) : filteredLeaders.length === 0 ? (
        <div className="p-3 text-sm text-[var(--color-muted)]">Sin resultados.</div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {filteredLeaders.map((l) => (
            <li key={l}>
              <button
                type="button"
                disabled={leaderBusy}
                onClick={async () => {
                  await assignLeaderToWorker(workerRut, l);
                  setPickingLeader(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                <span className="font-medium">{l}</span>
                <span className="text-xs text-[var(--color-muted)]">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>;
}
