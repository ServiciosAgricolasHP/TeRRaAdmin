import { useState, useEffect, useRef, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { cyclesService } from "../services";
import { UNGROUPED_ID } from "../services/userPrefsService";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { useIsMobile } from "../hooks/useIsMobile";
import { ColorPickerButton } from "./jobs/ColorPickerButton";
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

const emptyJob = { name: "", location: "", notes: "" };

const emptySubjob = { name: "", notes: "" };

export default function Jobs() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedId, setSelectedId] = useState(() => searchParams.get("selected"));

  // Sincroniza selectedId con el parámetro `selected` de la URL (enlaces del breadcrumb de CycleDetail).
  useEffect(() => {
    const fromUrl = searchParams.get("selected");
    if (fromUrl && fromUrl !== selectedId) setSelectedId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (selectedId) {
      if (searchParams.get("selected") !== selectedId) {
        setSearchParams({ selected: selectedId }, { replace: true });
      }
    } else if (searchParams.get("selected")) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const selectedGroupId = selectedId
    ? (layout.faenaGroup[selectedId] && layout.groups.some((g) => g.id === layout.faenaGroup[selectedId])
        ? layout.faenaGroup[selectedId]
        : UNGROUPED_ID)
    : null;

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
            Arrastra las tarjetas para reordenarlas o moverlas entre grupos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {editLayout && (
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
          {layout.groups.map((g) => {
            const groupJobs = jobsByGroup[g.id] || [];
            // La sección "sin grupo" vacía solo se muestra al organizar.
            if (g.id === UNGROUPED_ID && groupJobs.length === 0 && !editLayout) return null;
            const isDropTarget = dropOverGroupId === g.id;
            return (
              <section
                key={g.id}
                onDragOver={onGroupDragOver(g.id)}
                onDrop={onGroupDrop(g.id)}
                onDragLeave={() => setDropOverGroupId(null)}
                className={`rounded-lg border-2 ${
                  isDropTarget ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]/30" : "border-transparent"
                } transition-colors`}
              >
                <GroupHeader
                  group={g}
                  count={groupJobs.length}
                  editable={editLayout}
                  isUngrouped={g.id === UNGROUPED_ID}
                  collapsed={collapsedGroups.has(g.id)}
                  onToggleCollapsed={() => toggleGroupCollapsed(g.id)}
                  onUpdate={(patch) => updateGroup(g.id, patch)}
                  onRemove={() => removeGroup(g.id)}
                />
                {collapsedGroups.has(g.id) ? null : groupJobs.length === 0 ? (
                  <div className={`rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted)] ${editLayout ? "" : "hidden"}`}>
                    Arrastra una tarjeta aquí.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {groupJobs.map((f) => {
                      const subjobCount = subjobsByJob[f.id]?.length;
                      const cyclesCount = cyclesByJob[f.id]?.length;
                      const isSelected = selectedId === f.id;
                      const cardColor = colorOf(f);
                      return (
                        <Fragment key={f.id}><div
                          draggable
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
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-lg"
                            style={{ backgroundColor: cardColor || "var(--color-border)" }}
                          />
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="mt-1 select-none text-[10px] leading-none text-[var(--color-muted)] opacity-30 group-hover:opacity-90 transition-opacity" title="Arrastra para reordenar">⠿</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    aria-hidden
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: cyclesCount > 0 ? "#16a34a" : "var(--color-muted)" }}
                                    title={cyclesCount > 0 ? "Activa" : "Sin ciclos"}
                                  />
                                  <span className="truncate text-[15px] font-semibold leading-tight text-[var(--color-text)]">{f.name}</span>
                                </div>
                                {f.location && <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">{f.location}</div>}
                              </div>
                            </div>
                            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                              <ColorPickerButton
                                value={layout.faenaColor[f.id] ?? null}
                                onChange={(c) => setJobCardColor(f.id, c)}
                              />
                            </div>
                          </div>
                          {f.notes && <p className="mb-3 line-clamp-2 text-[11px] leading-snug text-[var(--color-muted)]">{f.notes}</p>}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 text-xs">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">
                                {subjobCount != null ? `${subjobCount} sub` : "—"}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={
                                  cardColor && cyclesCount > 0
                                    ? { backgroundColor: `${cardColor}22`, color: cardColor }
                                    : cyclesCount > 0
                                      ? { backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }
                                      : { backgroundColor: "var(--color-surface-2)", color: "var(--color-muted)" }
                                }
                              >
                                {cyclesCount != null ? `${cyclesCount} ciclos` : "—"}
                              </span>
                            </div>
                            <div className="ml-auto flex shrink-0 gap-1 opacity-70 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setJobForm(withInitial({ mode: "edit", data: { ...f } }))}
                                className="rounded-md px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => setConfirm({ kind: "job", item: f, message: `¿Eliminar la faena "${f.name}"?` })}
                                className="rounded-md px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
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
                {!isMobile && !collapsedGroups.has(g.id) && selectedGroupId === g.id && renderSelectedDetail()}
              </section>
            );
          })}
          {!isMobile && selected && !layout.groups.some((g) => g.id === selectedGroupId) && renderSelectedDetail()}
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
