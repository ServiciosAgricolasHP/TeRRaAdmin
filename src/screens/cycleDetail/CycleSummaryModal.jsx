import { useState, useRef, useMemo } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useCarriers } from "../../contexts/CarriersContext";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  laborsDataOf,
  laborWorkerGridsOf,
  transportByCarrier,
  payTotal,
  dayNotesSummaryOf,
} from "../../utils/cycleSummary";
import { importedLaborsDataOf, chargeLaborsOf, chargeCarriersOf, chargeSubtotal } from "../../utils/cycleCharge";
import { fmtCurrency } from "../../utils/format";
import { DEFAULT_HIDDEN_COLUMNS, hiddenColumnsOf } from "../../utils/summaryTables";
import { ChargeEditor } from "./cycleSummaryModal/ChargeEditor";
import { ColumnsMenu } from "./cycleSummaryModal/ColumnsMenu";
import { EditingWatermark } from "./cycleSummaryModal/EditingWatermark";
import { ImportCyclesModal } from "./cycleSummaryModal/ImportCyclesModal";
import { ImportLaborsModal } from "./cycleSummaryModal/ImportLaborsModal";
import { LaborWorkerGrid } from "./cycleSummaryModal/LaborWorkerGrid";
import { PrintableSummary } from "./cycleSummaryModal/PrintableSummary";
import { TitlesEditor } from "./cycleSummaryModal/TitlesEditor";
import { writeCycleSummaryXlsx } from "./cycleSummaryModal/writeCycleSummaryXlsx";
import { useSummarySettings } from "./cycleSummaryModal/useSummarySettings";
import { useSummaryFlush } from "./cycleSummaryModal/useSummaryFlush";
import { useImportCycles } from "./cycleSummaryModal/useImportCycles";
import { useSummaryCapture } from "./cycleSummaryModal/useSummaryCapture";
import { attempt } from "../../utils/attempt";

// ============================================================
// Componente principal
// ============================================================

