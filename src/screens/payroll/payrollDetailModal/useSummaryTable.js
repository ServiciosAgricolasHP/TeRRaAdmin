import { useState, useEffect, useMemo, useRef } from "react";
import { buildWorkdaysByGroup } from "../printCommon";
import { computeLaborSummary, summaryDisplayRowsOf, summaryLabelColumnsOf } from "../../../utils/payrollDetail";
import { printSummaryTable } from "../printSummaryTable";
import { captureFullWidthBlob } from "../../../utils/imageCapture";
import { writePayrollSummaryXlsx } from "./writePayrollSummaryXlsx";

// La tabla del resumen del detalle: por subfaena o por labor, con o sin el
// efectivo pendiente de otras nóminas, sus totales y sus acciones de
// imprimir, copiar y descargar.
export function useSummaryTable({ allGroups, bonusAdvanceSummary, catalogs, cyclesPeriod, getPayrollData, otherPendingCash, payroll, subfaenaSummary, toast }) {
  "use no memo";
  const adjustedTotals = (base) => ({
    bank: base.bank + (bonusAdvanceSummary.bonus.bank || 0) - (bonusAdvanceSummary.advance.bank || 0),
    cash: base.cash + (bonusAdvanceSummary.bonus.cash || 0) - (bonusAdvanceSummary.advance.cash || 0),
    total: base.total + (bonusAdvanceSummary.bonus.total || 0) - (bonusAdvanceSummary.advance.total || 0),
  });

  // Resumen en pantalla: las mismas tablas de "Detalle de pago" (por subfaena
  // o por labor), con sus propias acciones de imprimir, copiar y descargar. La
  // vista "con labores" usa la misma lectura cara de ciclos y jornadas: se
  // carga al activar el toggle y queda en caché mientras el modal esté abierto.
  const [summaryShowLabor, setSummaryShowLabor] = useState(false);
  // Atado a la nómina para la que se calculó, igual que `getPayrollData`: toda
  // edición llega como un `payroll` nuevo y el resumen se vuelve a calcular.
  const [laborSummary, setLaborSummary] = useState({ payroll: null, data: null });
  const laborSummaryData = laborSummary.payroll === payroll ? laborSummary.data : null;
  const [laborSummaryLoading, setLaborSummaryLoading] = useState(false);
  useEffect(() => {
    // No mira `laborSummaryLoading`: si la nómina cambia a mitad de una carga,
    // el cleanup cancela la anterior (que ya no apaga el loading) y esta
    // arranca igual.
    if (!summaryShowLabor || laborSummaryData) return;
    let cancelled = false;
    setLaborSummaryLoading(true);
    (async () => {
      try {
        const data = await getPayrollData();
        if (cancelled) return;
        const workdaysByGroup = buildWorkdaysByGroup(allGroups, data, catalogs);
        setLaborSummary({ payroll, data: computeLaborSummary(payroll, allGroups, workdaysByGroup) });
      } catch (err) {
        if (!cancelled) toast.error("No se pudo cargar el resumen por labor: " + (err?.message || err));
      } finally {
        if (!cancelled) setLaborSummaryLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryShowLabor, payroll]);
  const activeSummary = summaryShowLabor ? laborSummaryData : subfaenaSummary;
  // El efectivo adeudado de nóminas anteriores se puede sumar a esta tabla,
  // como fila aparte por nómina (es plata de otro período, con su propio
  // sobre) y con el monto neto adeudado.
  //
  // Modos:
  //   none        → esta nómina sola.
  //   with        → esta nómina más lo que se debe de antes.
  //   onlyPending → hoy sale solo lo pendiente: las transferencias de esta
  //                 nómina y el efectivo que se debía de antes. El efectivo de
  //                 esta nómina se difiere a la vuelta siguiente.
  const [summaryPending, setSummaryPending] = useState("none"); // none | with | onlyPending
  const pendingSummaryRows = useMemo(
    () => otherPendingCash.map((p) => ({
      pendingId: p.payrollId,
      name: p.name,
      count: p.items.length,
      period: p.period,
      bank: 0,
      cash: p.amount,
      total: p.amount,
    })),
    [otherPendingCash],
  );
  const pendingTotals = useMemo(
    () => pendingSummaryRows.reduce(
      (acc, r) => ({ bank: 0, cash: acc.cash + r.cash, total: acc.total + r.total }),
      { bank: 0, cash: 0, total: 0 },
    ),
    [pendingSummaryRows],
  );
  // Sin nada pendiente, el selector no se muestra y el modo vale "none".
  const pendingMode = pendingSummaryRows.length > 0 ? summaryPending : "none";
  const ownAdjusted = activeSummary
    ? adjustedTotals(activeSummary.totals)
    : { bank: 0, cash: 0, total: 0 };
  // En modo "onlyPending" el efectivo de esta nómina no se entrega: se difiere.
  const deferredCash = pendingMode === "onlyPending" ? ownAdjusted.cash : 0;
  const addedPending = pendingMode === "none" ? 0 : pendingTotals.cash;
  const grandTotals = {
    bank: ownAdjusted.bank,
    cash: ownAdjusted.cash - deferredCash + addedPending,
    total: ownAdjusted.total - deferredCash + addedPending,
  };

  const labelColumns = summaryLabelColumnsOf({ showLabor: summaryShowLabor });
  const summaryDisplayRows = useMemo(
    () => summaryDisplayRowsOf(activeSummary, { showLabor: summaryShowLabor, periodOf: cyclesPeriod }),
    [activeSummary, summaryShowLabor, cyclesPeriod],
  );

  const summaryCaptureRef = useRef(null);
  const [summaryBusy, setSummaryBusy] = useState("");
  const handlePrintSummary = () => {
    if (!activeSummary) return;
    try {
      printSummaryTable(payroll, {
        showLabor: summaryShowLabor,
        labelColumns,
        displayRows: summaryDisplayRows,
        bonusAdvanceSummary,
        pendingRows: pendingSummaryRows,
        pendingMode,
        grandTotals,
        deferredCash,
      });
    } catch (err) {
      toast.error(err?.message || String(err));
    }
  };
  const handleCopySummaryImage = async () => {
    if (!summaryCaptureRef.current) return;
    setSummaryBusy("image");
    try {
      const blob = await captureFullWidthBlob(summaryCaptureRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setSummaryBusy("");
    }
  };
  const handleDownloadSummaryXlsx = async () => {
    if (!activeSummary) return;
    setSummaryBusy("xlsx");
    try {
      await writePayrollSummaryXlsx({ bonusAdvanceSummary, deferredCash, grandTotals, labelColumns, payroll, pendingMode, pendingSummaryRows, summaryDisplayRows, summaryShowLabor });
    } catch (err) {
      toast.error("Error al generar Excel: " + (err.message || err));
    } finally {
      setSummaryBusy("");
    }
  };
  return {
    activeSummary,
    deferredCash,
    grandTotals,
    handleCopySummaryImage,
    handleDownloadSummaryXlsx,
    handlePrintSummary,
    labelColumns,
    laborSummaryLoading,
    pendingMode,
    pendingSummaryRows,
    summaryBusy,
    summaryCaptureRef,
    setSummaryPending,
    setSummaryShowLabor,
    summaryDisplayRows,
    summaryPending,
    summaryShowLabor,
  };
}
