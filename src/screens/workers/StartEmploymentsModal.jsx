import { useEffect, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import WorkerSearchPicker from "../../components/WorkerSearchPicker";
import { useWorkersList } from "../../hooks/useWorkersList";
import { cyclesService } from "../../services";
import { listEmploymentsOfWorkers, startEmployments } from "../../services/employmentsService";
import { localIsoDate } from "../../utils/dates";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { EMPLOYMENT_TYPES, activeByWorker, planStartEmployments } from "../../utils/employment";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

// Las mismas opciones que Nómina, así comparten la caché de ciclos.
const CYCLES_LIST = { order: ["createdAt", "desc"], cache: true, persist: true, ttl: 5 * 60 * 1000 };

// Contratar o pasar a honorarios a varias personas desde la misma fecha. Se
// suman una por una o "desde un ciclo": quienes están en sus labores y no
// tienen un período vigente en esa fecha. Antes de escribir se leen los
// períodos de esas personas, y quien se cruzaría con otro queda afuera.
export default function StartEmploymentsModal({ employers, activeEmployments, onClose, onDone }) {
  const { workers } = useWorkersList();
  const [type, setType] = useState("contract");
  const [employerId, setEmployerId] = useState("");
  const [startDate, setStartDate] = useState(localIsoDate());
  const [notes, setNotes] = useState("");
  const [people, setPeople] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState("");
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    cyclesService
      .list(CYCLES_LIST)
      .then((list) => setCycles(list.filter((c) => c.status !== "closed")))
      .catch(() => setCycles([]));
  }, []);

  const personOf = (w) => ({ workerId: w.id, rut: w.rut || w.id, name: w.name || "" });
  const add = (list) => {
    setPlan(null);
    setPeople((prev) => {
      const seen = new Set(prev.map((p) => p.workerId));
      return [...prev, ...list.filter((p) => !seen.has(p.workerId) && seen.add(p.workerId))];
    });
  };
  const remove = (id) => {
    setPlan(null);
    setPeople((prev) => prev.filter((p) => p.workerId !== id));
  };

  // Quienes están en las labores del ciclo (sin los temporales) y no tienen
  // un período vigente en la fecha de inicio.
  const addFromCycle = (id) => {
    setCycleId(id);
    const cycle = cycles.find((c) => c.id === id);
    if (!cycle) return;
    const busyIds = activeByWorker(activeEmployments, startDate);
    const byId = new Map(workers.map((w) => [w.id, w]));
    const ids = new Set((cycle.labors || []).flatMap((l) => (l.workers || []).filter((w) => !w?.isTemp).map((w) => w.rut)));
    add([...ids].filter((wid) => !busyIds.has(wid) && byId.has(wid)).map((wid) => personOf(byId.get(wid))));
  };

  // Lee los períodos de esas personas y arma el plan. Si alguien queda
  // afuera, lo muestra y espera la confirmación; si no, escribe de una.
  const review = async () => {
    const ids = people.map((p) => p.workerId);
    const fields = { type, employerId, startDate, notes: notes.trim() };
    setBusy(true);
    setError("");
    try {
      const next = planStartEmployments(await listEmploymentsOfWorkers(ids), people, fields);
      if (next.skipped.length) setPlan(next);
      else await write(next);
    } catch (e) {
      setError(e.message || "No se pudo contratar.");
    }
    setBusy(false);
  };

  const write = async (p) => {
    const created = p.create.length ? await startEmployments(p.create) : [];
    onDone(created.length);
  };

  const confirmPlan = async () => {
    setBusy(true);
    try {
      await write(plan);
    } catch (e) {
      setError(e.message || "No se pudo contratar.");
      setBusy(false);
    }
  };

  const verb = type === "contract" ? "Contratar" : "Pasar a honorarios";
  const ready = people.length > 0 && employerId && startDate;

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={type === "contract" ? "Contratar" : "Pasar a honorarios"}
      size="lg"
      dirty={people.length > 0 && !busy}
      footer={
        <>
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            Cancelar
          </ModalCloseButton>
          {plan ? (
            <button type="button" onClick={confirmPlan} disabled={busy || plan.create.length === 0} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
              {busy ? "Guardando…" : `${verb} a ${plan.create.length}`}
            </button>
          ) : (
            <button type="button" onClick={review} disabled={busy || !ready} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
              {busy ? "Revisando…" : `${verb} (${people.length})`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Tipo</span>
            <select value={type} onChange={(e) => { setType(e.target.value); setPlan(null); }} className={inputCls}>
              {Object.entries(EMPLOYMENT_TYPES).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Empleador</span>
            <select value={employerId} onChange={(e) => { setEmployerId(e.target.value); setPlan(null); }} className={inputCls}>
              <option value="">Elige…</option>
              {employers.filter((x) => x.enabled !== false).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Desde</span>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPlan(null); }} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Notas (opcional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm text-[var(--color-muted)]">Agregar personas</div>
            <WorkerSearchPicker onPick={(w) => add([personOf(w)])} pickedIds={new Set(people.map((p) => p.workerId))} actionLabel="+ Agregar" take={20} />
          </div>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">O desde un ciclo abierto</span>
            <select value={cycleId} onChange={(e) => addFromCycle(e.target.value)} className={inputCls}>
              <option value="">Elige un ciclo…</option>
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
            </select>
            <span className="mt-1 block text-xs text-[var(--color-muted)]">Suma a quienes están en sus labores y no tienen contrato ni honorarios vigentes en esa fecha.</span>
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">{people.length} persona{people.length === 1 ? "" : "s"}</span>
            {people.length > 0 && (
              <button type="button" onClick={() => { setPeople([]); setPlan(null); }} className="text-xs text-[var(--color-muted)] underline">
                Quitar todas
              </button>
            )}
          </div>
          <ul className="max-h-56 divide-y divide-[var(--color-border)] overflow-y-auto rounded-md border border-[var(--color-border)] text-sm">
            {people.length === 0 && <li className="px-3 py-2 text-[var(--color-muted)]">Nadie todavía.</li>}
            {people.map((p) => (
              <li key={p.workerId} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="truncate">
                  {p.name} <span className="text-xs text-[var(--color-muted)]">{formatRutForDisplay(p.rut)}</span>
                </span>
                <button type="button" onClick={() => remove(p.workerId)} aria-label={`Quitar a ${p.name}`} className="shrink-0 rounded px-2 text-[var(--color-muted)] hover:text-[var(--color-danger)]">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>

        {plan && plan.skipped.length > 0 && (
          <div className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm">
            <div className="mb-1 font-medium text-[var(--color-warning)]">
              {plan.skipped.length} quedan afuera porque ya tienen un período en esa fecha:
            </div>
            <ul className="space-y-0.5 text-xs">
              {plan.skipped.map((s) => (
                <li key={s.person.workerId}>
                  {s.person.name}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
