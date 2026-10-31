import { useState, useEffect, useEffectEvent, useMemo, useRef } from "react";
import { buildWorkdaysByGroup } from "../printCommon";
import { computeLaborSummary, summaryDisplayRowsOf, summaryLabelColumnsOf, summaryTitleOf } from "../../../utils/payrollDetail";
import { printSummaryTable } from "../printSummaryTable";
import { useCaptureActions } from "../../../hooks/useCaptureActions";
import { writePayrollSummaryXlsx } from "./writePayrollSummaryXlsx";
import { attempt } from "../../../utils/attempt";

// La tabla del resumen del detalle: por subfaena o por labor, con los ciclos
// de una subfaena juntos o separados (`cyclesApart`, que vive en el modal
// porque también lo usa el detalle de pago impreso), con o sin el efectivo
// pendiente de otras nóminas, sus totales y sus acciones de imprimir, copiar y
// descargar.
export function useSummaryTable({ allGroups, bonusAdvanceSummary, catalogs, cycleNameOf, cyclesApart, cyclesPeriod, getPayrollData, otherPendingCash, payroll, setCyclesApart, subfaenaSummary, toast }) {
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
  // Las jornadas por grupo, atadas a la nómina para la que se leyeron, igual
  // que `getPayrollData`: toda edición llega como un `payroll` nuevo y se
  // vuelven a leer. El resumen sale de ellas en cada render, así sigue a
  // `cyclesApart` y a los nombres de los ciclos sin releer.
  const [laborWorkdays, setLaborWorkdays] = useState({ payroll: null, data: null });
  const workdaysByGroup = laborWorkdays.payroll === payroll ? laborWorkdays.data : null;
  const laborSummaryData = summaryShowLabor && workdaysByGroup
    ? computeLaborSummary(payroll, allGroups, workdaysByGroup, { byCycle: cyclesApart, cycleNameOf })
    : null;
  const [laborSummaryLoading, setLaborSummaryLoading] = useState(false);
  // No mira `laborSummaryLoading`: si la nómina cambia a mitad de una carga,
  // el cleanup cancela la anterior (que ya no apaga el loading) y esta arranca
  // igual.
  const loadLaborWorkdays = useEffectEvent((isCancelled) => {
    if (!summaryShowLabor || workdaysByGroup) return;
    setLaborSummaryLoading(true);
    (async () => {
      const { error: err } = await attempt(async () => {
        const data = await getPayrollData();
        if (isCancelled()) return;
        setLaborWorkdays({ payroll, data: buildWorkdaysByGroup(allGroups, data, catalogs) });
      });
      if (err && !isCancelled()) toast.error("No se pudo cargar el resumen por labor: " + (err?.message || err));
      if (!isCancelled()) setLaborSummaryLoading(false);
    })();
  });
  useEffect(() => {
    let cancelled = false;
    loadLaborWorkdays(() => cancelled);
    return () => { cancelled = true; };
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

  const labelColumns = summaryLabelColumnsOf({ showLabor: summaryShowLabor, byCycle: cyclesApart });
  const summaryTitle = summaryTitleOf({ showLabor: summaryShowLabor, byCycle: cyclesApart });
  const summaryDisplayRows = useMemo(
    () => summaryDisplayRowsOf(activeSummary, { showLabor: summaryShowLabor, byCycle: cyclesApart, periodOf: cyclesPeriod }),
    [activeSummary, summaryShowLabor, cyclesApart, cyclesPeriod],
  );
  // El selector de juntos o separados se ofrece cuando alguna subfaena tiene
  // más de un ciclo con monto.
  const hasSeveralCycles = subfaenaSummary.rows.some((r) => r.cycleCount > 1);

  const summaryCaptureRef = useRef(null);
  const { busy: summaryBusy, run, copy } = useCaptureActions();
  const handlePrintSummary = () => {
    if (!activeSummary) return;
    run("print", () => printSummaryTable(payroll, {
      title: summaryTitle,
      labelColumns,
      displayRows: summaryDisplayRows,
      bonusAdvanceSummary,
      pendingRows: pendingSummaryRows,
      pendingMode,
      grandTotals,
      deferredCash,
    }), { error: "No se pudo imprimir" });
  };
  const handleCopySummaryImage = () => copy(summaryCaptureRef.current);
  const handleDownloadSummaryXlsx = () => {
    if (!activeSummary) return;
    run(
      "xlsx",
      () => writePayrollSummaryXlsx({ bonusAdvanceSummary, deferredCash, grandTotals, labelColumns, payroll, pendingMode, pendingSummaryRows, summaryDisplayRows, summaryTitle }),
      { error: "No se pudo generar el Excel" },
    );
  };
  return {
    activeSummary,
    cyclesApart,
    deferredCash,
    grandTotals,
    handleCopySummaryImage,
    handleDownloadSummaryXlsx,
    handlePrintSummary,
    hasSeveralCycles,
    labelColumns,
    laborSummaryLoading,
    pendingMode,
    pendingSummaryRows,
    summaryBusy,
    summaryCaptureRef,
    setCyclesApart,
    setSummaryPending,
    setSummaryShowLabor,
    summaryDisplayRows,
    summaryPending,
    summaryShowLabor,
    summaryTitle,
  };
}
