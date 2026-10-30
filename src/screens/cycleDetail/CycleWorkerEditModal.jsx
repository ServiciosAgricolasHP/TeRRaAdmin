import { useState } from "react";
import Modal from "../../components/Modal";
import DayConfigContent from "./cycleWorkerEditModal/DayConfigContent";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { initials } from "../../utils/nameUtils";
import { dayHasData } from "../../utils/cycleRowUtils";
import { useCycleDetail } from "./CycleDetailContext";
import { fmtCurrency } from "../../utils/format";
import { WorkerEditContext } from "./cycleWorkerEditModal/WorkerEditContext";
import { LeaderPicker } from "./cycleWorkerEditModal/LeaderPicker";
import { BonusEditor } from "./cycleWorkerEditModal/BonusEditor";
import { WorkerTopActions } from "./cycleWorkerEditModal/WorkerTopActions";
import { HarvestDay } from "./cycleWorkerEditModal/HarvestDay";
import { PieceworkDay } from "./cycleWorkerEditModal/PieceworkDay";
import { StagesDay } from "./cycleWorkerEditModal/StagesDay";
import { OvertimeDay } from "./cycleWorkerEditModal/OvertimeDay";
import { NormalDay } from "./cycleWorkerEditModal/NormalDay";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// Modal mobile: edita un trabajador a la vez, una tarjeta por día (en vez de
// una columna por día como la grilla). Escribe con las mismas funciones que la
// grilla (las de useCellEdits.js: commitHarvestCombo/commitPieceworkTier/
// commitStageQty/commitNormalAmount/upsertOvertimeDayWorkday): el camino a
// Firestore y el cálculo de montos son los mismos.
//
// Configurar un combo/tier/etapa o el precio del día afecta a todos los
// trabajadores de ese día, así que vive en una vista aparte
// (DayConfigContent) que reemplaza el contenido de este mismo Modal en vez de
// abrir uno anidado.
export default function CycleWorkerEditModal({
  workerRut,
  onClose,
  row,
  onRemoveWorker,
  currentLeader,
  leaderBusy,
  onNavigate,
  canGoPrev,
  canGoNext,
}) {
  const {
    activeLabor,
    days,
  } = useCycleDetail();
  const [drafts, setDrafts] = useState({});
  const [configuringDate, setConfiguringDate] = useState(null);
  const [pickingLeader, setPickingLeader] = useState(false);
  const [leaderFilter, setLeaderFilter] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [bonusDate, setBonusDate] = useState(null);
  const [drivingBonusChecked, setDrivingBonusChecked] = useState(false);
  const [bonusSupervisionChecked, setBonusSupervisionChecked] = useState(false);
  const [bonusExtras, setBonusExtras] = useState("");
  const [onlyWithData, setOnlyWithData] = useState(false);
  const [savingFields, setSavingFields] = useState({});

  // El modal queda montado y solo cambia `workerRut`. Al cambiar de
  // trabajador (también con ‹/›) vuelve a la vista principal y descarta los
  // textos sin confirmar, la búsqueda de líder y las confirmaciones pendientes.
  if (useValuesChanged([workerRut])) {
    setConfiguringDate(null);
    setPickingLeader(false);
    setLeaderFilter("");
    setConfirmingRemove(false);
    setBonusDate(null);
    setDrafts({});
  }

  // Precarga el formulario de bonos: los valores del día si ya tiene algo
  // cargado, o los `bonusDefaults` del trabajador si está vacío. El
  // BonusEditModal de escritorio mira si existe el workday; acá no se tiene el
  // workday, así que "vacío" es que todos los campos del día estén en cero.
  if (useValuesChanged([bonusDate, row, activeLabor, workerRut], { onMount: true }) && bonusDate && row && activeLabor) {
    const isBlankDay =
      !row[`${bonusDate}__m`] &&
      !row[`${bonusDate}__s`] &&
      !(Number(row[`${bonusDate}__x`]) || 0) &&
      !(Number(row[`${bonusDate}__qty`]) || 0) &&
      !(Number(row[`${bonusDate}__he`]) || 0);
    const defaults = activeLabor.bonusDefaults?.[workerRut] || {};
    setDrivingBonusChecked(isBlankDay ? !!defaults.manejo : !!row[`${bonusDate}__m`]);
    setBonusSupervisionChecked(isBlankDay ? !!defaults.supervision : !!row[`${bonusDate}__s`]);
    setBonusExtras(row[`${bonusDate}__x`] ? String(row[`${bonusDate}__x`]) : "");
  }

  const open = !!workerRut && !!row && !!activeLabor;

  const setDraft = (field, value) => setDrafts((prev) => ({ ...prev, [field]: value }));
  const clearDraft = (field) =>
    setDrafts((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  const displayValue = (field) => (drafts[field] !== undefined ? drafts[field] : row?.[field] || "");
  // Campos con una escritura en curso, para el indicador "guardando…". Va
  // aparte de `drafts` (el texto en edición): cubre desde que se suelta el
  // input hasta que Firestore confirma.
  const setSaving = (field, value) =>
    setSavingFields((prev) => {
      if (value) return { ...prev, [field]: true };
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  // El indicador "guardando…" dura al menos MIN_SAVING_MS: con buena conexión
  // la escritura resuelve en pocos ms y no alcanzaría a verse.
  const MIN_SAVING_MS = 350;
  const runWithSaving = async (field, task) => {
    setSaving(field, true);
    const started = Date.now();
    const { value, error: err } = await attempt(task);
    const elapsed = Date.now() - started;
    if (elapsed < MIN_SAVING_MS) await new Promise((r) => setTimeout(r, MIN_SAVING_MS - elapsed));
    setSaving(field, false);
    if (err) throw err;
    return value;
  };

  if (!open) return null;

  const type = activeLabor.type;
  const isHarvest = type === "cosecha";
  const isPiecework = type === "trato";
  const isPieceworkStages = type === "tratoEtapas";
  const isOvertimeDay = type === "tratoHE";
  // Mismo criterio que `allowsMonthly` en CycleDetail.jsx: labores al día y
  // jornadas con horas extras.
  const allowsMonthly = !isHarvest && !isPiecework && !isPieceworkStages;
  const isTemp = !!row._isTemp;

  const doRemove = async () => {
    setRemoving(true);
    const { error: err } = await attempt(async () => {
      const ok = await onRemoveWorker(workerRut);
      if (ok) onClose();
      else setConfirmingRemove(false);
    });
    setRemoving(false);
    if (err) throw err;
  };

  const visibleDays = onlyWithData ? days.filter((d) => dayHasData(row, d)) : days;
  // Cada campo se guarda al salir de él; queda sin guardar lo que se está
  // escribiendo y todavía no empezó a guardarse.
  const dirty = Object.keys(drafts).some((field) => !savingFields[field]);

  // Lo que leen las piezas del modal (ver WorkerEditContext).
  const workerEditContext = {
    allowsMonthly,
    bonusDate,
    bonusExtras,
    bonusSupervisionChecked,
    clearDraft,
    confirmingRemove,
    currentLeader,
    displayValue,
    doRemove,
    drafts,
    drivingBonusChecked,
    isTemp,
    leaderBusy,
    leaderFilter,
    removing,
    row,
    runWithSaving,
    savingFields,
    setBonusDate,
    setBonusExtras,
    setBonusSupervisionChecked,
    setConfiguringDate,
    setConfirmingRemove,
    setDraft,
    setDrivingBonusChecked,
    setLeaderFilter,
    setPickingLeader,
    workerRut,
  };

  return (
    <WorkerEditContext value={workerEditContext}>
      <Modal
        open={open}
        onClose={onClose}
        dirty={dirty}
        size="full"
        title={
          configuringDate ? (
            <div>
              <div className="font-semibold">Configurar · {configuringDate}</div>
              <div className="text-xs font-normal text-[var(--color-muted)]">{row.name}</div>
            </div>
          ) : pickingLeader ? (
            <div>
              <div className="font-semibold">Asignar líder</div>
              <div className="text-xs font-normal text-[var(--color-muted)]">{row.name}</div>
            </div>
          ) : bonusDate ? (
            <div>
              <div className="font-semibold">Bonos · {bonusDate}</div>
              <div className="text-xs font-normal text-[var(--color-muted)]">{row.name}</div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(-1)}
                  disabled={!canGoPrev}
                  title="Trabajador anterior"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
                >
                  ‹
                </button>
              )}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]">
                  {initials(row.name)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{row.name}</span>
                    {isTemp && (
                      <span className="rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-warning)]">
                        Temporal
                      </span>
                    )}
                    {row._isOrphan && (
                      <span className="rounded bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-danger)]">
                        Fuera del listado
                      </span>
                    )}
                    {row._monthly && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-normal text-emerald-700 dark:text-emerald-300">
                        Mensual
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-[var(--color-muted)]">
                    <span className="font-mono">{formatRutForDisplay(row._displayRut || workerRut)}</span>
                    <span>·</span>
                    <span className="font-semibold text-[var(--color-accent)]">{fmtCurrency(row.total || 0)}</span>
                  </div>
                </div>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(1)}
                  disabled={!canGoNext}
                  title="Trabajador siguiente"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
                >
                  ›
                </button>
              )}
            </div>
          )
        }
      >
        {configuringDate ? (
          <DayConfigContent
            date={configuringDate}
            onBack={() => setConfiguringDate(null)}
          />
        ) : pickingLeader ? (
          <LeaderPicker />
        ) : bonusDate ? (
          <BonusEditor />
        ) : (
          <div className="space-y-3 pb-2">
            <WorkerTopActions />
            <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
              <button
                type="button"
                onClick={() => setOnlyWithData(false)}
                className={`px-3 py-1.5 transition-colors ${
                  !onlyWithData
                    ? "bg-[var(--color-accent)] font-medium text-[var(--color-accent-fg)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                Todos · {days.length}
              </button>
              <button
                type="button"
                onClick={() => setOnlyWithData(true)}
                className={`border-l border-[var(--color-border)] px-3 py-1.5 transition-colors ${
                  onlyWithData
                    ? "bg-[var(--color-accent)] font-medium text-[var(--color-accent-fg)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                Con datos
              </button>
            </div>
            {visibleDays.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-muted)]">
                Sin días con datos.
              </div>
            ) : (
              visibleDays.map((d) => {
                if (isHarvest) return <HarvestDay key={d} d={d} />;
                if (isPiecework) return <PieceworkDay key={d} d={d} />;
                if (isPieceworkStages) return <StagesDay key={d} d={d} />;
                if (isOvertimeDay) return <OvertimeDay key={d} d={d} />;
                return <NormalDay key={d} d={d} />;
              })
            )}
          </div>
        )}
      </Modal>
    </WorkerEditContext>
  );
}