export default function CycleSummaryModal({
  open, onClose, cycle, faena, subfaena, workdaysByLabor = {}, dayPrices = {}, catalogs = {},
}) {
  // Todos los transportistas, también los dados de baja: uno eliminado puede
  // tener vueltas en el ciclo y hace falta su alias para no mostrar el id.
  const { carriers } = useCarriers();
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState("pay"); // pay | charge
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [showChargeEditor, setShowChargeEditor] = useState(true);
  // Candado de edición del modo cobrar. En false oculta los inputs, los
  // botones + y ✕ y los paneles de edición, y deja el resumen listo para
  // copiar, imprimir o exportar. Arranca bloqueado.
  const [editMode, setEditMode] = useState(false);
  // Popover de columnas visibles (modo cobrar). El botón ancla va como ref
  // para posicionar el popover por portal, sin que el overflow del Modal
  // padre lo recorte.
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const colsBtnRef = useRef(null);
  const printRef = useRef(null);
  const cycleId = cycle?.id;

  const {
    addChargeCarrierExtraRow,
    addChargeLaborExtraRow,
    charge,
    editChargeCarrierRow,
    editChargeLaborRow,
    hydratedRef,
    lastSavedRef,
    lastTotalsRef,
    loading,
    removeChargeCarrierExtraRow,
    removeChargeLaborExtraRow,
    resetColumns,
    setCharge,
    setChargeDiscount,
    setChargePendingBalance,
    setChargeWithVat,
    summaryMeta,
    titles,
    toggleColumn,
    trips,
    updateCarrierName,
    updateChargeCarrier,
    updateChargeLabor,
    updateLaborName,
    updateTitles,
  } = useSummarySettings({
    cycle,
    cycleId,
    faena,
    open,
    subfaena,
    toast,
    user,
  });

  const {
    applyImport,
    availableCycles,
    importedCycleIds,
    importOpen,
    importPlan,
    openImportModal,
    prepareImport,
    removeImportedLabor,
    selectedImportIds,
    setImportOpen,
    setImportPlan,
    toggleImportCycle,
  } = useImportCycles({
    charge,
    cycle,
    setBusy,
    setCharge,
    toast,
  });

  const hiddenColumns = useMemo(
    () => hiddenColumnsOf(charge.hiddenColumns, charge.shownColumns),
    [charge.hiddenColumns, charge.shownColumns],
  );
  // El botón de columnas se marca cuando se ocultó o se mostró algo distinto
  // de lo que viene por defecto.
  const columnsCustomized = hiddenColumns.size !== DEFAULT_HIDDEN_COLUMNS.length
    || DEFAULT_HIDDEN_COLUMNS.some((k) => !hiddenColumns.has(k));

  const laborsData = useMemo(() => laborsDataOf(cycle?.labors, workdaysByLabor, dayPrices, catalogs), [cycle?.labors, workdaysByLabor, catalogs, dayPrices]);

  const importedLaborsData = useMemo(() => importedLaborsDataOf(charge.importedLabors, catalogs), [charge.importedLabors, catalogs]);

  const laborWorkerGrids = useMemo(() => laborWorkerGridsOf(cycle?.labors, workdaysByLabor), [cycle?.labors, workdaysByLabor]);

  const transportData = useMemo(() => transportByCarrier(trips), [trips]);

  const carrierById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const grandTotalPay = useMemo(() => payTotal(laborsData, transportData), [laborsData, transportData]);

  const chargeLabors = useMemo(() => chargeLaborsOf(laborsData, importedLaborsData, charge.labors, catalogs), [laborsData, importedLaborsData, charge.labors, catalogs]);

  const chargeCarriers = useMemo(() => chargeCarriersOf(transportData, charge.carriers), [transportData, charge.carriers]);

  const dayNotesSummary = useMemo(() => dayNotesSummaryOf(mode, laborsData, cycle?.dayNotesByLabor, cycle?.dayNotes, titles.laborNames), [mode, cycle?.dayNotesByLabor, cycle?.dayNotes, laborsData, titles.laborNames]);

  const subtotalCharge = useMemo(() => chargeSubtotal(chargeLabors, chargeCarriers), [chargeLabors, chargeCarriers]);
  // Neto del cobro: subtotal − descuento, sin bajar de 0. Sobre él se calculan
  // el IVA (19%) y el total con IVA. El saldo pendiente no entra acá: se suma
  // después del IVA (ver el XLSX y PrintableSummary).
  const grandTotalCharge = useMemo(
    () => Math.max(0, subtotalCharge - (Number(charge.discount) || 0)),
    [subtotalCharge, charge.discount],
  );

  useSummaryFlush({
    charge,
    cycleId,
    grandTotalCharge,
    grandTotalPay,
    hydratedRef,
    lastSavedRef,
    lastTotalsRef,
    open,
    titles,
  });

  const {
    CAPTURE_LABELS,
    captureAsk,
    captureBusy,
    captureLocked,
    lockedHint,
    requestCapture,
    setCaptureAsk,
    setPendingCapture,
  } = useSummaryCapture({
    cycle,
    editMode,
    mode,
    printRef,
    titles,
  });
  const handleXlsxSummary = async () => {
    setBusy("xlsx");
    const { error: err } = await attempt(async () => {
      await writeCycleSummaryXlsx({
        carrierById,
        catalogs,
        charge,
        chargeCarriers,
        chargeLabors,
        cycle,
        dayNotes: dayNotesSummary,
        dayPrices,
        grandTotalCharge,
        grandTotalPay,
        hiddenColumns,
        laborsData,
        mode,
        subtotalCharge,
        titles,
        transportData,
      });
    });
    if (err) toast.error("Error al exportar: " + (err.message || err));
    setBusy("");
  };

  // El resumen es compartido: conviene ver quién lo dejó como está.
  const lastEditLabel = summaryMeta?.at
    ? [
        summaryMeta.email,
        summaryMeta.at.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`📊 Resumen ciclo — ${cycle?.label || ""}`}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </button>
          <button onClick={() => requestCapture("copy")} disabled={captureBusy === "copy"} title={captureLocked ? lockedHint : undefined} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {captureBusy === "copy" ? "Copiando..." : "📋 Copiar imagen"}
          </button>
          <button onClick={() => requestCapture("download")} disabled={captureBusy === "download"} title={captureLocked ? lockedHint : undefined} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {captureBusy === "download" ? "Descargando..." : "📥 Descargar PNG"}
          </button>
          <button onClick={handleXlsxSummary} disabled={busy === "xlsx"} title="El Excel se arma desde los datos — sale limpio aunque estés editando." className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {busy === "xlsx" ? "Generando..." : "📊 Excel"}
          </button>
          <button onClick={() => requestCapture("print")} title={captureLocked ? lockedHint : undefined} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            🖨 Imprimir
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
          <button
            onClick={() => setMode("pay")}
            className={`px-3 py-1.5 ${mode === "pay" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
          >
            Para pagar
          </button>
          <button
            onClick={() => setMode("charge")}
            className={`px-3 py-1.5 ${mode === "charge" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
          >
            Para cobrar
          </button>
        </div>
        {mode === "charge" && (
          <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
            <button
              onClick={() => setEditMode(false)}
              title="Resumen listo para entregar: sin inputs, sin marca de agua, se puede copiar/imprimir."
              className={`px-3 py-1.5 ${!editMode ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
            >
              🔒 Bloqueado
            </button>
            <button
              onClick={() => setEditMode(true)}
              title="Editar tarifas, cantidades y títulos. Mientras esté en edición no se puede copiar ni imprimir el resumen."
              className={`px-3 py-1.5 ${editMode ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
            >
              ✏️ Editando
            </button>
          </div>
        )}
        {/* Los controles de edición siguen al candado: con el resumen
            bloqueado no se muestra ninguno. En pagar no hay candado. */}
        {(mode !== "charge" || editMode) && (
          <button
            onClick={() => setShowTitleEditor((v) => !v)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            {showTitleEditor ? "▾" : "▸"} Personalizar títulos
          </button>
        )}
        {mode === "charge" && editMode && (
          <button
            onClick={() => setShowChargeEditor((v) => !v)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            {showChargeEditor ? "▾" : "▸"} Editar tarifas cobro
          </button>
        )}
        {mode === "charge" && editMode && (
          <button
            onClick={openImportModal}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            title="Agregar días de otros ciclos de la misma faena/subfaena"
          >
            📥 Importar ciclos anteriores
          </button>
        )}
        {mode === "charge" && (
          <button
            onClick={() => setChargeWithVat(!charge.withIva)}
            className={`rounded-md border px-2 py-1 text-xs ${charge.withIva ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"}`}
            title={charge.withIva
              ? "El total se cobra con IVA (19% calculado abajo). Click para cambiar a sin IVA."
              : "El total se cobra sin IVA (servicios exentos / acuerdos netos). Click para activar IVA."}
          >
            {charge.withIva ? "💰 Con IVA" : "🚫 Sin IVA"}
          </button>
        )}
        {mode === "charge" && (
          <>
            <button
              ref={colsBtnRef}
              onClick={() => setColsMenuOpen((v) => !v)}
              className={`rounded-md border px-2 py-1 text-xs ${columnsCustomized ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"}`}
              title="Mostrar / ocultar columnas"
            >
              👁 Columnas{hiddenColumns.size > 0 ? ` (${hiddenColumns.size} oculta${hiddenColumns.size === 1 ? "" : "s"})` : ""}
            </button>
            {colsMenuOpen && (
              <ColumnsMenu
                anchorRef={colsBtnRef}
                hidden={hiddenColumns}
                onToggle={toggleColumn}
                onReset={resetColumns}
                onClose={() => setColsMenuOpen(false)}
              />
            )}
          </>
        )}
        {loading && <span className="text-xs text-[var(--color-muted)]">Cargando...</span>}
        <span className="ml-auto flex items-center gap-3 text-sm">
          {lastEditLabel && (
            <span className="text-xs text-[var(--color-muted)]" title="El resumen se guarda para todo el equipo.">
              Última edición: {lastEditLabel}
            </span>
          )}
          <span>
            <span className="text-[var(--color-muted)]">Total: </span>
            <span className="font-semibold tabular-nums">
              {fmtCurrency(mode === "charge" ? grandTotalCharge : grandTotalPay)}
            </span>
          </span>
        </span>
      </div>

      {(mode !== "charge" || editMode) && showTitleEditor && (
        <TitlesEditor
          titles={titles}
          labors={[...(cycle?.labors || []), ...(charge.importedLabors || []).map((imp) => imp.labor)]}
          carriers={transportData.map((t) => ({ id: t.carrierId, label: carrierById.get(t.carrierId)?.alias || t.carrierId }))}
          onChange={updateTitles}
          onLaborNameChange={updateLaborName}
          onCarrierNameChange={updateCarrierName}
        />
      )}

      {mode === "charge" && editMode && showChargeEditor && (
        <ChargeEditor
          labors={chargeLabors}
          carriers={chargeCarriers}
          carrierById={carrierById}
          onLaborChange={updateChargeLabor}
          onCarrierChange={updateChargeCarrier}
          onRemoveImported={removeImportedLabor}
        />
      )}

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <div ref={printRef} style={{ position: "relative" }}>
        {/* Marca de agua en edición. Va dentro del nodo capturable para que
            una captura de pantalla manual quede marcada como borrador;
            copiar, descargar e imprimir están bloqueados en edición. */}
        {captureLocked && <EditingWatermark />}
        <PrintableSummary
          mode={mode}
          editMode={editMode}
          withIva={charge.withIva !== false}
          hiddenColumns={hiddenColumns}
          titles={titles}
          labors={mode === "charge" ? chargeLabors : laborsData}
          carriers={mode === "charge" ? chargeCarriers : transportData}
          carrierById={carrierById}
          grandTotal={mode === "charge" ? grandTotalCharge : grandTotalPay}
          subtotal={mode === "charge" ? subtotalCharge : null}
          discount={mode === "charge" ? (Number(charge.discount) || 0) : 0}
          discountNote={mode === "charge" ? (charge.discountNote || "") : ""}
          onChangeDiscount={mode === "charge" ? setChargeDiscount : undefined}
          pendingBalance={mode === "charge" ? (Number(charge.pendingBalance) || 0) : 0}
          pendingBalanceNote={mode === "charge" ? (charge.pendingBalanceNote || "") : ""}
          onChangePendingBalance={mode === "charge" ? setChargePendingBalance : undefined}
          catalogs={catalogs}
          dayPrices={dayPrices}
          dayNotes={dayNotesSummary}
          editLaborRow={editChargeLaborRow}
          addLaborRow={addChargeLaborExtraRow}
          removeLaborRow={removeChargeLaborExtraRow}
          toggleLaborOvertime={(laborId, on) => updateChargeLabor(laborId, { chargeOvertime: on })}
          editCarrierRow={editChargeCarrierRow}
          addCarrierRow={addChargeCarrierExtraRow}
          removeCarrierRow={removeChargeCarrierExtraRow}
        />
        {/* Resumen por trabajador (trabajador × día), una infografía por
            labor. Solo en pagar: el cobro es por tarifa pactada, no por
            trabajador. */}
        {mode === "pay" && laborWorkerGrids.map((g) => (
          <LaborWorkerGrid
            key={g.labor.id}
            labor={g.labor}
            displayName={titles.laborNames?.[g.labor.id] || g.labor.name}
            unit={laborsData.find((ld) => ld.labor.id === g.labor.id)?.unit || ""}
            catalogs={catalogs}
            containers={g.containers}
            workers={g.workers}
            dates={g.dates}
            anyPiso={g.anyPiso}
            titles={titles}
            dayPrices={dayPrices}
          />
        ))}
      </div>
      </div>

      <ConfirmDialog
        open={!!captureAsk}
        title="El resumen está en modo edición"
        message={`Así como está, la imagen saldría con los cuadros de edición y la marca de agua "EDITANDO — NO ENVIAR".\n\n¿Bloqueas el resumen y seguimos con ${CAPTURE_LABELS[captureAsk]?.verb || "la copia"}?`}
        confirmLabel={CAPTURE_LABELS[captureAsk]?.confirm || "Bloquear y continuar"}
        onConfirm={() => {
          setEditMode(false);
          setPendingCapture(captureAsk);
          setCaptureAsk(null);
        }}
        onCancel={() => setCaptureAsk(null)}
      />

      {importOpen && (
        <ImportCyclesModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          cycles={availableCycles}
          alreadyImported={importedCycleIds}
          selected={selectedImportIds}
          onToggle={toggleImportCycle}
          onConfirm={prepareImport}
          busy={busy === "import"}
        />
      )}

      {importPlan && (
        <ImportLaborsModal
          candidates={importPlan.candidates}
          onClose={() => setImportPlan(null)}
          onConfirm={applyImport}
        />
      )}
    </Modal>
  );
}
