import { useState, useMemo } from "react";
import {
  payrollSnapshotsService,
} from "../services";
import {
  payrollsService,
  pendingCashItemsOf,
  markPaid as markPayrollPaid,
  markPending as markPayrollPending,
} from "../services/payrollsService";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { activeCyclesByJob } from "../utils/payrollCycles";
import ConfirmDialog from "../components/ConfirmDialog";
import CloseCyclesModal from "./payroll/CloseCyclesModal";
import { payrollStatusMap, splitTaken } from "../utils/cycleClosing";
import { currentRutResolver } from "../utils/workerRut";
import { AddWorkerDaysModal } from "./payroll/AddWorkerDaysModal";
import { CycleSelector } from "./payroll/CycleSelector";
import { HistoryList } from "./payroll/HistoryList";
import { InstallmentConfirmModal } from "./payroll/InstallmentConfirmModal";
import { PayConfirmModal } from "./payroll/PayConfirmModal";
import { PayrollDetailModal } from "./payroll/PayrollDetailModal";
import { PayrollHeader } from "./payroll/PayrollHeader";
import { PayrollSettingsModal } from "./payroll/PayrollSettingsModal";
import { PreviewTable } from "./payroll/PreviewTable";
import { ProgressOverlay } from "./payroll/ProgressOverlay";
import { PublishPortalDialog } from "./payroll/PublishPortalDialog";
import { RenamePayrollModal } from "./payroll/RenamePayrollModal";
import { WorkersHistory } from "./payroll/WorkersHistory";
import { usePayrollConfig } from "./payroll/usePayrollConfig";
import { usePayrollDownloads } from "./payroll/usePayrollDownloads";
import { usePayrollData } from "./payroll/usePayrollData";
import { usePortalPublish } from "./payroll/usePortalPublish";
import { useCycleSelection } from "./payroll/useCycleSelection";
import { usePayrollPreview } from "./payroll/usePayrollPreview";
import { useGeneratePayroll } from "./payroll/useGeneratePayroll";
import { useClosableCycles } from "./payroll/useClosableCycles";
import { usePayConfirm } from "./payroll/usePayConfirm";
import { usePayrollDeletion } from "./payroll/usePayrollDeletion";

