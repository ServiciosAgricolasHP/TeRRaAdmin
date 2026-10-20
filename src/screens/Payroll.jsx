import { useState, useMemo } from "react";
import {
  payrollSnapshotsService,
} from "../services";
import {
  payrollsService,
  pendingCashItemsOf,
  markPaid as markPayrollPaid,
  markPending as markPayrollPending,
  markBankPaid,
  revertBankPaid,
  untagWorkdaysFromPayroll,
} from "../services/payrollsService";
import {
  restoreAdvancesFromPayroll,
} from "../services/advancesService";
import {
  deleteSnapshot,
} from "../services/payrollSnapshots";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { activeCyclesByJob } from "../utils/payrollCycles";
import ConfirmDialog from "../components/ConfirmDialog";
import CloseCyclesModal from "./payroll/CloseCyclesModal";
import { settledOpenCycles, payrollStatusMap, splitTaken } from "../utils/cycleClosing";
import { currentRutResolver } from "../utils/workerRut";
import { AddWorkerDaysModal } from "./payroll/AddWorkerDaysModal";
import { CycleSelector } from "./payroll/CycleSelector";
import { HistoryList } from "./payroll/HistoryList";
import { InstallmentConfirmModal } from "./payroll/InstallmentConfirmModal";
import { PayConfirmModal } from "./payroll/PayConfirmModal";
import { PayrollDetailModal } from "./payroll/PayrollDetailModal";
import { PayrollSettingsModal } from "./payroll/PayrollSettingsModal";
import { PreviewTable } from "./payroll/PreviewTable";
import { ProgressOverlay } from "./payroll/ProgressOverlay";
import { RenamePayrollModal } from "./payroll/RenamePayrollModal";
import { WorkersHistory } from "./payroll/WorkersHistory";
import { usePayrollConfig } from "./payroll/usePayrollConfig";
import { usePayrollDownloads } from "./payroll/usePayrollDownloads";
import { usePayrollData } from "./payroll/usePayrollData";
import { usePortalPublish } from "./payroll/usePortalPublish";
import { useCycleSelection } from "./payroll/useCycleSelection";
import { usePayrollPreview } from "./payroll/usePayrollPreview";
import { useGeneratePayroll } from "./payroll/useGeneratePayroll";

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

  const [confirmDelete, setConfirmDelete] = useState(null);
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

  // Ciclos abiertos ya pagados por completo, para cerrarlos de una vez desde
  // Generar o justo después de marcar una nómina pagada. `closeCycles.ids`
  // acota la lista a los ciclos de esa nómina.
  const closable = useMemo(() => settledOpenCycles(cycles, cycleStats, payrolls), [cycles, cycleStats, payrolls]);
  // Por ciclo, lo pagado de verdad y lo que está en una nómina sin pagar.
  const takenSplit = useMemo(() => {
    const statusOf = payrollStatusMap(payrolls);
    return Object.fromEntries(Object.entries(cycleStats).map(([id, s]) => [id, splitTaken(s, statusOf)]));
  }, [cycleStats, payrolls]);
  const payrollNameOf = (id) => payrolls.find((p) => p.id === id)?.name || "";
  const [closeCycles, setCloseCycles] = useState(null); // { ids: Set | null, payrollName }
  const closeCandidates = closeCycles
    ? closable.settled.filter((r) => !closeCycles.ids || closeCycles.ids.has(r.cycle.id))
    : [];

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
  // mode: "pay" | "revert" | "bank" | "revertBank". Los dos últimos son el
  // pago en dos tiempos: salen las transferencias pero el efectivo queda
  // debiéndose.
  const [payConfirm, setPayConfirm] = useState(null); // { payroll, mode }
  const onAskMarkPaid = (p) => setPayConfirm({ payroll: p, mode: "pay" });
  const onAskRevert = (p) => setPayConfirm({ payroll: p, mode: "revert" });
  const onAskMarkBankPaid = (p) => setPayConfirm({ payroll: p, mode: "bank" });
  const onAskRevertBank = (p) => setPayConfirm({ payroll: p, mode: "revertBank" });
  const PAY_DONE = {
    pay: "Nómina marcada como pagada",
    revert: "Nómina vuelta a pendiente",
    bank: "Transferencias marcadas como pagadas — el efectivo queda debiéndose",
    revertBank: "Transferencias revertidas",
  };
  const onConfirmPay = async () => {
    if (!payConfirm) return;
    const { payroll: p, mode } = payConfirm;
    const paso = (step) => (done, total) =>
      setProgress({
        step,
        detail: total ? `${done} de ${total} jornadas` : "",
        percent: total ? (done / total) * 90 : 0,
      });
    setProgress({ step: "Sellando jornadas...", detail: "", percent: 2 });
    try {
      if (mode === "pay") {
        await markPayrollPaid(p.id, p.workdayIds || [], paso("Sellando jornadas pagadas..."));
      } else if (mode === "revert") {
        await markPayrollPending(p.id, p.workdayIds || [], paso("Quitando el sello de pago..."));
      } else if (mode === "bank") {
        await markBankPaid(p.id, paso("Sellando las jornadas de banco..."));
      } else if (mode === "revertBank") {
        await revertBankPaid(p.id, paso("Revirtiendo las transferencias..."));
      }
      setProgress({ step: "Actualizando lista...", detail: "", percent: 95 });
      setPayConfirm(null);
      const fresh = await load();
      toast.success(PAY_DONE[mode] || "Listo");
      // Los ciclos de esta nómina que con este pago quedaron pagados por
      // completo se ofrecen para cerrar.
      if (mode === "pay" && fresh) {
        const ids = new Set(p.cycleIds || []);
        const done = settledOpenCycles(fresh.cycles, fresh.stats, fresh.payrolls).settled.filter((r) => ids.has(r.cycle.id));
        if (done.length) setCloseCycles({ ids: new Set(done.map((r) => r.cycle.id)), payrollName: p.name });
      }
    } catch (err) {
      // El servicio lanza mensajes redactados para el usuario (ej. "La nómina
      // ya está pagada entera."): se muestran en un toast.
      toast.error(err.message || "No se pudo completar la operación.");
    } finally {
      setProgress(null);
    }
  };
  const onDelete = async () => {
    if (!confirmDelete) return;
    // Una nómina pagada no se elimina. Se vuelve a chequear acá aunque la UI
    // desactive el botón.
    if (confirmDelete.status === "paid") {
      setConfirmDelete(null);
      toast.error("No se puede eliminar una nómina pagada. Revierte primero a No pagado.");
      return;
    }
    // Tampoco con las transferencias pagadas: borrarla liberaría los días y
    // restauraría anticipos de quienes ya tienen la plata en la cuenta.
    if (confirmDelete.bankPaidAt) {
      setConfirmDelete(null);
      toast.error("Las transferencias de esta nómina ya se pagaron. Reviértelas antes de eliminarla.");
      return;
    }
    const id = confirmDelete.id;
    const workdayIds = confirmDelete.workdayIds || [];
    const advanceIds = confirmDelete.advanceIds || [];
    setConfirmDelete(null);
    setProgress({ step: "Iniciando eliminación...", detail: "", percent: 2 });
    try {
      // Soltar las jornadas, restaurar los anticipos y borrar el snapshot
      // corren en paralelo; el doc de la nómina se borra después de las tres,
      // para no dejar referencias colgando.
      const W_UNTAG = 70, W_ADV = 15, W_SNAP = 10;
      let untagDone = 0, untagTotal = Math.max(1, workdayIds.length);
      let advancesDone = false, snapDone = false;
      const recompute = () => {
        const pct =
          W_UNTAG * (untagDone / untagTotal) +
          (advancesDone ? W_ADV : 0) +
          (snapDone ? W_SNAP : 0);
        const detailParts = [];
        if (workdayIds.length > 0) detailParts.push(`Jornadas ${untagDone}/${untagTotal}`);
        if (advanceIds.length > 0) detailParts.push(`Anticipos ${advancesDone ? "✓" : "…"}`);
        detailParts.push(`JSON ${snapDone ? "✓" : "…"}`);
        setProgress({
          step: "Liberando jornadas y anticipos...",
          detail: detailParts.join(" · "),
          percent: pct,
        });
      };
      recompute();

      const pUntag = untagWorkdaysFromPayroll(workdayIds, (done, total) => {
        untagDone = done;
        untagTotal = Math.max(1, total);
        recompute();
      });
      const pAdv = (async () => {
        await restoreAdvancesFromPayroll(advanceIds, id);
        advancesDone = true;
        recompute();
      })();
      const pSnap = (async () => {
        await deleteSnapshot(id);
        snapDone = true;
        recompute();
      })();

      await Promise.all([pUntag, pAdv, pSnap]);

      setProgress({ step: "Eliminando nómina...", detail: "", percent: 95 });
      await payrollsService.remove(id);
    } catch (err) {
      console.error("Error al eliminar nómina:", err);
      toast.error(`Error al eliminar la nómina: ${err?.message || err}`);
      setProgress(null);
      return;
    }
    setProgress({ step: "Actualizando lista...", detail: "", percent: 98 });
    await load();
    setProgress({ step: "Listo ✓", detail: "", percent: 100 });
    setTimeout(() => setProgress(null), 400);
  };
  const { onDownloadNominaOnly, onDownloadSnapshot, onRedownload } = usePayrollDownloads({ currentBankFormat, cycles, rutOf, toast });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nómina</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Generar nóminas a partir de ciclos activos · archivo del banco: {bankFormat.label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            title="Configuración de nómina: formato del archivo del banco"
            className="flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]"
          >
            <span>⚙</span>
            <span className="hidden sm:inline">Configuración</span>
          </button>
          <button
            onClick={refresh}
            disabled={refreshing || loading}
            title="Forzar recarga desde el servidor (ignora la caché local). Útil si otro usuario acaba de agregar trabajadores, labores o jornadas."
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-3)] disabled:opacity-50"
          >
            <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>
            <span className="hidden sm:inline">{refreshing ? "Recargando…" : "Recargar datos"}</span>
          </button>
          <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm">
            <button
              onClick={() => setTab("create")}
              className={`rounded px-3 py-1 ${
                tab === "create" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
              }`}
            >
              Generar
            </button>
            <button
              onClick={() => setTab("history")}
              className={`rounded px-3 py-1 ${
                tab === "history" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
              }`}
            >
              Historial Nómina ({payrolls.length})
            </button>
            <button
              onClick={() => setTab("workers")}
              className={`rounded px-3 py-1 ${
                tab === "workers" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
              }`}
            >
              💰 Pagos anteriores
            </button>
          </div>
        </div>
      </div>

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

      <ConfirmDialog
        open={!!publishing}
        title="Publicar en el portal de trabajadores"
        message={
          publishing
            ? `¿Publicar "${publishing.name || "Nómina"}" en el portal? ${
                portal?.payrollId === publishing.id
                  ? "Ya es la publicada: se actualiza con lo que tiene ahora."
                  : portal?.payroll?.name
                    ? `Reemplaza a "${portal.payroll.name}", que es la publicada ahora.`
                    : "Hoy no hay ninguna publicada."
              } Cada trabajador ve solo su detalle, buscando su RUT.`
            : ""
        }
        confirmLabel="Publicar"
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
