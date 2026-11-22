import { useState, useEffect, useEffectEvent, useMemo, useRef } from "react";
import { adjustedSummaryTotals, buildWorkdaysByGroup } from "../printCommon";
import { computeLaborSummary, filterSummary, summaryDisplayRowsOf, summaryLabelColumnsOf, summaryTitleOf } from "../../../utils/payrollDetail";
import { printSummaryTable } from "../printSummaryTable";
import { useCaptureActions } from "../../../hooks/useCaptureActions";
import { writePayrollSummaryXlsx } from "./writePayrollSummaryXlsx";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";

// La tabla del resumen del detalle: por subfaena o por labor, con los ciclos
// de una subfaena juntos o separados (`cyclesApart`, que vive en el modal
// porque también lo usa el detalle de pago impreso, igual que `showGross`:
// el bruto con los anticipos y bonos aparte), con o sin el efectivo
// pendiente de otras nóminas, sus totales y sus acciones de imprimir, copiar y
// descargar. Los anticipos que la nómina entrega van siempre en su fila al
// pie.
//
// El buscador (`summarySearch`) deja las filas cuya faena, subfaena, ciclo o
// labor tiene lo escrito (`filterSummary`), y mientras busca el resumen va por
// labor. Los totales son los de esas filas, sin las filas de bonos y
// anticipos ni el efectivo pendiente de otras nóminas, que son de la nómina
// entera; lo que se copia, descarga o imprime sale igual.
const NO_AMOUNTS = { bank: 0, cash: 0, total: 0 };
const NO_ADJUSTMENTS = { bonus: NO_AMOUNTS, advance: NO_AMOUNTS, payout: NO_AMOUNTS };

export function useSummaryTable({ allGroups, bonusAdvanceSummary, catalogs, cycleNameOf, cyclesApart, cyclesPeriod, getPayrollData, otherPendingCash, payroll, setCyclesApart, setShowGross, showGross, subfaenaSummary, toast }) {
  const [summarySearch, setSummarySearch] = useState("");
  const searching = summarySearch.trim().length > 0;
  const adjustments = searching ? NO_ADJUSTMENTS : bonusAdvanceSummary;
  const adjustedTotals = (base) => adjustedSummaryTotals(base, adjustments);

  // Resumen en pantalla: las mismas tablas de "Detalle de pago" (por subfaena
  // o por labor), con sus propias acciones de imprimir, copiar y descargar. La
  // vista "con labores" usa la misma lectura cara de ciclos y jornadas: se
  // carga al activar el toggle y queda en caché mientras el modal esté abierto.
  const [summaryShowLabor, setSummaryShowLabor] = useState(false);
  // Al buscar, el resumen va por labor: es donde están las labores.
  const showLabor = summaryShowLabor || searching;
  // Las jornadas por grupo, atadas a la nómina para la que se leyeron, igual
  // que `getPayrollData`: toda edición llega como un `payroll` nuevo y se
  // vuelven a leer. El resumen sale de ellas en cada render, así sigue a
  // `cyclesApart` y a los nombres de los ciclos sin releer.
  const [laborWorkdays, setLaborWorkdays] = useState({ payroll: null, data: null });
  const workdaysByGroup = laborWorkdays.payroll === payroll ? laborWorkdays.data : null;
  const laborSummaryData = showLabor && workdaysByGroup
    ? computeLaborSummary(payroll, allGroups, workdaysByGroup, { byCycle: cyclesApart, net: !showGross, cycleNameOf })
    : null;
  const [laborSummaryLoading, setLaborSummaryLoading] = useState(false);
  // No mira `laborSummaryLoading`: si la nómina cambia a mitad de una carga,
  // el cleanup cancela la anterior (que ya no apaga el loading) y esta arranca
  // igual.
  const loadLaborWorkdays = useEffectEvent((isCancelled) => {
    if (!showLabor || workdaysByGroup) return;
    setLaborSummaryLoading(true);
    (async () => {
      const { error: err } = await attempt(async () => {
        const data = await getPayrollData();
        if (isCancelled()) return;
        setLaborWorkdays({ payroll, data: buildWorkdaysByGroup(allGroups, data, catalogs) });
      });
      if (err && !isCancelled()) toast.error("No se pudo cargar el resumen por labor: " + errorText(err));
      if (!isCancelled()) setLaborSummaryLoading(false);
    })();
  });
  useEffect(() => {
    let cancelled = false;
    loadLaborWorkdays(() => cancelled);
    return () => { cancelled = true; };
  }, [showLabor, payroll]);
  const fullSummary = showLabor ? laborSummaryData : subfaenaSummary;
  const activeSummary = filterSummary(fullSummary, summarySearch);
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
  // Sin nada pendiente, o al buscar, el selector no se muestra y el modo vale
  // "none".
  const pendingMode = pendingSummaryRows.length > 0 && !searching ? summaryPending : "none";
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

  const labelColumns = summaryLabelColumnsOf({ showLabor, byCycle: cyclesApart });
  const baseTitle = summaryTitleOf({ showLabor, byCycle: cyclesApart, gross: showGross });
  const summaryTitle = searching ? `${baseTitle} · filtrado por "${summarySearch.trim()}"` : baseTitle;
  const summaryDisplayRows = useMemo(
    () => summaryDisplayRowsOf(activeSummary, { showLabor, byCycle: cyclesApart, periodOf: cyclesPeriod }),
    [activeSummary, showLabor, cyclesApart, cyclesPeriod],
  );
  // En el bruto, los bonos y anticipos son de la nómina entera: al buscar no
  // van, y el resumen lo dice.
  const hiddenAdjustments = searching && showGross
    && (bonusAdvanceSummary.bonus.total > 0 || bonusAdvanceSummary.advance.total > 0 || bonusAdvanceSummary.payout?.total > 0);
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
      bonusAdvanceSummary: adjustments,
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
      () => writePayrollSummaryXlsx({ bonusAdvanceSummary: adjustments, deferredCash, grandTotals, labelColumns, payroll, pendingMode, pendingSummaryRows, summaryDisplayRows, summaryTitle }),
      { error: "No se pudo generar el Excel" },
    );
  };
  return {
    activeSummary,
    adjustments,
    allRowCount: fullSummary?.rows.length || 0,
    hiddenAdjustments,
    searching,
    setSummarySearch,
    summarySearch,
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
    setShowGross,
    showGross,
    setSummaryPending,
    setSummaryShowLabor,
    summaryDisplayRows,
    summaryPending,
    summaryShowLabor: showLabor,
    summaryTitle,
  };
}
