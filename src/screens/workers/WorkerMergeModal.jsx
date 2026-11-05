import Modal, { ModalCloseButton } from "../../components/Modal";
import WorkerSearchPicker from "../../components/WorkerSearchPicker";
import { ProgressBar } from "../../components/ProgressBar";
import { useCatalogs } from "../../contexts/CatalogsContext";
import { comboLabel, parseComboKey } from "../../utils/cosechaCombos";
import { fmtCurrency, fmtNumber } from "../../utils/format";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { MERGE_WORD, useWorkerMerge } from "./useWorkerMerge";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "—");
const plural = (n, one, many) => `${fmtNumber(n)} ${n === 1 ? one : many}`;
const rutOf = (w) => formatRutForDisplay(w?.rut || w?.id);
const btn = "min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50";
const selectCls = "min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";

// Unir una ficha duplicada (`clone`) a la que se queda: elegirla, ver qué pasa
// y qué no, resolver los choques y confirmar escribiendo "unir".
export default function WorkerMergeModal({ clone, onClose, onDone }) {
  const m = useWorkerMerge({ clone, onDone });
  const { plan, kept } = m;
  const cycles = m.analysis?.cycles || {};
  const movedCycles = plan ? new Set([...plan.moves, ...plan.conflicts].map((x) => x.data.cycleId)).size : 0;
  return (
    <Modal
      open
      onClose={() => !m.busy && onClose()}
      title={`Unir ficha · ${clone.name}`}
      size="lg"
      section="Unir fichas"
      dirty={!!kept && !m.busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <ModalCloseButton className={btn} disabled={m.busy}>Cancelar</ModalCloseButton>
          <button
            type="button"
            onClick={m.run}
            disabled={!m.canRun}
            className="min-h-9 rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {m.busy ? "Uniendo…" : "Unir fichas"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-[var(--color-muted)]">
          Une esta ficha duplicada a la que se queda: sus jornadas sin nómina pasan a esa, y esta deja de aparecer en Trabajadores y en los buscadores. Su RUT ({rutOf(clone)}) queda apuntando a la que elijas: la próxima importación calza con ella y no se puede crear otra ficha con ese RUT. Las nóminas ya hechas no cambian.
        </p>

        {!kept ? (
          <div>
            <div className="mb-1 text-[var(--color-muted)]">¿Con qué ficha se une?</div>
            <WorkerSearchPicker autoFocus pickedIds={new Set([clone.id])} pickedLabel="esta ficha" actionLabel="Unir con esta" onPick={m.pick} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="min-w-0">
              <div className="break-words"><span className="text-[var(--color-muted)]">Se une:</span> {clone.name} · {rutOf(clone)}</div>
              <div className="break-words font-medium"><span className="font-normal text-[var(--color-muted)]">Queda:</span> {kept.name} · {rutOf(kept)}</div>
            </div>
            <button type="button" onClick={m.reset} disabled={m.busy} className={btn}>Cambiar</button>
          </div>
        )}

        {m.analyzing && <p className="text-[var(--color-muted)]">Revisando las jornadas y los ciclos…</p>}
        {m.analyzeError && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]">No se pudo revisar: {m.analyzeError}</p>}

        {plan && (
          <>
            {m.blockers.length > 0 && (
              <div className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]">
                <div className="font-medium">No se puede unir todavía:</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {m.blockers.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
            )}

            <ul className="list-disc space-y-1 pl-5">
              <li>
                {plan.moves.length + plan.conflicts.length > 0
                  ? `Pasan a ${kept.name} ${plural(plan.moves.length + plan.conflicts.length, "jornada sin nómina", "jornadas sin nómina")}, de ${plural(movedCycles, "ciclo", "ciclos")}.`
                  : "No tiene jornadas sin nómina que pasar."}
              </li>
              {plan.paid.length > 0 && (
                <li>{plural(plan.paid.length, "jornada ya está", "jornadas ya están")} en una nómina: no se toca{plan.paid.length === 1 ? "" : "n"}, y {clone.name} sigue en esas labores.</li>
              )}
              {plan.rosters.length > 0 && <li>En {plural(plan.rosters.length, "ciclo abierto", "ciclos abiertos")}, {kept.name} toma su lugar en las labores.</li>}
              <li>{kept.name} guarda el RUT {rutOf(clone)} y el nombre &quot;{clone.name}&quot;.</li>
              <li>{clone.name} deja de aparecer en Trabajadores y en los buscadores.</li>
            </ul>

            {plan.conflicts.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium">Choques ({plan.conflicts.length})</div>
                <p className="text-[var(--color-muted)]">Las dos fichas tienen jornada el mismo día, en la misma labor y en el mismo tipo. Elige cuál queda.</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => m.setAll("kept")} disabled={m.busy} className={btn}>Todas: la de {kept.name}</button>
                  <button type="button" onClick={() => m.setAll("clone")} disabled={m.busy} className={btn}>Todas: la de {clone.name}</button>
                  {plan.conflicts.some((c) => c.canSum) && (
                    <button type="button" onClick={() => m.setAll("sum")} disabled={m.busy} className={btn}>Sumar las de cosecha</button>
                  )}
                </div>
                <ul className="space-y-2">
                  {plan.conflicts.map((c) => (
                    <ConflictRow key={c.toId} c={c} cycle={cycles[c.cycleId]} clone={clone} kept={kept} disabled={m.busy} onChoose={(v) => m.setDecision(c.toId, v)} />
                  ))}
                </ul>
              </div>
            )}

            {m.blockers.length === 0 && (
              <label className="block">
                <span className="mb-1 block text-[var(--color-muted)]">
                  Escribe <strong className="font-mono">{MERGE_WORD}</strong> para confirmar
                </span>
                <input
                  type="text"
                  value={m.typed}
                  onChange={(e) => m.setTyped(e.target.value)}
                  disabled={m.busy}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </label>
            )}
            {m.progress && <ProgressBar label={m.progress.label} done={m.progress.done} total={m.progress.total} />}
          </>
        )}
      </div>
    </Modal>
  );
}