export default function Payroll() {
  "use no memo";
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const { config: payrollConfig, bankFormat, currentBankFormat, save: savePayrollConfig } = usePayrollConfig();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState("create"); // create | history | workers
  const {
    cycles,
    cycleStats,
    faenas,
    load,
    loading,
    payrolls,
    refresh,
    refreshing,
    subfaenas,
    workers,
  } = usePayrollData({ toast });
  // Rut vigente para mostrar, ver utils/workerRut.js.
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);

  const {
    chosenCycles,
    people,
    personModal,
    removePerson,
    resetSelection,
    savePerson,
    selectedCycleIds,
    selectedLaborsByCycle,
    setPersonModal,
    toggleCycle,
    toggleLaborInCycle,
  } = useCycleSelection({ cycles });
  const {
    bankSelected,
    buildPreview,
    bulkUpdate,
    busy,
    cashGroups,
    countSelected,
    payrollClassification,
    payrollName,
    previewAdvancesRef,
    previewCycles,
    previewItems,
    previewWorkdaysRef,
    resetPreview,
    setBusy,
    setPayrollClassification,
    setPayrollName,
    setStep,
    step,
    totalSelected,
    updatePreview,
  } = usePayrollPreview({
    chosenCycles,
    cycles,
    faenas,
    people,
    subfaenas,
    toast,
    workers,
  });
  // Overlay de progreso: `step` es el mensaje principal (ej. "Etiquetando
  // jornadas"), `detail` un complemento opcional (ej. "340 / 500") y `percent`
  // va de 0 a 100. `null` oculta el overlay.
  const [progress, setProgress] = useState(null);

  const [detailPayroll, setDetailPayroll] = useState(null);
  // Nómina que se está renombrando, o null. El nombre es solo una etiqueta y se
  // cambia en cualquier estado; renombrar actualiza el doc y el snapshot
  // embebido, así la re-descarga del JSON trae el nombre nuevo.
  const [renaming, setRenaming] = useState(null);

  const {
    portal,
    publishBusy,
    publishing,
    runPublish,
    setPublishing,
  } = usePortalPublish({ toast, user });

  // Nóminas con las transferencias pagadas y el efectivo todavía adeudado.
  // Sale de `payrolls`, ya cargado (sin lecturas extra). Es informativo: no se
  // anexa a la nómina nueva.
  const pendingCashPayrolls = useMemo(() => {
    const out = [];
    for (const p of payrolls) {
      const items = pendingCashItemsOf(p);
      if (items.length === 0) continue;
      out.push({
        id: p.id,
        name: p.name || p.id,
        count: items.length,
        amount: items.reduce((s, it) => s + (Number(it.amount) || 0), 0),
      });
    }
    return out;
  }, [payrolls]);

  // Ciclos activos agrupados por faena.
  const activeByFaena = useMemo(() => activeCyclesByJob(faenas, cycles), [faenas, cycles]);

  const subfaenaName = (id) => subfaenas.find((s) => s.id === id)?.name || "";

  const { closable, closeCandidates, closeCycles, setCloseCycles } = useClosableCycles({ cycles, cycleStats, payrolls });
  // Por ciclo, lo pagado de verdad y lo que está en una nómina sin pagar.
  const takenSplit = useMemo(() => {
    const statusOf = payrollStatusMap(payrolls);
    return Object.fromEntries(Object.entries(cycleStats).map(([id, s]) => [id, splitTaken(s, statusOf)]));
  }, [cycleStats, payrolls]);
  const payrollNameOf = (id) => payrolls.find((p) => p.id === id)?.name || "";

  const {
    confirmState,
    generateAndSave,
    installmentConfirmState,
    setConfirmState,
    setInstallmentConfirmState,
  } = useGeneratePayroll({
    bankFormat,
    chosenCycles,
    cycles,
    faenas,
    load,
    payrollClassification,
    payrollName,
    previewAdvancesRef,
    previewItems,
    previewWorkdaysRef,
    resetPreview,
    resetSelection,
    setBusy,
    setProgress,
    setTab,
    subfaenas,
    toast,
  });

  const onMarkPaid = async (p) => {
    await markPayrollPaid(p.id, p.workdayIds || []);
    await load();
  };
  const onMarkPending = async (p) => {
    await markPayrollPending(p.id, p.workdayIds || []);
    await load();
  };
  const onChangeClassification = async (p) => {
    const current = p.classification || "nomina";
    const next = current === "diferencia" ? "nomina" : "diferencia";
    await payrollsService.update(p.id, { classification: next });
    await load();
  };
  const onConfirmRename = async (newName) => {
    if (!renaming) return;
    const name = (newName || "").trim();
    if (!name || name === renaming.name) { setRenaming(null); return; }
    await payrollsService.update(renaming.id, { name });
    // Renombra también el snapshot (para re-descargas); si la nómina no tiene,
    // el error se ignora.
    try { await payrollSnapshotsService.update(renaming.id, { name }); } catch { /* snapshot inexistente */ }
    setRenaming(null);
    await load();
    toast.success("Nómina renombrada");
  };
  const {
    onAskMarkBankPaid,
    onAskMarkPaid,
    onAskRevert,
    onAskRevertBank,
    onConfirmPay,
    payConfirm,
    setPayConfirm,
  } = usePayConfirm({ load, setCloseCycles, setProgress, toast });
  const { confirmDelete, onDelete, setConfirmDelete } = usePayrollDeletion({ load, setProgress, toast });
  const { onDownloadNominaOnly, onDownloadSnapshot, onRedownload } = usePayrollDownloads({ currentBankFormat, cycles, rutOf, toast });

  return (
    <div className="flex h-full flex-col">
      <PayrollHeader
        bankFormatLabel={bankFormat.label}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={refresh}
        refreshing={refreshing}
        loading={loading}
        tab={tab}
        setTab={setTab}
        payrollCount={payrolls.length}
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[var(--color-muted)]">Cargando...</div>
      ) : tab === "create" ? (
        step === 1 ? (
          <CycleSelector
            groups={activeByFaena}
            selected={selectedCycleIds}
            toggle={toggleCycle}
            selectedLaborsByCycle={selectedLaborsByCycle}
            toggleLaborInCycle={toggleLaborInCycle}
            subfaenaName={subfaenaName}
            cycleStats={cycleStats}
            pendingCashPayrolls={pendingCashPayrolls}
            chosen={chosenCycles}
            people={people}
            onAddPerson={() => setPersonModal({})}
            onEditPerson={(worker) => setPersonModal({ worker })}
            onRemovePerson={removePerson}
            onNext={buildPreview}
            busy={busy}
            takenSplit={takenSplit}
            payrollNameOf={payrollNameOf}
            closableCount={closable.settled.length}
            onClosePaid={() => setCloseCycles({ ids: null, payrollName: "" })}
          />
        ) : (
          <PreviewTable
            rutOf={rutOf}
            items={previewItems}
            bankItems={bankSelected}
            cashGroups={cashGroups}
            updatePreview={updatePreview}
            bulkUpdate={bulkUpdate}
            payrollName={payrollName}
            setPayrollName={setPayrollName}
            payrollClassification={payrollClassification}
            setPayrollClassification={setPayrollClassification}
            totalSelected={totalSelected}
            countSelected={countSelected}
            cycleOptions={previewCycles}
            onBack={() => setStep(1)}
            onGenerate={generateAndSave}
            busy={busy}
          />
        )
      ) : tab === "history" ? (
        <HistoryList
          payrolls={payrolls}
          onMarkPaid={onAskMarkPaid}
          onMarkPending={onAskRevert}
          onMarkBankPaid={onAskMarkBankPaid}
          onRevertBank={onAskRevertBank}
          onAskDelete={setConfirmDelete}
          onRedownload={onRedownload}
          onDownloadNominaOnly={onDownloadNominaOnly}
          onDownloadSnapshot={onDownloadSnapshot}
          onChangeClassification={onChangeClassification}
          onOpen={setDetailPayroll}
          onRename={setRenaming}
          publishedPayrollId={portal?.payrollId || null}
        />
      ) : (
        <WorkersHistory
          faenas={faenas}
          workers={workers}
        />
      )}

      {closeCycles && closeCandidates.length > 0 && (
        <CloseCyclesModal
          candidates={closeCandidates}
          waitingCount={closeCycles.ids ? 0 : closable.waiting.length}
          intro={
            closeCycles.ids
              ? `Con "${closeCycles.payrollName}" pagada, estos ciclos quedaron pagados por completo: no les queda nada pendiente. ¿Los cierras?`
              : "Estos ciclos abiertos ya se pagaron por completo: no les queda nada pendiente y lo que entró a nómina está pagado."
          }
          faenaName={(id) => faenas.find((f) => f.id === id)?.name || ""}
          onClose={() => setCloseCycles(null)}
          onDone={async () => {
            setCloseCycles(null);
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar nómina"
        message={confirmDelete ? `¿Eliminar la nómina "${confirmDelete.name}"? Esta acción no se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={onDelete}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || "Confirmar"}
        message={confirmState?.message || ""}
        confirmLabel={confirmState?.confirmLabel || "Generar de todos modos"}
        danger={confirmState?.danger}
        onCancel={() => {
          confirmState?.resolve(false);
          setConfirmState(null);
        }}
        onConfirm={() => {
          confirmState?.resolve(true);
          setConfirmState(null);
        }}
      />

      <InstallmentConfirmModal
        state={installmentConfirmState}
        onCancel={() => {
          installmentConfirmState?.resolve(null);
          setInstallmentConfirmState(null);
        }}
        onConfirm={(excludedIds) => {
          installmentConfirmState?.resolve(excludedIds);
        }}
      />

      {renaming && (
        <RenamePayrollModal
          payroll={renaming}
          onCancel={() => setRenaming(null)}
          onConfirm={onConfirmRename}
        />
      )}

      <PayConfirmModal
        info={payConfirm}
        onCancel={() => setPayConfirm(null)}
        onConfirm={onConfirmPay}
      />

      {personModal && (
        <AddWorkerDaysModal
          onClose={() => setPersonModal(null)}
          workers={workers}
          cycles={cycles}
          allPayrolls={payrolls}
          chosen={chosenCycles}
          previous={new Map(people.map((p) => [p.worker.id, p.rowKeys]))}
          initialWorker={personModal.worker || null}
          onConfirm={savePerson}
        />
      )}

      {detailPayroll && (
        <PayrollDetailModal
          payroll={detailPayroll}
          allPayrolls={payrolls}
          cycles={cycles}
          faenas={faenas}
          subfaenas={subfaenas}
          workers={workers}
          onClose={() => setDetailPayroll(null)}
          onRedownload={onRedownload}
          onDownloadNominaOnly={onDownloadNominaOnly}
          onDownloadSnapshot={onDownloadSnapshot}
          bankFormatLabel={bankFormat.label}
          onPublishPortal={isAdmin ? setPublishing : null}
          publishedPayrollId={portal?.payrollId || null}
          onChanged={async () => {
            // Relee la nómina para refrescar el modal y después recarga la lista.
            try {
              const fresh = await payrollsService.getById(detailPayroll.id);
              if (fresh) setDetailPayroll(fresh);
              else setDetailPayroll(null);
            } catch (err) {
              console.warn("No se pudo refrescar nómina:", err);
            }
            await load();
          }}
        />
      )}

      <PublishPortalDialog
        publishing={publishing}
        portal={portal}
        busy={publishBusy}
        onConfirm={runPublish}
        onCancel={() => setPublishing(null)}
      />

      {settingsOpen && (
        <PayrollSettingsModal config={payrollConfig} isAdmin={isAdmin} onSave={savePayrollConfig} onClose={() => setSettingsOpen(false)} />
      )}

      <ProgressOverlay info={progress} />
    </div>
  );
}
