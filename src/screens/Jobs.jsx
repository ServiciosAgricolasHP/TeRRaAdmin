import { useState, useEffect, useRef, Fragment, useEffectEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { cyclesService } from "../services";
import { UNGROUPED_ID } from "../services/userPrefsService";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { useIsMobile } from "../hooks/useIsMobile";
import { JobCardBody } from "./jobs/JobCardBody";
import { GroupHeader } from "./jobs/GroupHeader";
import { SelectedDetail } from "./jobs/SelectedDetail";
import { withInitial } from "./jobs/helpers";
import { useJobsData } from "./jobs/useJobsData";
import { useJobLayout } from "./jobs/useJobLayout";
import { useSubjobDisplay } from "./jobs/useSubjobDisplay";
import { useJobForms } from "./jobs/useJobForms";
import { useCycleForm } from "./jobs/useCycleForm";
import { useCloseCycleFlow } from "./jobs/useCloseCycleFlow";
import { useJobDeletion } from "./jobs/useJobDeletion";
import { JobFormModal } from "./jobs/JobFormModal";
import { SubjobFormModal } from "./jobs/SubjobFormModal";
import { CycleFormModal } from "./jobs/CycleFormModal";
import { FirstCycleOfferModal } from "./jobs/FirstCycleOfferModal";
import { CloseCycleModal } from "./jobs/CloseCycleModal";
import ScreenLoader from "../components/ScreenLoader";
import { useJobStates } from "./jobs/useJobStates";
import { JOB_STATE_GROUPS, JOB_STATE_SORTS, sinceLabel } from "../utils/jobStatus";
import { localIsoDate } from "../utils/dates";
import { useValuesChanged } from "../hooks/useValuesChanged";

const emptyJob = { name: "", location: "", notes: "" };

const emptySubjob = { name: "", notes: "" };

export default function Jobs() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedId, setSelectedId] = useState(() => searchParams.get("selected"));

  // Sincroniza selectedId con el parámetro `selected` de la URL (enlaces del breadcrumb de CycleDetail).
  const fromUrl = searchParams.get("selected");
  if (useValuesChanged([searchParams]) && fromUrl && fromUrl !== selectedId) setSelectedId(fromUrl);

  // Y al revés: la faena elegida queda en la URL.
  const writeSelectedToUrl = useEffectEvent((id) => {
    if (id) {
      if (searchParams.get("selected") !== id) setSearchParams({ selected: id }, { replace: true });
    } else if (searchParams.get("selected")) {
      setSearchParams({}, { replace: true });
    }
  });
  useEffect(() => {
    writeSelectedToUrl(selectedId);
  }, [selectedId]);

  const [busy, setBusy] = useState(false);

  const {
    cyclesByJob,
    jobs,
    loadCycles,
    loading,
    loadJobs,
    loadSubjobs,
    order,
    persistOrder,
    subjobsByJob,
  } = useJobsData({ selectedId, user });

  const {
    addGroup,
    collapsedGroups,
    colorOf,
    dragId,
    dropOverGroupId,
    dropOverId,
    editLayout,
    jobsByGroup,
    layout,
    onDragEnd,
    onDragLeave,
    onDragOver,
    onDragStart,
    onDrop,
    onGroupDragOver,
    onGroupDrop,
    removeGroup,
    setDropOverGroupId,
    setEditLayout,
    setJobCardColor,
    toggleGroupCollapsed,
    updateGroup,
  } = useJobLayout({ jobs, persistOrder, toast, user });

  // "Por estado" agrupa las tarjetas en activas, pausadas y cerradas, cada una
  // en dos tramos y ordenada por fecha, sin arrastrar ni organizar; "Mi orden"
  // son los grupos de cada quien.
  const { setStateSort, setViewMode, stateDates, stateJobs, stateSort, viewMode } = useJobStates({ jobs, refreshKey: cyclesByJob });
  const byState = !!stateJobs;
  const today = localIsoDate();
  const sortMeta = JOB_STATE_SORTS.find((s) => s.id === stateSort);
  const viewGroups = byState ? JOB_STATE_GROUPS : layout.groups;
  // El archivo de las cerradas parte plegado: en él, estar en la lista de
  // plegados significa estar abierto.
  const isGroupCollapsed = (g) => (g.collapsedByDefault ? !collapsedGroups.has(g.id) : collapsedGroups.has(g.id));
  const viewJobsByGroup = byState ? stateJobs : jobsByGroup;
  const organizing = editLayout && !byState;

  const {
    collapsedSubjobs,
    setCollapsedSubjobs,
    showClosedInSubjob,
    toggleHideSubjob,
    toggleShowClosed,
    toggleSubjobCollapse,
  } = useSubjobDisplay({
    loadSubjobs,
    selectedId,
    subjobsByJob,
    toast,
    user,
  });

  // Al abrir el detalle de una faena, desplaza la vista hasta el panel. Espera
  // un frame para que React lo dibuje antes de medir.
  const selectedDetailRef = useRef(null);
  useEffect(() => {
    if (!selectedId) return;
    const id = window.requestAnimationFrame(() => {
      const el = selectedDetailRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [selectedId]);

  const {
    jobForm,
    setJobForm,
    setSubjobForm,
    setSubjobOfferCycle,
    subjobForm,
    subjobOfferCycle,
    submitJob,
    submitSubjob,
  } = useJobForms({
    loadJobs,
    loadSubjobs,
    order,
    persistOrder,
    setBusy,
    toast,
  });

  const {
    cycleForm,
    cyclePrefix,
    openCreateCycle,
    openEditCycle,
    setCycleForm,
    submitCycle,
  } = useCycleForm({
    cyclesByJob,
    jobs,
    loadCycles,
    setBusy,
    subjobsByJob,
    toast,
  });

  const {
    closeFlow,
    confirmCloseCycle,
    createNextCycle,
    openCloseFlow,
    setCloseFlow,
  } = useCloseCycleFlow({ cyclePrefix, cyclesByJob, loadCycles, setBusy });

  const {
    cascadeConfirm,
    confirm,
    doDelete,
    progress: deletionProgress,
    setCascadeConfirm,
    setConfirm,
  } = useJobDeletion({
    isAdmin,
    loadCycles,
    loadJobs,
    loadSubjobs,
    order,
    persistOrder,
    selectedId,
    setSelectedId,
    toast,
  });

  const selected = jobs.find((f) => f.id === selectedId);
  const selectedSubjobs = selectedId ? subjobsByJob[selectedId] : null;
  const selectedCycles = selectedId ? cyclesByJob[selectedId] : null;
  const layoutGroupId = selectedId
    ? (layout.faenaGroup[selectedId] && layout.groups.some((g) => g.id === layout.faenaGroup[selectedId])
        ? layout.faenaGroup[selectedId]
        : UNGROUPED_ID)
    : null;
  const selectedGroupId = byState && selectedId
    ? JOB_STATE_GROUPS.find((s) => stateJobs[s.id].some((f) => f.id === selectedId))?.id || null
    : layoutGroupId;

  // Lo que muestra la tarjeta de una faena.
  const cardBodyProps = (f) => {
    const date = byState ? stateDates[f.id] : "";
    return {
      job: f,
      cardColor: colorOf(f),
      colorValue: layout.faenaColor[f.id] ?? null,
      onColorChange: (c) => setJobCardColor(f.id, c),
      subjobCount: subjobsByJob[f.id]?.length,
      cyclesCount: cyclesByJob[f.id]?.length,
      dragHint: !byState,
      since: date
        ? { icon: stateSort === "edited" ? "✎" : "🕒", label: sinceLabel(date, today), title: `${sortMeta?.label}: ${date.split("-").reverse().join("-")}` }
        : null,
      onEdit: () => setJobForm(withInitial({ mode: "edit", data: { ...f } })),
      onDelete: () => setConfirm({ kind: "job", item: f, message: `¿Eliminar la faena "${f.name}"?` }),
    };
  };

  const renderSelectedDetail = () =>
    selected && (
      <div ref={selectedDetailRef}>
      <SelectedDetail
        selected={selected}
        cardColor={colorOf(selected)}
        subjobs={selectedSubjobs}
        cycles={selectedCycles}
        onCreateSubjob={() => setSubjobForm(withInitial({ mode: "create", jobId: selected.id, data: { ...emptySubjob } }))}
        onEditSubjob={(s) => setSubjobForm(withInitial({ mode: "edit", jobId: selected.id, data: { ...s } }))}
        onDeleteSubjob={(s) => setConfirm({ kind: "subjob", item: s, message: `¿Eliminar la subfaena "${s.name}"?` })}
        onToggleHideSubjob={toggleHideSubjob}
        onCreateCycle={(subjobId) => openCreateCycle(selected.id, subjobId || "")}
        onEditCycle={(c) => openEditCycle(c, selected.id)}
        onOpenCloseFlow={(c) => openCloseFlow(c, selected.id)}
        onReopenCycle={async (c) => {
          await cyclesService.update(c.id, { status: "open", endDate: null });
          await loadCycles(selected.id);
        }}
        onDeleteCycle={(c) =>
          setConfirm({
            kind: "cycle",
            item: { ...c, faenaId: selected.id },
            message: `¿Eliminar el ciclo "${c.label}"?`,
          })
        }
        collapsedSubjobs={collapsedSubjobs}
        onToggleSubjobCollapse={toggleSubjobCollapse}
        onCollapseAllSubjobs={() => setCollapsedSubjobs(new Set((selectedSubjobs || []).map((s) => s.id)))}
        onExpandAllSubjobs={() => setCollapsedSubjobs(new Set())}
        showClosedInSubjob={showClosedInSubjob}
        onToggleShowClosed={toggleShowClosed}
      />
      </div>
    );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Faenas</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {viewMode === "state"
              ? "Agrupadas según sus ciclos: activas, pausadas y cerradas, de la más reciente a la más antigua."
              : "Arrastra las tarjetas para reordenarlas o moverlas entre grupos."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-sm" role="group" aria-label="Orden de las faenas">
            {[
              { v: "mine", l: "Mi orden", t: "Tus grupos, colores y orden" },
              { v: "state", l: "Por estado", t: "Activas, pausadas y cerradas, según sus ciclos" },
            ].map((o, i) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setViewMode(o.v)}
                title={o.t}
                className={`px-3 py-2 ${i > 0 ? "border-l border-[var(--color-border)]" : ""} ${
                  viewMode === o.v
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                    : "bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          {viewMode === "state" && (
            <select
              value={stateSort}
              onChange={(e) => setStateSort(e.target.value)}
              title={sortMeta?.hint}
              aria-label="Ordenar las faenas por"
              className="min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-sm"
            >
              {JOB_STATE_SORTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}
          {viewMode !== "state" && (
            <button
              onClick={() => setEditLayout((v) => !v)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                editLayout
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
              }`}
            >
              {editLayout ? "✓ Listo" : "⚙ Organizar"}
            </button>
          )}
          {organizing && (
            <button
              onClick={addGroup}
              className="rounded-md border border-dashed border-[var(--color-accent)] px-3 py-2 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            >
              + Grupo
            </button>
          )}
          <button
            onClick={() => setJobForm(withInitial({ mode: "create", data: { ...emptyJob } }))}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)]"
          >
            + Nueva faena
          </button>
        </div>
      </div>

      {loading ? (
        <ScreenLoader />
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-[var(--color-muted)]">
          No hay faenas. Crea la primera.
        </div>
      ) : (
        <div className="space-y-6">
          {viewGroups.map((g) => {
            const groupJobs = viewJobsByGroup[g.id] || [];
            // La sección "sin grupo" vacía solo se muestra al organizar, y un
            // estado sin faenas no se muestra.
            if (g.id === UNGROUPED_ID && groupJobs.length === 0 && !editLayout) return null;
            if (byState && groupJobs.length === 0) return null;
            const isDropTarget = dropOverGroupId === g.id;
            return (
              <section
                key={g.id}
                onDragOver={byState ? undefined : onGroupDragOver(g.id)}
                onDrop={byState ? undefined : onGroupDrop(g.id)}
                title={byState ? g.hint : undefined}
                onDragLeave={() => setDropOverGroupId(null)}
                className={`rounded-lg border-2 ${
                  isDropTarget ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30" : "border-transparent"
                } transition-colors`}
              >
                <GroupHeader
                  group={g}
                  count={groupJobs.length}
                  editable={organizing}
                  isUngrouped={byState || g.id === UNGROUPED_ID}
                  collapsed={isGroupCollapsed(g)}
                  onToggleCollapsed={() => toggleGroupCollapsed(g.id)}
                  onUpdate={(patch) => updateGroup(g.id, patch)}
                  onRemove={() => removeGroup(g.id)}
                />
                {isGroupCollapsed(g) ? null : groupJobs.length === 0 ? (
                  <div className={`rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted)] ${organizing ? "" : "hidden"}`}>
                    Arrastra una tarjeta aquí.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {groupJobs.map((f) => {
                      const isSelected = selectedId === f.id;
                      const cardColor = colorOf(f);
                      return (
                        <Fragment key={f.id}><div
                          draggable={!byState}
                          onDragStart={onDragStart(f.id)}
                          onDragOver={onDragOver(f.id)}
                          onDragLeave={onDragLeave}
                          onDrop={onDrop(f.id)}
                          onDragEnd={onDragEnd}
                          onClick={() => setSelectedId(isSelected ? null : f.id)}
                          data-dragging={dragId === f.id}
                          data-drop-over={dropOverId === f.id}
                          style={{
                            backgroundColor: "var(--color-surface)",
                            backgroundImage: cardColor ? `linear-gradient(135deg, ${cardColor}1A, transparent 60%)` : undefined,
                            "--card-hover-shadow": cardColor ? `0 4px 14px ${cardColor}33` : "0 4px 14px rgb(0 0 0 / 0.08)",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = e.currentTarget.style.getPropertyValue("--card-hover-shadow"); }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}
                          className={`dnd-card group relative cursor-pointer rounded-lg border pt-5 px-4 pb-4 shadow-sm transition-all hover:border-[var(--color-border-strong)] ${
                            isSelected
                              ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)]"
                              : "border-[var(--color-border)]"
                          }`}
                        >
                          <JobCardBody {...cardBodyProps(f)} />
                        </div>
                        {isMobile && isSelected && (
                          <div className="col-span-full">
                            {renderSelectedDetail()}
                          </div>
                        )}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
                {!isMobile && !isGroupCollapsed(g) && selectedGroupId === g.id && renderSelectedDetail()}
              </section>
            );
          })}
          {!isMobile && selected && !viewGroups.some((g) => g.id === selectedGroupId) && renderSelectedDetail()}
        </div>
      )}

      <JobFormModal
        busy={busy}
        jobForm={jobForm}
        setJobForm={setJobForm}
        submitJob={submitJob}
      />

      <SubjobFormModal
        busy={busy}
        setSubjobForm={setSubjobForm}
        subjobForm={subjobForm}
        submitSubjob={submitSubjob}
      />

      <CycleFormModal
        busy={busy}
        cycleForm={cycleForm}
        cyclePrefix={cyclePrefix}
        selectedSubjobs={selectedSubjobs}
        setCycleForm={setCycleForm}
        submitCycle={submitCycle}
      />

      <FirstCycleOfferModal openCreateCycle={openCreateCycle} setSubjobOfferCycle={setSubjobOfferCycle} subjobOfferCycle={subjobOfferCycle} />

      <CloseCycleModal
        busy={busy}
        closeFlow={closeFlow}
        confirmCloseCycle={confirmCloseCycle}
        createNextCycle={createNextCycle}
        setCloseFlow={setCloseFlow}
      />

      <ConfirmDialog
        open={!!confirm}
        title="Eliminar"
        confirmLabel="Eliminar"
        danger
        message={confirm?.message}
        busy={confirm?.busy}
        progress={deletionProgress}
        onCancel={() => !confirm?.busy && setConfirm(null)}
        onConfirm={doDelete}
      />

      <ConfirmDialog
        open={!!cascadeConfirm}
        title="Eliminar en cascada"
        confirmLabel="Eliminar todo"
        danger
        message={cascadeConfirm?.message || ""}
        onCancel={() => { cascadeConfirm?.resolve(false); setCascadeConfirm(null); }}
        onConfirm={() => { cascadeConfirm?.resolve(true); setCascadeConfirm(null); }}
      />
    </div>
  );
}
