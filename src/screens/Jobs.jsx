import { useState, useEffect, useRef, Fragment, useEffectEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { cyclesService } from "../services";
import { UNGROUPED_ID } from "../services/userPrefsService";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { JobCardBody } from "./jobs/JobCardBody";
import { GroupHeader } from "./jobs/GroupHeader";
import { SelectedDetail } from "./jobs/SelectedDetail";
import { useJobPanel } from "./jobs/useJobPanel";
import { rowEndIndex } from "../utils/gridRows";
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

  // El detalle de la faena elegida se abre bajo la fila de su tarjeta, unido
  // a ella, y se pliega con su contenido (`useJobPanel`).
  const { closing: panelClosing, columns, panelId } = useJobPanel(selectedId);

  // Al abrir una faena, la vista se desplaza solo si el panel quedó fuera de
  // ella, lo justo para que la tarjeta quede arriba. Espera un frame para que
  // React lo dibuje antes de medir.
  const selectedDetailRef = useRef(null);
  useEffect(() => {
    if (!selectedId) return undefined;
    const id = window.requestAnimationFrame(() => {
      const panel = selectedDetailRef.current;
      const card = document.querySelector(`[data-job-card="${selectedId}"]`);
      if (!panel || !card) return;
      const panelTop = panel.getBoundingClientRect().top;
      const cardTop = card.getBoundingClientRect().top;
      if (panelTop > window.innerHeight - 160 || cardTop < 0) card.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // El panel muestra `panelId`: la faena elegida o, mientras se pliega, la
  // anterior.
  const selected = jobs.find((f) => f.id === panelId);
  const selectedSubjobs = panelId ? subjobsByJob[panelId] : null;
  const selectedCycles = panelId ? cyclesByJob[panelId] : null;
  // Si la tarjeta del panel no está a la vista (su grupo está plegado), el
  // detalle va suelto al final.
  const panelPlaced = !!panelId && viewGroups.some((g) => !isGroupCollapsed(g) && (viewJobsByGroup[g.id] || []).some((f) => f.id === panelId));

  // Lo que muestra la tarjeta de una faena, en la grilla y en el encabezado de
  // su detalle.
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
        key={selected.id}
        header={<JobCardBody {...cardBodyProps(selected)} dragHint={false} asTitle />}
        onClose={() => setSelectedId(null)}
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
                    {groupJobs.map((f, idx) => {
                      const isSelected = selectedId === f.id;
                      const cardColor = colorOf(f);
                      // El panel va después de la última tarjeta de la fila de
                      // la faena abierta.
                      const panelIdx = groupJobs.findIndex((j) => j.id === panelId);
                      const panelHere = panelIdx >= 0 && rowEndIndex(panelIdx, groupJobs.length, columns) === idx;
                      const dimmed = !!selectedId && !isSelected;
                      return (
                        <Fragment key={f.id}><div
                          data-job-card={f.id}
                          draggable={!byState}
                          onDragStart={onDragStart(f.id)}
                          onDragOver={onDragOver(f.id)}
                          onDragLeave={onDragLeave}
                          onDrop={onDrop(f.id)}
                          onDragEnd={onDragEnd}
                          onClick={() => setSelectedId(isSelected ? null : f.id)}
                          data-dragging={dragId === f.id}
                          data-drop-over={dropOverId === f.id}
                          style={isSelected ? undefined : {
                            backgroundColor: "var(--color-surface)",
                            backgroundImage: cardColor ? `linear-gradient(135deg, ${cardColor}1A, transparent 60%)` : undefined,
                            "--card-hover-shadow": cardColor ? `0 4px 14px ${cardColor}33` : "0 4px 14px rgb(0 0 0 / 0.08)",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = e.currentTarget.style.getPropertyValue("--card-hover-shadow"); }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}
                          className={`dnd-card group relative scroll-mt-4 cursor-pointer rounded-lg border pt-5 px-4 pb-4 transition-all duration-200 ${
                            isSelected
                              ? "border-dashed border-[var(--color-accent)]"
                              : `border-[var(--color-border)] shadow-sm hover:border-[var(--color-border-strong)] ${dimmed ? "opacity-60 hover:opacity-100" : ""}`
                          }`}
                        >
                          {/* Abierta, la tarjeta pasa a ser el encabezado de su
                              detalle: aquí queda su hueco, del mismo alto. */}
                          <div className={isSelected ? "invisible" : undefined}>
                            <JobCardBody {...cardBodyProps(f)} />
                          </div>
                          {isSelected && (
                            <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[var(--color-accent)]">
                              ▾ abierta
                            </span>
                          )}
                        </div>
                        {panelHere && (
                          <div
                            className={`col-span-full grid transition-[grid-template-rows,opacity] duration-200 ease-out starting:grid-rows-[0fr] starting:opacity-0 ${
                              panelClosing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                            }`}
                          >
                            {/* El margen deja lugar a la sombra del panel, que el
                                recorte del despliegue cortaría. */}
                            <div className="-mx-3 -mb-6 min-h-0 overflow-hidden px-3 pb-6">
                              {renderSelectedDetail()}
                            </div>
                          </div>
                        )}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {selected && !panelPlaced && <div className="mt-6">{renderSelectedDetail()}</div>}
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