// Lo que tiene cada ficha en una jornada que choca: cantidad y monto.
const amountText = (wd) => `${fmtNumber(Number(wd?.qty) || 0)} · ${fmtCurrency(Number(wd?.amount) || 0)}`;

// Un choque: dónde es, lo que tiene cada ficha y qué queda.
function ConflictRow({ c, cycle, clone, kept, disabled, onChoose }) {
  const { catalogs } = useCatalogs();
  const labor = (cycle?.labors || []).find((l) => l.id === c.laborId);
  const ck = c.toId.split("__")[4];
  const type = c.clone.pisoOnly ? "Piso" : /^\d+_\d+$/.test(ck || "") ? comboLabel(catalogs, parseComboKey(ck).x, parseComboKey(ck).y) : "";
  return (
    <li className="rounded-lg border border-[var(--color-border)] p-2.5">
      <div className="break-words font-medium">
        {[cycle?.label, labor?.name, fmtDate(c.date), type].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-[var(--color-muted)] sm:grid-cols-2">
        <div>{kept.name}: {amountText(c.kept)}</div>
        <div>{clone.name}: {amountText(c.clone)}</div>
      </div>
      {c.keptPaid ? (
        <div className="mt-2 text-xs text-[var(--color-warning)]">La de {kept.name} está en una nómina: queda esa y se borra la otra.</div>
      ) : (
        <select aria-label="Qué queda" value={c.choice} onChange={(e) => onChoose(e.target.value)} disabled={disabled} className={`${selectCls} mt-2`}>
          <option value="kept">Queda la de {kept.name}</option>
          <option value="clone">Queda la de {clone.name}</option>
          {c.canSum && <option value="sum">Sumar las dos</option>}
        </select>
      )}
    </li>
  );
}
