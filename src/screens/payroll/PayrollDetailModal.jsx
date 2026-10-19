import { useMemo, useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { captureFullWidthBlob } from "../../utils/imageCapture";
import { workdaysService, payrollSnapshotsService } from "../../services";
import {
  pendingCashItemsOf,
  removeWorkerFromPayroll,
  addWorkdaysToPayroll,
  payrollsService,
} from "../../services/payrollsService";
import { listPendingForWorkers } from "../../services/advancesService";
import { extendSnapshot, snapshotCycleOf, snapshotWorkdayOf, snapshotAdvanceOf } from "../../services/payrollSnapshots";
import { workerKeys } from "../../services/workersService";
import { useCatalogs } from "../../contexts/CatalogsContext";
import { useToast } from "../../contexts/ToastContext";
import { liveProfileOf, planPayrollRecalc, applyPayrollRecalc } from "../../services/payrollRecalc";
import {
  splitBankAndCash,
  groupCashByLeader,
  aggregateWorkerAmounts,
  workdayPayAmount,
} from "../../utils/payroll";
import {
  planAddWorkdays,
  withPaidPeriods,
  cycleDetailOf,
  stillFreeWorkdays,
  asPayrollWorker,
  payrollCycleBreakdown,
} from "../../utils/payrollItem";
import ConfirmDialog from "../../components/ConfirmDialog";
import WorkerSummaryModal from "../../components/WorkerSummaryModal";
import RowMenu from "../../components/RowMenu";
import { useIsMobile } from "../../hooks/useIsMobile";
import { currentRutResolver } from "../../utils/workerRut";
import {
  detailSummariesOf,
  subfaenaSummaryOf,
  cyclesPeriodOf,
  summaryDisplayRowsOf,
  removalSummaryOf,
} from "../../utils/payrollDetail";
import { fmtCurrency } from "../../utils/format";
import { AddCyclesModal } from "./AddCyclesModal";
import { AddWorkerDaysModal } from "./AddWorkerDaysModal";
import { CashEstimationModal } from "./CashEstimationModal";
import { FilterToken, FilterChips } from "./FilterChips";
import { resolveCurrentRut, fmtDayShortEs } from "./helpers";
import { PAY_STATE_PILL, payStateOf, paymentDates } from "./payState";
import { PortalBadge } from "./PayStatePill";
import {
  computeBonusAdvanceSummary,
  fetchPayrollWorkdays,
  buildWorkdaysByGroup,
  computeLaborSummary,
} from "./printCommon";
import { printCashReceipts, printPaymentDetails } from "./printReceipts";
import { printSummaryTable } from "./printSummaryTable";
import { RecalcModal } from "./RecalcModal";
import { WorkerDetailRow } from "./WorkerDetailRow";
import { writePayrollSummaryXlsx } from "./payrollDetailModal/writePayrollSummaryXlsx";
import { useDetailFilters } from "./payrollDetailModal/useDetailFilters";
import { useCashPaid } from "./payrollDetailModal/useCashPaid";

export function PayrollDetailModal({ payroll, cycles, faenas, subfaenas, workers, allPayrolls = [], onClose, onRedownload, onDownloadNominaOnly, onDownloadSnapshot, onPublishPortal = null, publishedPayrollId = null, onChanged }) {
  const { catalogs } = useCatalogs();
  const toast = useToast();
  const isMobile = useIsMobile();
  const items = payroll.items || [];
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);
  const { bank, cash } = splitBankAndCash(items);
  const cashGroups = groupCashByLeader(cash);
  const allGroups = groupCashByLeader(items); // todos (banco y efectivo) agrupados por líder

  const {
    activeCycleFilter,
    activeLeaderFilter,
    allLeaders,
    clearFilters,
    filteredItems,
    hasActiveFilter,
    moreFilterCount,
    paymentMethod,
    search,
    setCycleFilter,
    setLeaderFilter,
    setPaymentMethod,
    setSearch,
    setShowFilters,
    showFilters,
    toggleSetItem,
  } = useDetailFilters({ items, payroll, rutOf });
  const [expandedRut, setExpandedRut] = useState(null);
  // Secciones colapsadas al abrir: los ciclos siempre (se despliegan solos al
  // editar el contenido) y, en una nómina pagada, cada grupo por líder (banco
  // y efectivo). El resumen abre siempre desplegado.
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const set = new Set(["cycles"]);
    if (payroll.status !== "paid") return set;
    for (const g of groupCashByLeader(bank)) set.add(`bank_${g.leader}`);
    for (const g of cashGroups) set.add(`cash_${g.leader}`);
    return set;
  });
  const [printingGroupLeader, setPrintingGroupLeader] = useState(null);
  const [workerSummaryFor, setWorkerSummaryFor] = useState(null);

  const toggleSection = (key) => setCollapsedSections((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const isCollapsed = (key) => collapsedSections.has(key);

  const filteredSplit = useMemo(() => splitBankAndCash(filteredItems), [filteredItems]);
  const filteredBank = filteredSplit.bank;
  const filteredCash = filteredSplit.cash;
  const filteredCashGroups = useMemo(() => groupCashByLeader(filteredCash), [filteredCash]);
  // Banco también agrupado por líder, para imprimir el detalle por grupo (ej.
  // solo CHILENOS) igual que en efectivo. groupCashByLeader sirve para
  // cualquier conjunto de items, no solo los de efectivo.
  const filteredBankGroups = useMemo(() => groupCashByLeader(filteredBank), [filteredBank]);

  const {
    cashPaidMode,
    cashPaidSet,
    owedCash,
    setGroupCashPaid,
    toggleCashPaid,
  } = useCashPaid({ cash, payroll, toast });

  // Deuda de efectivo de OTRAS nóminas. No se mezcla con esta —son entregas
  // aparte, con su propio sobre— pero sí tiene que entrar al estimador: los
  // billetes y el sencillo se sacan del banco una sola vez. Una nómina pagada
  // ya entregó su efectivo: ni el resumen ni el estimador le ofrecen sumarle
  // el de otras.
  const isPaid = payroll.status === "paid";
  const otherPendingCash = useMemo(() => {
    const out = [];
    if (isPaid) return out;
    for (const other of allPayrolls) {
      if (!other || other.id === payroll.id) continue;
      const pendItems = pendingCashItemsOf(other);
      if (pendItems.length === 0) continue;
      // Período de la otra nómina, sacado de su propio `cycleDetails`.
      const days = (other.cycleDetails || []).flatMap((c) => [c.firstDay, c.lastDay]).filter(Boolean).sort();
      out.push({
        payrollId: other.id,
        name: other.name || other.id,
        items: pendItems,
        amount: pendItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
        period: days.length ? { first: days[0], last: days[days.length - 1] } : null,
      });
    }
    return out;
  }, [allPayrolls, payroll.id, isPaid]);

  const detailSummaries = detailSummariesOf(allGroups, payroll.cycleDetails);

  const cycleDetails = payroll.cycleDetails || [];

  // Modo edición: sacar un trabajador, o destildar ciclos y labores y
  // recalcular sin ellos. Solo con la nómina pendiente.
  const isPending = payroll.status !== "paid";
  const [editMode, setEditMode] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // { target, message }
  const handleRemoveWorker = (item) => {
    if (!isPending || editBusy) return;
    const label = `${item.name || item.rut} (${fmtCurrency(item.amount || 0)})`;
    setConfirmRemove({
      target: item,
      message: `¿Sacar a ${label} de esta nómina?\n\nSe liberan sus jornadas y se restauran sus anticipos aplicados. Se puede volver a sumar con "+ Agregar persona".`,
    });
  };
  const doRemoveWorker = async (item) => {
    setEditBusy(true);
    try {
      await removeWorkerFromPayroll(payroll.id, item.rut);
      await onChanged?.();
    } catch (err) {
      toast.error(`Error al sacar el trabajador: ${err?.message || err}`);
    } finally {
      setEditBusy(false);
    }
  };
  const confirmRemoveAction = () => {
    const cr = confirmRemove;
    setConfirmRemove(null);
    if (cr) doRemoveWorker(cr.target);
  };

  // Datos de cuenta y grupo de la ficha del trabajador: con estos entra quien
  // se agrega a la nómina, y contra estos compara Recalcular.
  const workerByKey = (key) => workers.find((w) => w.id === key) || workers.find((w) => w.rut === key);
  const profileForAgg = (a) => {
    const w = workerByKey(a.workerId || a.rut) || workers.find((x) => x.id === a.rut);
    return w ? liveProfileOf(w) : null;
  };

  // Agregar ciclos o labores (de la misma u otra subfaena) a una nómina ya
  // creada. `selection` es [{ cycleId, laborIds }]: se eligen las labores, y
  // un ciclo que ya está en la nómina con algunas aparece con las que le
  // faltan. La cuenta vive en `planAddWorkdays` (src/utils/payrollItem.js):
  // quien ya está suma la producción y los anticipos pendientes que esta
  // nómina no le tocaba; quien no está entra con el reparto completo.
  const [addCyclesOpen, setAddCyclesOpen] = useState(false);
  const handleAddCycles = async (selection) => {
    if (!selection?.length || editBusy) return;
    setEditBusy(true);
    try {
      const elegidas = new Map(selection.map((s) => [s.cycleId, new Set(s.laborIds)]));
      const cycleIdsToAdd = [...elegidas.keys()];
      const selectedCycles = cycles.filter((c) => elegidas.has(c.id));
      const laborTypeById = new Map();
      for (const cycle of selectedCycles) {
        for (const labor of cycle.labors || []) laborTypeById.set(labor.id, labor.type);
      }

      // Directo de Firestore, sin caché: de acá sale lo que se etiqueta.
      const nuevas = [];
      for (let i = 0; i < cycleIdsToAdd.length; i += 10) {
        const chunk = cycleIdsToAdd.slice(i, i + 10);
        const wds = await workdaysService.list({ wheres: [["cycleId", "in", chunk]] });
        for (const wd of wds) {
          if (wd.payrollId) continue;
          if (String(wd.workerRut || "").startsWith("TEMP-")) continue;
          if (!elegidas.get(wd.cycleId)?.has(wd.laborId)) continue;
          nuevas.push(wd);
        }
      }
      const pendingAdvances = await listPendingForWorkers(
        aggregateWorkerAmounts(nuevas, laborTypeById).map(resolveCurrentRut(workers)),
      );
      const plan = planAddWorkdays({
        items,
        workdays: nuevas,
        laborTypeById,
        pendingAdvances,
        profileFor: profileForAgg,
      });
      if (plan.workdayIds.length === 0) {
        toast.warning("No hay producción disponible para agregar en esas labores (ya está en otra nómina o no tiene monto).");
        return;
      }

      // El período de cada ciclo es el de los días que se agregan; en uno que
      // ya estaba, el servicio lo estira para cubrirlos.
      const includedIds = new Set(plan.workdayIds);
      const addedWorkdays = nuevas.filter((wd) => includedIds.has(wd.id));
      const cycleDetailsToAdd = withPaidPeriods(selectedCycles.map((c) => {
        const detail = cycleDetailOf(c, { faenas, subfaenas });
        const todas = (c.labors || []).map((l) => l.id);
        const laborIds = todas.filter((id) => elegidas.get(c.id).has(id));
        // Entero solo si es nuevo en la nómina y se eligieron todas sus
        // labores; si no, Recalcular traería después lo que se dejó afuera.
        const yaEsta = cycleDetails.some((cd) => cd.id === c.id);
        return !yaEsta && laborIds.length === todas.length ? detail : { ...detail, laborIds };
      }), addedWorkdays);

      const aggregates = await addWorkdaysToPayroll(payroll.id, {
        items: plan.items,
        cycleDetailsToAdd,
        workdayIds: plan.workdayIds,
        workdays: addedWorkdays,
        advanceApplications: plan.newAdvanceApplications,
      });
      const anticipoPorId = new Map(pendingAdvances.map((a) => [a.id, a]));
      await extendSnapshot(payroll.id, {
        items: plan.items,
        aggregates,
        cycles: cycleDetailsToAdd.map((cd) => snapshotCycleOf(cd, selectedCycles.find((c) => c.id === cd.id))),
        workdays: addedWorkdays.map(snapshotWorkdayOf),
        advances: plan.newAdvanceApplications
          .map((x) => anticipoPorId.get(x.advanceId))
          .filter(Boolean)
          .map(snapshotAdvanceOf),
      });

      setAddCyclesOpen(false);
      await onChanged?.();
      toast.success(additionSummary(`${selectedCycles.length} ciclo(s) agregado(s) a la nómina.`, plan.added));
    } catch (err) {
      toast.error(`Error al agregar ciclos: ${err?.message || err}`);
    } finally {
      setEditBusy(false);
    }
  };

  // Agregar los días puntuales de una persona, de cualquier ciclo abierto,
  // esté o no en la nómina. Un ciclo que entra solo por estos días queda con
  // `laborIds: []`: Recalcular no trae nada más de ahí, solo refresca lo que
  // se agregó.
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const handleAddWorkerDays = async ({ worker, workdayIds }) => {
    if (!worker || !workdayIds?.length || editBusy) return;
    setEditBusy(true);
    try {
      const claves = workerKeys(worker);
      // Se releen: entre que se abrió el modal y ahora, otra nómina pudo
      // tomar alguno de esos días.
      const frescas = await workdaysService.list({ wheres: [["workerRut", "in", claves]] });
      const { libres, tomadas } = stillFreeWorkdays(frescas, workdayIds);
      if (libres.length === 0) {
        toast.error("Esos días ya no están disponibles: los tomó otra nómina.");
        return;
      }
      const persona = asPayrollWorker({
        items,
        keys: claves,
        fallbackKey: worker.id,
        rut: worker.rut || worker.id,
        workdays: libres,
        advances: await listPendingForWorkers(claves),
      });
      const laborTypeById = new Map(cycles.flatMap((c) => (c.labors || []).map((l) => [l.id, l.type])));
      const plan = planAddWorkdays({
        items,
        workdays: persona.workdays,
        laborTypeById,
        pendingAdvances: persona.advances,
        profileFor: () => liveProfileOf(worker),
      });
      if (plan.workdayIds.length === 0) {
        toast.warning("Lo elegido suma $0 y esta persona no está en la nómina: no hay nada que pagarle.");
        return;
      }

      const yaEstan = new Set([...cycleDetails.map((c) => c.id), ...(payroll.cycleIds || [])]);
      const ciclosNuevos = [...new Set(libres.map((wd) => wd.cycleId))]
        .filter((cid) => !yaEstan.has(cid))
        .map((cid) => cycles.find((c) => c.id === cid))
        .filter(Boolean);
      const includedIds = new Set(plan.workdayIds);
      const addedWorkdays = libres.filter((wd) => includedIds.has(wd.id));
      const cycleDetailsToAdd = withPaidPeriods(
        ciclosNuevos.map((c) => ({ ...cycleDetailOf(c, { faenas, subfaenas }), laborIds: [] })),
        addedWorkdays,
      );

      const aggregates = await addWorkdaysToPayroll(payroll.id, {
        items: plan.items,
        cycleDetailsToAdd,
        workdayIds: plan.workdayIds,
        workdays: addedWorkdays,
        advanceApplications: plan.newAdvanceApplications,
      });
      const anticipoPorId = new Map(persona.advances.map((a) => [a.id, a]));
      await extendSnapshot(payroll.id, {
        items: plan.items,
        aggregates,
        cycles: cycleDetailsToAdd.map((cd) => snapshotCycleOf(cd, ciclosNuevos.find((c) => c.id === cd.id))),
        workdays: addedWorkdays.map(snapshotWorkdayOf),
        advances: plan.newAdvanceApplications
          .map((x) => anticipoPorId.get(x.advanceId))
          .filter(Boolean)
          .map(snapshotAdvanceOf),
      });

      setAddWorkerOpen(false);
      await onChanged?.();
      const dias = new Set(libres.map((wd) => `${wd.cycleId}|${wd.laborId}|${wd.date}`)).size;
      toast.success(
        additionSummary(`${dias} día(s) de ${worker.name || "la persona"} agregado(s) a la nómina.`, plan.added) +
          (tomadas > 0 ? ` ${tomadas} jornada(s) ya no estaban disponibles y quedaron afuera.` : ""),
      );
    } catch (err) {
      toast.error(`Error al agregar a la persona: ${err?.message || err}`);
    } finally {
      setEditBusy(false);
    }
  };

  // Recalcular: compara la nómina contra la producción vigente de sus ciclos
  // y muestra los cambios antes de escribir (`planPayrollRecalc` en
  // services/payrollRecalc.js). Con `removed` (lo destildado en la sección de
  // ciclos), la nómina queda como si se hubiera armado sin eso. `lines`
  // describe lo sacado para la vista previa.
  const [recalcPreview, setRecalcPreview] = useState(null);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const computeRecalc = async (removed = new Map(), lines = []) => {
    setRecalcBusy(true);
    try {
      const plan = await planPayrollRecalc(payroll, { cycles, faenas, subfaenas, workers, removed });
      if (plan.empty) {
        toast.success("Sin cambios — la nómina ya está al día.");
        return;
      }
      setRecalcPreview({ ...plan, removalLines: lines });
    } catch (err) {
      toast.error(`Error al recalcular: ${err?.message || err}`);
    } finally {
      setRecalcBusy(false);
    }
  };

  const applyRecalc = async () => {
    if (!recalcPreview) return;
    setRecalcBusy(true);
    try {
      await applyPayrollRecalc(payroll.id, recalcPreview);
      const sacado = recalcPreview.removalLines.length > 0;
      setRecalcPreview(null);
      setRemoval(new Map());
      await onChanged?.();
      toast.success(sacado ? "Listo: se sacó lo elegido y la nómina quedó recalculada." : "Nómina recalculada.");
    } catch (err) {
      toast.error(`Error al aplicar el recálculo: ${err?.message || err}`);
    } finally {
      setRecalcBusy(false);
    }
  };

  // Lo que se va a sacar, marcado con las casillas de la sección de ciclos:
  // Map(cycleId → true para el ciclo entero, o un Set con las labores). No se
  // escribe nada hasta recalcular.
  const [removal, setRemoval] = useState(() => new Map());

  const subfaenaSummary = subfaenaSummaryOf(cycleDetails, bank, cash);

  // Totales para el encabezado del resumen.
  const bankTotal = bank.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const cashTotal = cash.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const grossTotal = items.reduce((s, x) => s + (Number(x.grossAmount) || Number(x.amount) || 0), 0);
  const advanceTotal = items.reduce((s, x) => s + (Number(x.advance) || 0), 0);
  const bonusTotal = items.reduce((s, x) => s + (Number(x.bonus) || 0), 0);
  const bonusAdvanceSummary = computeBonusAdvanceSummary(items);
  const adjustedTotals = (base) => ({
    bank: base.bank + (bonusAdvanceSummary.bonus.bank || 0) - (bonusAdvanceSummary.advance.bank || 0),
    cash: base.cash + (bonusAdvanceSummary.bonus.cash || 0) - (bonusAdvanceSummary.advance.cash || 0),
    total: base.total + (bonusAdvanceSummary.bonus.total || 0) - (bonusAdvanceSummary.advance.total || 0),
  });
  const cyclesPeriod = (cycleIdsIn) => cyclesPeriodOf(cycleDetails, cycleIdsIn);

  // Ciclos y jornadas de la nómina, una vez por modal. Se guarda la promesa y
  // no el resultado, así dos clicks seguidos no disparan dos lecturas, y queda
  // atada a la identidad de `payroll`: toda edición pasa por `onChanged`, que
  // reemplaza el objeto e invalida el memo. Cerrar y volver a abrir el modal
  // también relee.
  const payrollDataRef = useRef({ payroll: null, promise: null });
  const getPayrollData = () => {
    if (payrollDataRef.current.payroll !== payroll) {
      payrollDataRef.current = { payroll, promise: fetchPayrollWorkdays(payroll) };
    }
    return payrollDataRef.current.promise;
  };

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

  const summaryDisplayRows = useMemo(() => summaryDisplayRowsOf(activeSummary, summaryShowLabor), [activeSummary, summaryShowLabor]);

  const resumenCaptureRef = useRef(null);
  const [resumenBusy, setResumenBusy] = useState("");
  const handlePrintResumen = () => {
    if (!activeSummary) return;
    try {
      printSummaryTable(payroll, {
        showLabor: summaryShowLabor,
        subfaenaSummary,
        laborSummary: laborSummaryData,
        bonusAdvanceSummary,
        pendingRows: pendingSummaryRows,
        pendingMode,
      });
    } catch (err) {
      toast.error(err?.message || String(err));
    }
  };
  const handleCopyResumenImage = async () => {
    if (!resumenCaptureRef.current) return;
    setResumenBusy("image");
    try {
      const blob = await captureFullWidthBlob(resumenCaptureRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setResumenBusy("");
    }
  };
  const handleDownloadResumenXlsx = async () => {
    if (!activeSummary) return;
    setResumenBusy("xlsx");
    try {
      await writePayrollSummaryXlsx({ bonusAdvanceSummary, cyclesPeriod, deferredCash, grandTotals, payroll, pendingMode, pendingSummaryRows, summaryDisplayRows, summaryShowLabor });
    } catch (err) {
      toast.error("Error al generar Excel: " + (err.message || err));
    } finally {
      setResumenBusy("");
    }
  };

  // Encabezados editables por ciclo, guardados en el doc de la nómina
  // (`payroll.cycleLabelOverrides`) y aplicados al XLSX, los comprobantes y el
  // detalle impreso. Si la nómina no tiene el campo, arranca desde la copia de
  // localStorage.
  const titleStorageKey = `cash_receipt_titles_${payroll.id || payroll.name}`;
  const [cycleTitleOverrides, setCycleTitleOverrides] = useState(() => {
    const fromPayroll = payroll?.cycleLabelOverrides;
    if (fromPayroll && Object.keys(fromPayroll).length > 0) return { ...fromPayroll };
    try { return JSON.parse(localStorage.getItem(titleStorageKey) || "{}"); } catch { return {}; }
  });
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printingDetail, setPrintingDetail] = useState(false);
  const [showCashEstimation, setShowCashEstimation] = useState(false);

  // Snapshot que se carga al abrir, para el detalle por trabajador (días
  // pagados por ciclo, como en Trabajadores). Sin snapshot, el detalle muestra
  // solo las 4 métricas básicas.
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  useEffect(() => {
    if (!payroll?.id) return;
    let cancelled = false;
    setSnapshotLoading(true);
    payrollSnapshotsService.getById(payroll.id)
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          const { id: _omit, ...rest } = doc;
          setSnapshot(rest);
        } else if (payroll.snapshot) {
          setSnapshot(payroll.snapshot);
        } else {
          setSnapshot(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("No se pudo cargar snapshot:", err);
          setSnapshot(payroll.snapshot || null);
        }
      })
      .finally(() => { if (!cancelled) setSnapshotLoading(false); });
    return () => { cancelled = true; };
  }, [payroll?.id]);

  // Lo que paga la nómina por ciclo y por labor. El monto de cada labor sale
  // de las jornadas del snapshot; sin snapshot quedan las jornadas y personas.
  const cycleBreakdown = useMemo(() => {
    const laborTypeById = new Map(cycles.flatMap((c) => (c.labors || []).map((l) => [l.id, l.type])));
    const workdayAmounts = new Map(
      (snapshot?.workdays || []).map((wd) => [wd.id, workdayPayAmount(wd, laborTypeById.get(wd.laborId))]),
    );
    return payrollCycleBreakdown({
      cycleDetails: payroll.cycleDetails || [],
      items: payroll.items || [],
      laborsOf: (cid) => cycles.find((c) => c.id === cid)?.labors || [],
      workdayAmounts,
    });
  }, [payroll.cycleDetails, payroll.items, cycles, snapshot]);

  // Lo marcado para sacar que sigue en la nómina, y su resumen para la barra
  // de abajo y la vista previa.
  const activeRemoval = new Map([...removal].filter(([cid]) => cycleBreakdown.some((c) => c.id === cid)));
  const removalSummary = removalSummaryOf(cycleBreakdown, activeRemoval);
  const startRecalc = () => computeRecalc(activeRemoval, removalSummary.lines);

  const toggleCycleRemoval = (cycleId) =>
    setRemoval((prev) => {
      const next = new Map(prev);
      if (next.get(cycleId) === true) next.delete(cycleId);
      else next.set(cycleId, true);
      return next;
    });
  // Destildar todas las labores de un ciclo es sacar el ciclo entero.
  const toggleLaborRemoval = (cycle, laborId) =>
    setRemoval((prev) => {
      const next = new Map(prev);
      const todas = cycle.labors.map((l) => l.id);
      const antes = prev.get(cycle.id);
      const fuera = new Set(antes === true ? todas : antes || []);
      if (fuera.has(laborId)) fuera.delete(laborId);
      else fuera.add(laborId);
      if (fuera.size === 0) next.delete(cycle.id);
      else if (todas.every((id) => fuera.has(id))) next.set(cycle.id, true);
      else next.set(cycle.id, fuera);
      return next;
    });

  const setCycleTitle = (cid, val) => {
    setCycleTitleOverrides((prev) => {
      const next = { ...prev };
      const trimmed = String(val || "").trim();
      // Vacío = restaurar default; no guardamos override.
      if (!trimmed) delete next[cid];
      else next[cid] = val;
      return next;
    });
  };

  // Guarda en Firestore 500 ms después del último cambio; localStorage queda
  // como espejo.
  useEffect(() => {
    if (!payroll?.id) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(titleStorageKey, JSON.stringify(cycleTitleOverrides)); } catch {
        /* noop */
      }
      payrollsService
        .update(payroll.id, { cycleLabelOverrides: cycleTitleOverrides })
        .catch((err) => console.warn("No se pudo guardar overrides:", err));
    }, 500);
    return () => clearTimeout(t);
  }, [cycleTitleOverrides, payroll?.id, titleStorageKey]);

  // Helper para mostrar el label con override aplicado.
  const displayCycleLabel = (cycle) =>
    cycleTitleOverrides[cycle.id] || cycle.label || cycle.id;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printCashReceipts(payroll, cashGroups, cycleTitleOverrides, catalogs, await getPayrollData(), rutOf);
    } catch (err) {
      toast.error(err?.message || "Error al imprimir");
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintDetail = async () => {
    setPrintingDetail(true);
    try {
      await printPaymentDetails(payroll, allGroups, cycleTitleOverrides, detailSummaries, catalogs, subfaenaSummary, await getPayrollData(), rutOf);
    } catch (err) {
      toast.error(err?.message || "Error al imprimir");
    } finally {
      setPrintingDetail(false);
    }
  };

  // Lo que se imprime y lo que se descarga de la nómina, en dos menús al pie.
  const printItems = [
    ...(allGroups.length > 0
      ? [{ icon: "📄", label: "Detalle de pago", hint: "Todos los trabajadores, sin firma.", disabled: printingDetail, onClick: () => handlePrintDetail() }]
      : []),
    ...(cashGroups.length > 0
      ? [{ icon: "💵", label: "Comprobantes efectivo", hint: "Una hoja por líder, para firmar.", disabled: printing, onClick: () => handlePrint() }]
      : []),
  ];
  const downloadItems = [
    { icon: "📥", label: "XLSX completo", hint: "Nómina, resumen, transferencias y efectivo.", onClick: () => onRedownload(payroll) },
    { icon: "🏦", label: "Sólo Nómina", hint: "La hoja del banco, para subir las transferencias.", onClick: () => onDownloadNominaOnly(payroll) },
    { divider: true },
    { icon: "{ }", label: "JSON", hint: "Toda la información para reconstruir la nómina.", onClick: () => onDownloadSnapshot(payroll) },
  ];

  // Imprime el detalle de pago de un solo grupo (un líder). `key` distingue
  // banco y efectivo del mismo líder en el estado de carga (ej. CHILENOS puede
  // tener gente en los dos).
  const handlePrintGroupDetail = async (group, key) => {
    const loadingKey = key || group.leader;
    setPrintingGroupLeader(loadingKey);
    try {
      await printPaymentDetails(payroll, [group], cycleTitleOverrides, [], catalogs, null, await getPayrollData(), rutOf);
    } catch (err) {
      toast.error(err?.message || "Error al imprimir grupo");
    } finally {
      setPrintingGroupLeader(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-2 py-3 sm:px-4 sm:py-6" onClick={onClose}>
      <div
        className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:max-h-[90vh] lg:max-w-6xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere] sm:text-lg">{payroll.name}</h2>
                <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${PAY_STATE_PILL[payStateOf(payroll)].cls}`}>
                  {PAY_STATE_PILL[payStateOf(payroll)].label}
                </span>
                {payroll.id === publishedPayrollId && <PortalBadge />}
                {payroll.classification === "diferencia" && (
                  <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] text-[var(--color-muted)]">
                    Diferencia
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                {cycleDetails.length > 0
                  ? cycleDetails.map((c) => displayCycleLabel(c)).join(" · ")
                  : (payroll.cycleLabels || []).join(" · ") || "—"}
              </p>
              {paymentDates(payroll).length > 0 && (
                <p className="mt-0.5 text-xs tabular-nums text-[var(--color-muted)]">
                  {paymentDates(payroll).map((d) => `${d.label} ${d.date}`).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onPublishPortal && (
                <button
                  type="button"
                  onClick={() => onPublishPortal(payroll)}
                  title="Publicar esta nómina en el portal de trabajadores: cada uno ve su detalle buscando su RUT"
                  className="min-h-8 whitespace-nowrap rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                >
                  🌐<span className="hidden sm:inline"> {payroll.id === publishedPayrollId ? "Actualizar en portal" : "Publicar en portal"}</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>
          {(cycleDetails.length > 0 || isPending) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cycleDetails.length > 0 && (
                <button
                  onClick={() => setShowTitleEditor((v) => !v)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    showTitleEditor
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                  }`}
                  title="Cambiar el nombre con el que cada ciclo aparece en XLSX, comprobantes y PDF"
                >
                  📝 Editar encabezados
                </button>
              )}
              {isPending && (
                <button
                  onClick={() => {
                    if (editMode) setRemoval(new Map());
                    else setCollapsedSections((prev) => new Set([...prev].filter((k) => k !== "cycles")));
                    setEditMode(!editMode);
                  }}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    editMode
                      ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                  }`}
                  title="Sacar trabajadores, ciclos o labores de esta nómina"
                >
                  {editMode ? "✕ Cerrar edición" : "✂ Editar contenido"}
                </button>
              )}
              {isPending && (
                <button
                  type="button"
                  disabled={recalcBusy}
                  onClick={startRecalc}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                  title="Volver a comparar contra la producción y los datos actuales de los trabajadores"
                >
                  {recalcBusy ? "Comparando..." : "🔄 Recalcular"}
                </button>
              )}
            </div>
          )}
        </div>
        {/* Barra de filtros fija, fuera del scroll, de borde a borde entre el
            encabezado y el cuerpo. Grupo y Ciclo van en un panel; lo que esté
            activo se ve igual, como etiquetas que se quitan con ✕. */}
        <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:px-5 sm:py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por RUT, nombre o líder"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
              />
            </div>
            <div className="inline-flex rounded-lg bg-[var(--color-surface-2)] p-0.5 text-xs" role="group" aria-label="Medio de pago">
              {[
                { v: "all", l: "Todos" },
                { v: "bank", l: "🏦 Banco" },
                { v: "cash", l: "💵 Efectivo" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setPaymentMethod(o.v)}
                  aria-pressed={paymentMethod === o.v}
                  className={`min-h-7 rounded-md px-2.5 py-1 ${
                    paymentMethod === o.v
                      ? "bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-sm"
                      : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {(allLeaders.length > 1 || cycleDetails.length > 1) && (
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className={`min-h-8 rounded-lg border px-2.5 py-1 text-xs ${
                  showFilters || moreFilterCount > 0
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                Filtros{moreFilterCount > 0 ? ` (${moreFilterCount})` : ""} {showFilters ? "▴" : "▾"}
              </button>
            )}
            <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-[var(--color-muted)]">
              <span>
                {hasActiveFilter ? `${filteredItems.length} de ${items.length}` : items.length} trabajador{items.length === 1 ? "" : "es"}
                {hasActiveFilter && (
                  <>
                    {" · "}
                    <b className="text-[var(--color-text)]">{fmtCurrency(filteredItems.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</b>
                  </>
                )}
              </span>
              {hasActiveFilter && (
                <button type="button" onClick={clearFilters} className="hover:text-[var(--color-danger)]">
                  Limpiar
                </button>
              )}
            </span>
          </div>
          {!showFilters && moreFilterCount > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {[...activeLeaderFilter].map((l) => (
                <FilterToken key={`g_${l}`} label={`Grupo: ${l}`} onRemove={() => toggleSetItem(setLeaderFilter, l)} />
              ))}
              {cycleDetails
                .filter((c) => activeCycleFilter.has(c.id))
                .map((c) => (
                  <FilterToken key={`c_${c.id}`} label={displayCycleLabel(c)} onRemove={() => toggleSetItem(setCycleFilter, c.id)} />
                ))}
            </div>
          )}
          {showFilters && (
            <div className="mt-2 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5">
              {allLeaders.length > 1 && (
                <FilterChips
                  label="Grupo"
                  options={allLeaders.map((g) => ({ id: g.leader, label: g.leader, count: g.count }))}
                  active={activeLeaderFilter}
                  onToggle={(id) => toggleSetItem(setLeaderFilter, id)}
                />
              )}
              {cycleDetails.length > 1 && (
                <FilterChips
                  label="Ciclo"
                  options={cycleDetails.map((c) => ({
                    id: c.id,
                    label: displayCycleLabel(c),
                    title: c.faenaName ? `${c.faenaName}${c.subfaenaName ? " / " + c.subfaenaName : ""}` : c.label,
                  }))}
                  active={activeCycleFilter}
                  onToggle={(id) => toggleSetItem(setCycleFilter, id)}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:space-y-5 sm:px-5 sm:py-4">
          {showTitleEditor && cycleDetails.length > 0 && (
            <section className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">📝 Encabezados de ciclo</h3>
                <button
                  onClick={() => setShowTitleEditor(false)}
                  className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
                >
                  ✕
                </button>
              </div>
              <p className="mb-3 text-[11px] text-[var(--color-muted)]">
                Personaliza cómo aparece cada ciclo en el XLSX, los comprobantes y el PDF de detalle.
                Dejar vacío para restaurar el nombre original. Los cambios se guardan automáticamente.
              </p>
              <div className="space-y-2">
                {cycleDetails.map((c) => {
                  const override = cycleTitleOverrides[c.id];
                  const hasOverride = !!override;
                  return (
                    <div key={c.id} className="flex items-center gap-2">
                      <label
                        className="w-44 shrink-0 truncate text-[11px] text-[var(--color-muted)]"
                        title={c.label}
                      >
                        {c.label}
                      </label>
                      <input
                        value={override ?? ""}
                        placeholder={c.label}
                        onChange={(e) => setCycleTitle(c.id, e.target.value)}
                        className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
                      />
                      {hasOverride && (
                        <button
                          onClick={() => setCycleTitle(c.id, "")}
                          className="rounded px-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                          title="Restaurar el nombre original"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Resumen — desglose general */}
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <button
              type="button"
              onClick={() => toggleSection("summary")}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-[var(--color-muted)]">{isCollapsed("summary") ? "▸" : "▾"}</span>
                <span>Resumen</span>
              </span>
              <span className="shrink-0 tabular-nums text-sm font-semibold text-[var(--color-accent)]">
                {fmtCurrency(payroll.total || 0)}
              </span>
            </button>
            {!isCollapsed("summary") && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">🏦 Transferencias</div>
                    <div className="text-lg font-semibold">{fmtCurrency(bankTotal)}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">{bank.length} persona(s)</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">💵 Efectivo</div>
                    <div className="text-lg font-semibold">{fmtCurrency(cashTotal)}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">{cash.length} persona(s) · {cashGroups.length} grupo(s)</div>
                    {cashPaidMode && (
                      <div
                        className="mt-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-warning)]"
                        title="Efectivo que todavía falta entregar. Las transferencias de esta nómina ya se pagaron."
                      >
                        Falta entregar: {fmtCurrency(owedCash)}
                      </div>
                    )}
                    {cash.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCashEstimation(true)}
                        title="Estimar cuántos billetes y monedas se necesitan para pagar el efectivo de esta nómina"
                        className="mt-1.5 flex min-h-8 w-full max-w-[220px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
                      >
                        🧮 Estimar efectivo
                      </button>
                    )}
                  </div>
                  {advanceTotal > 0 && (
                    <div>
                      <div className="text-xs text-[var(--color-muted)]">↩ Anticipos aplicados</div>
                      <div className="text-lg font-semibold text-[var(--color-warning)]">− {fmtCurrency(advanceTotal)}</div>
                      <div className="text-[10px] text-[var(--color-muted)]">Bruto: {fmtCurrency(grossTotal)}</div>
                    </div>
                  )}
                  {bonusTotal > 0 && (
                    <div>
                      <div className="text-xs text-[var(--color-muted)]">🎁 Bonos aplicados</div>
                      <div className="text-lg font-semibold text-[var(--color-success)]">+ {fmtCurrency(bonusTotal)}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">Total a pagar</div>
                    <div className="text-lg font-semibold text-[var(--color-accent)]">{fmtCurrency(payroll.total || 0)}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">{items.length} trabajador(es)</div>
                  </div>
                </div>

                {subfaenaSummary.rows.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
                        <button
                          type="button"
                          onClick={() => setSummaryShowLabor(false)}
                          className={`px-2.5 py-1.5 ${!summaryShowLabor ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
                        >
                          Sin labores
                        </button>
                        <button
                          type="button"
                          onClick={() => setSummaryShowLabor(true)}
                          className={`border-l border-[var(--color-border)] px-2.5 py-1.5 ${summaryShowLabor ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
                        >
                          Con labores
                        </button>
                      </div>
                      {pendingSummaryRows.length > 0 && (
                        <div
                          className="inline-flex overflow-hidden rounded-md border border-[var(--color-warning)] text-xs"
                          title="Efectivo que quedó debiendo de nóminas anteriores. Se entrega aparte, con su propio sobre."
                        >
                          {[
                            { v: "none", l: "Esta nómina", t: "Solo esta nómina, como siempre." },
                            { v: "with", l: "Con efectivo pendiente", t: "Esta nómina más el efectivo que se debe de antes." },
                            { v: "onlyPending", l: "Solo efectivo pendiente", t: "De todo el efectivo, hoy sale solo el pendiente: las transferencias de esta nómina más el efectivo que se debía de antes. El efectivo de esta nómina queda para la vuelta siguiente." },
                          ].map((o, i) => (
                            <button
                              key={o.v}
                              type="button"
                              onClick={() => setSummaryPending(o.v)}
                              title={o.t}
                              className={`px-2.5 py-1.5 ${i > 0 ? "border-l border-[var(--color-warning)]" : ""} ${
                                summaryPending === o.v
                                  ? "bg-[var(--color-warning)] text-white"
                                  : "bg-[var(--color-surface)] hover:bg-[var(--color-warning-soft)]"
                              }`}
                            >
                              {o.l}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <button
                          onClick={handleCopyResumenImage}
                          disabled={resumenBusy === "image" || !activeSummary}
                          title="Copiar como imagen"
                          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                        >
                          {resumenBusy === "image" ? "..." : "📋 Copiar"}
                        </button>
                        <button
                          onClick={handleDownloadResumenXlsx}
                          disabled={resumenBusy === "xlsx" || !activeSummary}
                          title="Descargar como Excel"
                          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                        >
                          {resumenBusy === "xlsx" ? "..." : "📥 Descargar"}
                        </button>
                        <button
                          onClick={handlePrintResumen}
                          disabled={!activeSummary}
                          title="Imprimir"
                          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                        >
                          🖨 Imprimir
                        </button>
                      </div>
                    </div>

                    {summaryShowLabor && laborSummaryLoading ? (
                      <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-muted)]">
                        Cargando desglose por labor…
                      </div>
                    ) : (
                      <div ref={resumenCaptureRef} className="rounded-md border border-[var(--color-border)]" style={{ background: "#fff" }}>
                      <div className="px-3 pt-2.5" style={{ color: "#222" }}>
                        <div className="text-sm font-semibold">{payroll.name}</div>
                        <div className="text-[11px]" style={{ color: "#666" }}>
                          Resumen {summaryShowLabor ? "por labor" : "por subfaena"}
                          {pendingMode === "with" && " · incluye efectivo pendiente de nóminas anteriores"}
                          {pendingMode === "onlyPending" && " · transferencias + solo el efectivo pendiente de antes"}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ color: "#222", borderCollapse: "collapse" }}>
                          <thead style={{ background: "#B7DEE8" }}>
                            <tr>
                              <th className="px-2 py-1.5 text-left">Faena</th>
                              <th className="px-2 py-1.5 text-left">Subfaena</th>
                              {summaryShowLabor && <th className="px-2 py-1.5 text-left">Labor</th>}
                              <th className="px-2 py-1.5 text-left">Período</th>
                              <th className="px-2 py-1.5 text-right">Transferencia</th>
                              <th className="px-2 py-1.5 text-right">Efectivo</th>
                              <th className="px-2 py-1.5 text-right">TOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summaryDisplayRows.map((entry, i) => {
                              if (entry.subtotal) {
                                return (
                                  <tr key={`sub_${i}`} style={{ background: "#F2F2F2", fontStyle: "italic", fontWeight: 700 }}>
                                    <td className="px-2 py-1 text-right" colSpan={summaryShowLabor ? 4 : 3} style={{ border: "1px solid #999" }}>Sub total por faena</td>
                                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(entry.subtotal.bank)}</td>
                                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(entry.subtotal.cash)}</td>
                                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(entry.subtotal.total)}</td>
                                  </tr>
                                );
                              }
                              const r = entry.row;
                              return (
                                <tr key={`row_${i}`}>
                                  <td className="px-2 py-1" style={{ border: "1px solid #999" }}>{entry.showLabel ? r.faenaName : ""}</td>
                                  {summaryShowLabor ? (
                                    <>
                                      <td className="px-2 py-1" style={{ border: "1px solid #999" }}>{entry.showLabel ? r.subfaenaName : ""}</td>
                                      <td className="px-2 py-1" style={{ border: "1px solid #999" }}>{r.laborName}</td>
                                    </>
                                  ) : (
                                    <td className="px-2 py-1" style={{ border: "1px solid #999" }}>{r.subfaenaName}</td>
                                  )}
                                  <td className="px-2 py-1" style={{ border: "1px solid #999", fontSize: 11, color: "#444" }}>{cyclesPeriod([...r.cycleIds])}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.bank)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.cash)}</td>
                                  <td className="px-2 py-1 text-right font-semibold tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.total)}</td>
                                </tr>
                              );
                            })}
                            {pendingMode !== "none" && pendingSummaryRows.map((r) => (
                              <tr key={`pend_${r.pendingId}`} style={{ background: "#FFF4E5" }}>
                                <td className="px-2 py-1" style={{ border: "1px solid #999" }}>—</td>
                                <td
                                  className="px-2 py-1"
                                  colSpan={summaryShowLabor ? 2 : 1}
                                  style={{ border: "1px solid #999" }}
                                >
                                  💵 Efectivo pendiente — {r.name}
                                  <span style={{ color: "#666", fontSize: 11 }}> · {r.count} pers.</span>
                                </td>
                                <td className="px-2 py-1" style={{ border: "1px solid #999", fontSize: 11, color: "#444" }}>
                                  {r.period ? `${fmtDayShortEs(r.period.first)} → ${fmtDayShortEs(r.period.last)}` : "—"}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(0)}</td>
                                <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.cash)}</td>
                                <td className="px-2 py-1 text-right font-semibold tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          {activeSummary && (
                            <tfoot>
                              {bonusAdvanceSummary.bonus.total > 0 && (
                                <tr style={{ background: "#EAF3FA" }}>
                                  <td colSpan={summaryShowLabor ? 4 : 3} className="px-2 py-1 text-right" style={{ border: "1px solid #999" }}>Bonos</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(bonusAdvanceSummary.bonus.bank)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(bonusAdvanceSummary.bonus.cash)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(bonusAdvanceSummary.bonus.total)}</td>
                                </tr>
                              )}
                              {bonusAdvanceSummary.advance.total > 0 && (
                                <tr style={{ background: "#EAF3FA" }}>
                                  <td colSpan={summaryShowLabor ? 4 : 3} className="px-2 py-1 text-right" style={{ border: "1px solid #999" }}>Anticipos</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(bonusAdvanceSummary.advance.bank)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(bonusAdvanceSummary.advance.cash)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(bonusAdvanceSummary.advance.total)}</td>
                                </tr>
                              )}
                              {deferredCash > 0 && (
                                <tr style={{ background: "#EAF3FA" }}>
                                  <td colSpan={summaryShowLabor ? 4 : 3} className="px-2 py-1 text-right" style={{ border: "1px solid #999" }}>
                                    Efectivo que queda pendiente
                                  </td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(0)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(deferredCash)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(deferredCash)}</td>
                                </tr>
                              )}
                              <tr style={{ background: "#FFE699", fontWeight: 700 }}>
                                <td colSpan={summaryShowLabor ? 4 : 3} className="px-2 py-1" style={{ border: "1px solid #999" }}>
                                  {pendingMode === "onlyPending" ? "TOTAL A PAGAR" : "TOTAL"}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(grandTotals.bank)}</td>
                                <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(grandTotals.cash)}</td>
                                <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(grandTotals.total)}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {cycleDetails.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleSection("cycles")}
                  className="flex flex-1 items-center gap-2 text-left text-sm font-semibold hover:text-[var(--color-accent)]"
                >
                  <span className="text-[var(--color-muted)]">{isCollapsed("cycles") ? "▸" : "▾"}</span>
                  <span>Ciclos de esta nómina</span>
                  <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-normal tabular-nums text-[var(--color-muted)]">
                    {cycleDetails.length}
                  </span>
                </button>
                {editMode && isPending && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={editBusy}
                      onClick={() => setAddWorkerOpen(true)}
                      className="min-h-[32px] rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:opacity-80 disabled:opacity-50 sm:min-h-0"
                      title="Sumar días puntuales de una persona, de cualquier ciclo abierto"
                    >
                      + Agregar persona
                    </button>
                    <button
                      type="button"
                      disabled={editBusy}
                      onClick={() => setAddCyclesOpen(true)}
                      className="min-h-[32px] rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 text-[10px] text-[var(--color-accent)] hover:opacity-80 disabled:opacity-50 sm:min-h-0"
                      title="Agregar otro ciclo, o las labores que le faltan a uno que ya está"
                    >
                      + Agregar ciclo
                    </button>
                  </div>
                )}
              </div>
              {!isCollapsed("cycles") && (
                <>
                  {editMode && (
                    <p className="mb-1.5 text-[11px] text-[var(--color-muted)]">
                      Destilda los ciclos o labores que quieras sacar y aprieta "Recalcular sin esto". Quien se queda sin
                      producción sale de la nómina, y lo que ya no alcance de sus anticipos vuelve a quedar pendiente.
                    </p>
                  )}
                  <ul className="grid gap-2 text-sm">
                    {cycleBreakdown.map((c) => {
                      const r = activeRemoval.get(c.id);
                      const cycleOut = r === true;
                      const partial = r instanceof Set;
                      const Head = editMode ? "label" : "div";
                      return (
                        <li
                          key={c.id}
                          className={`overflow-hidden rounded-lg border bg-[var(--color-surface)] shadow-sm ${
                            r ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
                          }`}
                        >
                          <Head className={`flex items-start gap-2.5 px-3 py-2.5 ${editMode ? "cursor-pointer" : ""}`}>
                            {editMode && (
                              <input
                                type="checkbox"
                                checked={!cycleOut}
                                ref={(el) => {
                                  if (el) el.indeterminate = partial;
                                }}
                                onChange={() => toggleCycleRemoval(c.id)}
                                disabled={editBusy || recalcBusy}
                                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                              />
                            )}
                            <div className={`min-w-0 flex-1 ${cycleOut ? "line-through opacity-60" : ""}`}>
                              <div className="font-medium [overflow-wrap:anywhere]">{c.label}</div>
                              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
                                {c.faenaName && (
                                  <span>
                                    {c.faenaName}
                                    {c.subfaenaName ? ` / ${c.subfaenaName}` : ""}
                                  </span>
                                )}
                                {(c.firstDay || c.lastDay) && (
                                  <span className="tabular-nums">
                                    📅 {fmtDayShortEs(c.firstDay) || "?"}
                                    {c.lastDay && c.firstDay !== c.lastDay ? ` → ${fmtDayShortEs(c.lastDay)}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className={`font-semibold tabular-nums ${cycleOut ? "line-through opacity-60" : ""}`}>
                                {fmtCurrency(c.amount)}
                              </span>
                              <Link
                                to={`/cycles/${c.id}`}
                                title="Abrir el ciclo (Ctrl+clic: en otra pestaña)"
                                className="whitespace-nowrap text-xs text-[var(--color-accent)] hover:underline"
                              >
                                Abrir ciclo ↗
                              </Link>
                            </div>
                          </Head>
                          {c.labors.length > 0 && (editMode || c.labors.length > 1 || Array.isArray(c.laborIds)) && (
                            <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3">
                              {c.labors.map((l) => {
                                const out = cycleOut || (partial && r.has(l.id));
                                const Row = editMode ? "label" : "div";
                                return (
                                  <li key={l.id}>
                                    <Row className={`flex min-h-8 items-center gap-2 text-xs ${editMode ? "cursor-pointer" : ""}`}>
                                      {editMode && (
                                        <input
                                          type="checkbox"
                                          checked={!out}
                                          onChange={() => toggleLaborRemoval(c, l.id)}
                                          disabled={editBusy || recalcBusy}
                                          className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                                        />
                                      )}
                                      <span className={`min-w-0 flex-1 truncate ${out ? "line-through text-[var(--color-muted)]" : ""}`}>
                                        {l.name}
                                        {!l.inScope && (
                                          <span
                                            className="ml-1 text-[10px] text-[var(--color-muted)]"
                                            title="Recalcular no trae más de esta labor: solo están los días que se agregaron a mano."
                                          >
                                            · días agregados a mano
                                          </span>
                                        )}
                                      </span>
                                      <span className="shrink-0 tabular-nums text-[var(--color-muted)]">
                                        {l.jornadas > 0 ? `${l.people} pers. · ${l.jornadas} jorn.` : "sin jornadas"}
                                      </span>
                                      <span className={`w-24 shrink-0 text-right tabular-nums ${out ? "line-through text-[var(--color-muted)]" : ""}`}>
                                        {l.amount == null ? "—" : fmtCurrency(l.amount)}
                                      </span>
                                    </Row>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {editMode && activeRemoval.size > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div>
                          Sacas{" "}
                          {[
                            removalSummary.cyclesOut ? `${removalSummary.cyclesOut} ciclo${removalSummary.cyclesOut === 1 ? "" : "s"}` : "",
                            removalSummary.laborsOut ? `${removalSummary.laborsOut} labor${removalSummary.laborsOut === 1 ? "" : "es"}` : "",
                          ]
                            .filter(Boolean)
                            .join(" y ")}{" "}
                          · <b className="tabular-nums">{removalSummary.unknown ? "más de " : ""}{fmtCurrency(removalSummary.amount)}</b> de bruto
                        </div>
                        {removalSummary.allOut && (
                          <div className="mt-0.5 font-medium text-[var(--color-danger)]">
                            Eso deja la nómina vacía: para sacar todo, elimina la nómina.
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRemoval(new Map())}
                        disabled={recalcBusy}
                        className="min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 disabled:opacity-50"
                      >
                        Deshacer
                      </button>
                      <button
                        type="button"
                        onClick={startRecalc}
                        disabled={recalcBusy || removalSummary.allOut}
                        className="min-h-8 rounded-md bg-[var(--color-accent)] px-2.5 py-1 font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
                      >
                        {recalcBusy ? "Comparando…" : "🔄 Recalcular sin esto"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {filteredBankGroups.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">🏦 Banco agrupado por líder ({filteredBank.length}{filteredBank.length !== bank.length ? `/${bank.length}` : ""})</h3>
                <span className="text-xs font-normal tabular-nums text-[var(--color-muted)]">
                  {fmtCurrency(filteredBank.reduce((s, x) => s + (Number(x.amount) || 0), 0))}
                </span>
              </div>
              <div className="space-y-2">
                {filteredBankGroups.map((g) => {
                  const sectionKey = `bank_${g.leader}`;
                  const collapsed = isCollapsed(sectionKey);
                  const groupKey = `bank:${g.leader}`;
                  return (
                    <div key={g.leader} className="rounded border border-[var(--color-border)]">
                      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleSection(sectionKey)}
                          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
                        >
                          <span>{collapsed ? "▸" : "▾"}</span>
                          <span className="font-medium">{g.leader}</span>
                          <span className="text-[10px] text-[var(--color-muted)]">· {g.items.length} pers.</span>
                        </button>
                        <span className="font-semibold tabular-nums">{fmtCurrency(g.total)}</span>
                        <button
                          type="button"
                          disabled={printingGroupLeader === groupKey}
                          onClick={() => handlePrintGroupDetail(g, groupKey)}
                          title="Imprimir el detalle de pago solo para este grupo de transferencias"
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                        >
                          {printingGroupLeader === groupKey ? "..." : "🖨 Imprimir"}
                        </button>
                      </div>
                      {!collapsed && (
                        isMobile ? (
                          <div className="divide-y divide-[var(--color-border)]">
                            {g.items.map((it) => (
                              <WorkerDetailRow
                                key={it.rut}
                                rutOf={rutOf}
                                item={it}
                                expanded={expandedRut === it.rut}
                                onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                onShowSummary={() => setWorkerSummaryFor(it)}
                                cycleDetails={cycleDetails}
                                displayCycleLabel={displayCycleLabel}
                                editMode={editMode}
                                editBusy={editBusy}
                                onRemoveWorker={handleRemoveWorker}
                                cols="bank"
                                snapshot={snapshot}
                                snapshotLoading={snapshotLoading}
                                catalogs={catalogs}
                                isMobile
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-sm sm:min-w-0">
                            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                              <tr>
                                <th className="px-2 py-1 w-4"></th>
                                <th className="px-2 py-1">RUT</th>
                                <th className="px-2 py-1">Nombre</th>
                                <th className="px-2 py-1">Banco</th>
                                <th className="px-2 py-1">Cuenta</th>
                                <th className="px-2 py-1">Tipo</th>
                                <th className="px-2 py-1 text-right">Monto</th>
                                {editMode && <th className="px-2 py-1"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {g.items.map((it) => (
                                <WorkerDetailRow
                                  key={it.rut}
                                  rutOf={rutOf}
                                  item={it}
                                  expanded={expandedRut === it.rut}
                                  onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                  onShowSummary={() => setWorkerSummaryFor(it)}
                                  cycleDetails={cycleDetails}
                                  displayCycleLabel={displayCycleLabel}
                                  editMode={editMode}
                                  editBusy={editBusy}
                                  onRemoveWorker={handleRemoveWorker}
                                  cols="bank"
                                  snapshot={snapshot}
                                  snapshotLoading={snapshotLoading}
                                  catalogs={catalogs}
                                />
                              ))}
                            </tbody>
                          </table>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {filteredCashGroups.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">💵 Efectivo agrupado por líder ({filteredCash.length}{filteredCash.length !== cash.length ? `/${cash.length}` : ""})</h3>
                <span className="text-xs font-normal tabular-nums text-[var(--color-muted)]">
                  {fmtCurrency(filteredCash.reduce((s, x) => s + (Number(x.amount) || 0), 0))}
                </span>
              </div>
              <div className="space-y-2">
                {filteredCashGroups.map((g) => {
                  const sectionKey = `cash_${g.leader}`;
                  const collapsed = isCollapsed(sectionKey);
                  const groupKey = `cash:${g.leader}`;
                  return (
                    <div key={g.leader} className="rounded border border-[var(--color-border)]">
                      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleSection(sectionKey)}
                          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
                        >
                          <span>{collapsed ? "▸" : "▾"}</span>
                          <span className="font-medium">{g.leader}</span>
                          <span className="text-[10px] text-[var(--color-muted)]">· {g.items.length} pers.</span>
                        </button>
                        <span className="font-semibold tabular-nums">{fmtCurrency(g.total)}</span>
                        {cashPaidMode && (() => {
                          const allPaid = g.items.every((it) => cashPaidSet.has(it.rut));
                          return (
                            <button
                              type="button"
                              onClick={() => setGroupCashPaid(g.items, !allPaid)}
                              title={allPaid
                                ? "Desmarcar a todo el grupo"
                                : "Marcar que todo el grupo ya cobró su efectivo"}
                              className={`rounded-md border px-2 py-0.5 text-[10px] ${
                                allPaid
                                  ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                              }`}
                            >
                              {allPaid ? "✓ cobró todo" : "○ marcar grupo"}
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={printingGroupLeader === groupKey}
                          onClick={() => handlePrintGroupDetail(g, groupKey)}
                          title="Imprimir el detalle de pago solo para este grupo (mismo formato que el comprobante en efectivo)"
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                        >
                          {printingGroupLeader === groupKey ? "..." : "🖨 Imprimir"}
                        </button>
                      </div>
                      {!collapsed && (
                        isMobile ? (
                          <div className="divide-y divide-[var(--color-border)]">
                            {g.items.map((it) => (
                              <WorkerDetailRow
                                key={it.rut}
                                rutOf={rutOf}
                                item={it}
                                expanded={expandedRut === it.rut}
                                onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                onShowSummary={() => setWorkerSummaryFor(it)}
                                cycleDetails={cycleDetails}
                                displayCycleLabel={displayCycleLabel}
                                editMode={editMode}
                                editBusy={editBusy}
                                onRemoveWorker={handleRemoveWorker}
                                cols="cash"
                                cashPaidMode={cashPaidMode}
                                cashPaid={cashPaidSet.has(it.rut)}
                                onToggleCashPaid={toggleCashPaid}
                                snapshot={snapshot}
                                snapshotLoading={snapshotLoading}
                                catalogs={catalogs}
                                isMobile
                              />
                            ))}
                          </div>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody>
                              {g.items.map((it) => (
                                <WorkerDetailRow
                                  key={it.rut}
                                  rutOf={rutOf}
                                  item={it}
                                  expanded={expandedRut === it.rut}
                                  onToggle={() => setExpandedRut((cur) => cur === it.rut ? null : it.rut)}
                                  onShowSummary={() => setWorkerSummaryFor(it)}
                                  cycleDetails={cycleDetails}
                                  displayCycleLabel={displayCycleLabel}
                                  editMode={editMode}
                                  editBusy={editBusy}
                                  onRemoveWorker={handleRemoveWorker}
                                  cols="cash"
                                  cashPaidMode={cashPaidMode}
                                  cashPaid={cashPaidSet.has(it.rut)}
                                  onToggleCashPaid={toggleCashPaid}
                                  snapshot={snapshot}
                                  snapshotLoading={snapshotLoading}
                                  catalogs={catalogs}
                                />
                              ))}
                            </tbody>
                          </table>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border)] px-3 py-2.5 sm:px-5">
          <div className="min-w-0 text-sm">
            <span className="text-[var(--color-muted)]">Total </span>
            <span className="font-semibold tabular-nums">{fmtCurrency(payroll.total || 0)}</span>
            <span className="ml-1 hidden text-xs text-[var(--color-muted)] sm:inline">
              · {items.length} trabajador{items.length === 1 ? "" : "es"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {printItems.length > 0 && (
              <RowMenu
                items={printItems}
                trigger={printing || printingDetail ? "Preparando…" : "🖨 Imprimir ▾"}
                triggerLabel="Imprimir"
                triggerClassName="min-h-9 shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-accent-soft)] sm:px-4"
              />
            )}
            <RowMenu
              items={downloadItems}
              trigger="📥 Descargar ▾"
              triggerLabel="Descargar"
              triggerClassName="min-h-9 shrink-0 whitespace-nowrap rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:opacity-90 sm:px-4"
            />
          </div>
        </div>
      </div>
      <WorkerSummaryModal
        open={!!workerSummaryFor}
        worker={
          workerSummaryFor
            ? {
                // El item trae el id estable en `workerId` y el rut del roster
                // en `rut`; el resumen se abre con el id.
                id: workerSummaryFor.workerId || workerSummaryFor.rut,
                rut: workerSummaryFor.rut,
                name: workerSummaryFor.name,
              }
            : null
        }
        onClose={() => setWorkerSummaryFor(null)}
      />
      {showCashEstimation && (
        <CashEstimationModal
          cashItems={cashPaidMode ? cash.filter((it) => !cashPaidSet.has(it.rut)) : cash}
          payrollName={payroll.name}
          pendingExtra={otherPendingCash}
          onClose={() => setShowCashEstimation(false)}
        />
      )}
      {addCyclesOpen && (
        <AddCyclesModal
          onClose={() => setAddCyclesOpen(false)}
          cycles={cycles}
          faenas={faenas}
          subfaenas={subfaenas}
          payrollCycleDetails={cycleDetails}
          payrollCycleIds={payroll.cycleIds || []}
          onConfirm={handleAddCycles}
          busy={editBusy}
        />
      )}
      {addWorkerOpen && (
        <AddWorkerDaysModal
          onClose={() => setAddWorkerOpen(false)}
          payroll={payroll}
          items={items}
          workers={workers}
          cycles={cycles}
          allPayrolls={allPayrolls}
          profileFor={liveProfileOf}
          onConfirm={handleAddWorkerDays}
          busy={editBusy}
        />
      )}
      <RecalcModal
        preview={recalcPreview}
        busy={recalcBusy}
        onClose={() => setRecalcPreview(null)}
        onConfirm={applyRecalc}
      />
      <ConfirmDialog
        open={!!confirmRemove}
        title="Sacar trabajador de la nómina"
        message={confirmRemove?.message || ""}
        confirmLabel="Sacar"
        danger
        onCancel={() => setConfirmRemove(null)}
        onConfirm={confirmRemoveAction}
      />
    </div>
  );
}

// Lo que pasó con la plata al agregar algo a una nómina, para el aviso.
function additionSummary(lead, added = []) {
  const parts = [lead];
  const newCount = added.filter((x) => x.isNew).length;
  const existingCount = added.length - newCount;
  if (newCount) parts.push(`${newCount} trabajador(es) nuevo(s).`);
  if (existingCount) parts.push(`${existingCount} ya estaba(n) y suma(n) producción.`);
  const advances = added.reduce((s, x) => s + (x.anticipos || 0), 0);
  const bonuses = added.reduce((s, x) => s + (x.bonos || 0), 0);
  if (advances > 0) parts.push(`Se descuentan ${fmtCurrency(advances)} de anticipos pendientes.`);
  if (bonuses > 0) parts.push(`Se suman ${fmtCurrency(bonuses)} de bonos pendientes.`);
  return parts.join(" ");
}
