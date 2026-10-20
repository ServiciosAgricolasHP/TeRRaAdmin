import { useState, useEffect, useRef, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { cyclesService } from "../services";
import { UNGROUPED_ID } from "../services/userPrefsService";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Modal, { ModalCloseButton } from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import TextField from "../components/TextField";
import Select from "../components/Select";
import { useIsMobile } from "../hooks/useIsMobile";
import { LABOR_TYPES } from "../utils/laborTypes";
import { hasChanges } from "../utils/formChanges";
import { ColorPickerButton } from "./jobs/ColorPickerButton";
import { GroupHeader } from "./jobs/GroupHeader";
import { ImportSection } from "./jobs/ImportSection";
import { SelectedDetail } from "./jobs/SelectedDetail";
import { withInitial } from "./jobs/helpers";
import { useJobsData } from "./jobs/useJobsData";
import { useJobLayout } from "./jobs/useJobLayout";
import { useSubjobDisplay } from "./jobs/useSubjobDisplay";
import { useJobForms } from "./jobs/useJobForms";
import { useCycleForm } from "./jobs/useCycleForm";
import { useCloseCycleFlow } from "./jobs/useCloseCycleFlow";
import { useJobDeletion } from "./jobs/useJobDeletion";

// En el alta de un ciclo, lo que se ofrece para importar no es un dato del
// formulario.
const CYCLE_FORM_IGNORE = ["importCandidates", "labors", "days"];

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
        onDeleteSubjob={(s) => setConfirm({ kind: "sub", item: s, message: `¿Eliminar la subfaena "${s.name}"?` })}
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
        <div className="text-[var(--color-muted)]">Cargando...</div>
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
                                onClick={() => setConfirm({ kind: "faena", item: f, message: `¿Eliminar la faena "${f.name}"?` })}
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

      {/* Modal de faena */}
      <Modal
        open={!!jobForm}
        onClose={() => !busy && setJobForm(null)}
        dirty={!!jobForm && !busy && hasChanges(jobForm.initial, jobForm.data)}
        title={jobForm?.mode === "edit" ? "Editar faena" : "Nueva faena"}
      >
        {jobForm && (
          <form onSubmit={submitJob} className="space-y-4">
            <TextField
              label="Nombre"
              required
              autoFocus
              value={jobForm.data.name}
              onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, name: v } }))}
            />
            <TextField
              label="Ubicación"
              value={jobForm.data.location}
              onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, location: v } }))}
            />
            <TextField
              label="Notas"
              value={jobForm.data.notes}
              onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, notes: v } }))}
            />
            <div className="flex justify-end gap-2 pt-2">
              <ModalCloseButton
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </ModalCloseButton>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de subfaena */}
      <Modal
        open={!!subjobForm}
        onClose={() => !busy && setSubjobForm(null)}
        dirty={!!subjobForm && !busy && hasChanges(subjobForm.initial, subjobForm.data)}
        title={subjobForm?.mode === "edit" ? "Editar subfaena" : "Nueva subfaena"}
      >
        {subjobForm && (
          <form onSubmit={submitSubjob} className="space-y-4">
            <TextField
              label="Nombre"
              required
              autoFocus
              value={subjobForm.data.name}
              onChange={(v) => setSubjobForm((s) => ({ ...s, data: { ...s.data, name: v } }))}
            />
            <TextField
              label="Notas"
              value={subjobForm.data.notes}
              onChange={(v) => setSubjobForm((s) => ({ ...s, data: { ...s.data, notes: v } }))}
            />
            <div className="flex justify-end gap-2 pt-2">
              <ModalCloseButton
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </ModalCloseButton>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de ciclo */}
      <Modal
        open={!!cycleForm}
        onClose={() => !busy && setCycleForm(null)}
        dirty={!!cycleForm && !busy && hasChanges(cycleForm.initial, cycleForm.data, { ignore: CYCLE_FORM_IGNORE })}
        title={cycleForm?.mode === "edit" ? "Editar ciclo" : "Nuevo ciclo"}
      >
        {cycleForm && (
          <form onSubmit={submitCycle} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-muted)]">
                Etiqueta<span className="ml-0.5 text-[var(--color-danger)]">*</span>
              </span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <span className="flex items-center bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] border-r border-[var(--color-border)]">
                  {cyclePrefix(cycleForm.jobId, cycleForm.data.subfaenaId) || "—"}
                </span>
                <input
                  required
                  autoFocus
                  value={cycleForm.data.labelSuffix ?? ""}
                  onChange={(e) => setCycleForm((c) => ({ ...c, data: { ...c.data, labelSuffix: e.target.value } }))}
                  placeholder="Ciclo 1"
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <span className="mt-1 block text-[10px] text-[var(--color-muted)]">
                El prefijo Faena/Subfaena/ es fijo
              </span>
            </label>
            {selectedSubjobs && selectedSubjobs.length > 0 && (
              <Select
                label="Subfaena"
                required
                value={cycleForm.data.subfaenaId || ""}
                onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, subfaenaId: v } }))}
                options={selectedSubjobs.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Selecciona la subfaena"
              />
            )}
            <TextField
              label="Fecha inicio"
              type="date"
              value={cycleForm.data.startDate}
              onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, startDate: v } }))}
            />
            <TextField
              label="Notas"
              value={cycleForm.data.notes}
              onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, notes: v } }))}
            />
            {cycleForm.mode === "create" && !cycleForm.data.importEnabled && (
              <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <Select
                  label="Primera labor"
                  value={cycleForm.data.laborType || "main"}
                  onChange={(v) => setCycleForm((c) => ({ ...c, data: { ...c.data, laborType: v } }))}
                  options={LABOR_TYPES}
                />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!cycleForm.data.withSupervision}
                    onChange={(e) =>
                      setCycleForm((c) => ({ ...c, data: { ...c.data, withSupervision: e.target.checked } }))
                    }
                    disabled={cycleForm.data.laborType === "supervision"}
                    className="mt-0.5"
                  />
                  <span className={cycleForm.data.laborType === "supervision" ? "text-[var(--color-muted)]" : ""}>
                    Agregar también una labor de Supervisión
                    {cycleForm.data.laborType === "supervision" ? " (ya es la primera)" : ""}
                  </span>
                </label>
              </div>
            )}
            {cycleForm.mode === "create" && (cycleForm.data.importCandidates || []).length > 0 && (
              <ImportSection
                data={cycleForm.data}
                onChange={(patch) =>
                  setCycleForm((c) => ({ ...c, data: { ...c.data, ...patch } }))
                }
              />
            )}
            <p className="text-xs text-[var(--color-muted)]">
              {cycleForm.mode === "create" && cycleForm.data.importEnabled
                ? "Se clonarán las labores marcadas. Si activaste 'Mover jornadas', se transferirán al nuevo ciclo y desaparecerán del origen."
                : cycleForm.mode === "create"
                  ? `El ciclo arranca con la fecha de inicio como primer día y ${
                      cycleForm.data.withSupervision && cycleForm.data.laborType !== "supervision" ? "dos labores" : "una labor"
                    }. Podrás agregar más al abrirlo.`
                  : "Podrás agregar más labores al abrir el ciclo."}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <ModalCloseButton
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </ModalCloseButton>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Recién creada una subfaena, se ofrece abrirle el primer ciclo. */}
      <Modal
        open={!!subjobOfferCycle}
        onClose={() => setSubjobOfferCycle(null)}
        title="¿Crear el primer ciclo?"
        footer={
          <>
            <button
              onClick={() => setSubjobOfferCycle(null)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
            >
              Después
            </button>
            <button
              onClick={() => {
                const { jobId, subjobId } = subjobOfferCycle;
                setSubjobOfferCycle(null);
                openCreateCycle(jobId, subjobId);
              }}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
            >
              Crear ciclo
            </button>
          </>
        }
      >
        <p className="text-sm">
          La subfaena <strong>{subjobOfferCycle?.name}</strong> ya está creada. Las jornadas se cargan
          dentro de un ciclo, así que sin uno todavía no hay dónde anotar nada.
        </p>
      </Modal>

      {/* Cierre de ciclo */}
      <Modal
        open={!!closeFlow}
        onClose={() => !busy && setCloseFlow(null)}
        title={closeFlow?.askNext ? "¿Crear nuevo ciclo?" : "Cerrar ciclo"}
        footer={
          closeFlow?.askNext ? (
            <>
              <button
                onClick={() => setCloseFlow(null)}
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                No, gracias
              </button>
              <button
                onClick={() => createNextCycle(closeFlow.copyWorkers)}
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Crear ciclo"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCloseFlow(null)}
                disabled={busy}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmCloseCycle}
                disabled={busy}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? "..." : "Cerrar ciclo"}
              </button>
            </>
          )
        }
      >
        {closeFlow && !closeFlow.askNext && (
          <p className="text-sm text-[var(--color-muted)]">
            Vas a cerrar <span className="text-[var(--color-text)]">{closeFlow.cycle.label}</span>.
          </p>
        )}
        {closeFlow?.askNext && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              El ciclo fue cerrado. ¿Crear uno nuevo a continuación?
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={closeFlow.copyWorkers}
                onChange={(e) => setCloseFlow((s) => ({ ...s, copyWorkers: e.target.checked }))}
              />
              Copiar trabajadores de cada labor del ciclo anterior
            </label>
          </div>
        )}
      </Modal>

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
