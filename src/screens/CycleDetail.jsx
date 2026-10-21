import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import {
  qrPrefixesService,
  workersService,
  groupLeadersService,
} from "../services";
import { AG_GRID_LOCALE_ES } from "../utils/agGridLocale";
import {
  workdayMapKey,
  getDaySingle,
} from "../utils/cosechaCombos";
import {
  normalizeStages,
} from "../utils/tratoEtapas";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import WorkerPickerModal from "./cycleDetail/WorkerPickerModal";
import WorkerEditModal from "../components/WorkerEditModal";
import TransportsModal from "../components/TransportsModal";
import CycleWorkerList from "./cycleDetail/CycleWorkerList";
import CycleWorkerEditModal from "./cycleDetail/CycleWorkerEditModal";
import CycleSummaryModal from "./cycleDetail/CycleSummaryModal";
import { qrLockedLaborsOf } from "../utils/harvestSync";
import { currentRutResolver } from "../utils/workerRut";
import {
  peopleByDateOf,
  daysWithFloorOf,
  dayCombosOf,
  dayTiersOf,
  dayStagesOf,
  orphanWorkersOf,
  laborAmountTotals,
  harvestQtyByContainer,
  laborQtyTotals,
  stagesDaySummaryOf,
  pieceworkPeopleCounts,
  floorMetricsOf,
  overtimeDayMetricsOf,
  harvestQtyByDayCombo,
  pieceworkTierMetricsOf,
} from "../utils/cycleMetrics";
import { fmtCurrency } from "../utils/format";
import { AddComboModal } from "./cycleDetail/AddComboModal";
import { BonusEditModal } from "./cycleDetail/BonusEditModal";
import { CatalogsModal } from "./cycleDetail/CatalogsModal";
import { DayModeModal } from "./cycleDetail/DayModeModal";
import { DefaultLeadersModal } from "./cycleDetail/DefaultLeadersModal";
import { GroupHeaderRowRenderer } from "./cycleDetail/GroupHeaderRowRenderer";
import { LeaderPickerModal } from "./cycleDetail/LeaderPickerModal";
import {
  buildRowsHarvest,
  buildRowsPiecework,
  buildRowsPieceworkStages,
  buildRowsOvertimeDay,
  buildRowsNormal,
  SINGLE_COMBO,
} from "./cycleDetail/rows";
import { CycleDetailContext } from "./cycleDetail/CycleDetailContext";
import { CycleHeader } from "./cycleDetail/CycleHeader";
import { CycleTitleBar } from "./cycleDetail/CycleTitleBar";
import { LaborMetrics } from "./cycleDetail/LaborMetrics";
import { LaborTabs } from "./cycleDetail/LaborTabs";
import { LaborToolbar } from "./cycleDetail/LaborToolbar";
import { PricesPanel } from "./cycleDetail/PricesPanel";
import { GridToolbar } from "./cycleDetail/GridToolbar";
import { DayNoteModal } from "./cycleDetail/DayNoteModal";
import { AddPriceModal } from "./cycleDetail/AddPriceModal";
import { AddDaysModal } from "./cycleDetail/AddDaysModal";
import { LaborFormModal } from "./cycleDetail/LaborFormModal";
import { CycleConfirmDialogs } from "./cycleDetail/CycleConfirmDialogs";
import { MonthlyConfirmModal } from "./cycleDetail/MonthlyConfirmModal";
import { buildColumnDefs } from "./cycleDetail/columns";
import { useCollapsedSections } from "./cycleDetail/useCollapsedSections";
import { useSiblingCycles } from "./cycleDetail/useSiblingCycles";
import { useLeaderGrouping } from "./cycleDetail/useLeaderGrouping";
import { useCycleWriteGuard } from "./cycleDetail/useCycleWriteGuard";
import { useCycleLoader } from "./cycleDetail/useCycleLoader";
import { useDayPrices } from "./cycleDetail/useDayPrices";
import { useFloorBonus } from "./cycleDetail/useFloorBonus";
import { useCellEdits } from "./cycleDetail/useCellEdits";
import { useLaborWorkers } from "./cycleDetail/useLaborWorkers";
import { useCycleDays } from "./cycleDetail/useCycleDays";
import { useDayNotes } from "./cycleDetail/useDayNotes";
import { useLaborForm } from "./cycleDetail/useLaborForm";
import { useCycleClosing } from "./cycleDetail/useCycleClosing";
import { useCycleTransports } from "./cycleDetail/useCycleTransports";
import { useEmploymentFilter } from "./cycleDetail/useEmploymentFilter";
import ScreenLoader from "../components/ScreenLoader";
import { WORKERS_LIST } from "../services/workersService";

ModuleRegistry.registerModules([AllCommunityModule]);

export default function CycleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { catalogs, addEntry: addCatalogEntry, renameEntry: renameCatalogEntry } = useCatalogs();
  const toast = useToast();
  const { user } = useAuth();

  const {
    activeLaborId,
    cycle,
    dayPrices,
    job,
    laborGroups,
    loading,
    setActiveLaborId,
    setCycle,
    setDayPrices,
    setLaborGroups,
    setWorkdaysByLabor,
    subjob,
    workdaysByLabor,
    workdaysRef,
  } = useCycleLoader({ id });

  // Prefijos QR apuntados a este ciclo. Ver `qrLockedLabors` más abajo.
  const [qrPrefixes, setQrPrefixes] = useState([]);

  // Modal para agregar un precio (tier) a un día de trato.
  const [addPriceModal, setAddPriceModal] = useState(null);
  // forma: { laborId, date, nextKey, defaultMode, value }
  const [addPriceBusy, setAddPriceBusy] = useState(false);

  const {
    metricsCollapsed,
    pricesCollapsed,
    setMetricsCollapsed,
    setPricesCollapsed,
    setToolbarCollapsed,
    toolbarCollapsed,
  } = useCollapsedSections();

  // Edición rápida del trabajador desde la grilla — doble click en la
  // columna RUT abre el mismo modal del módulo de Trabajadores. No aplica
  // a temporales (no existen como doc en `worker`).
  const [editingWorkerRut, setEditingWorkerRut] = useState(null);

  // En mobile se muestra la lista de trabajadores (CycleWorkerList) en vez de
  // la grilla, que obliga a desplazarse por decenas de columnas de día. Este
  // toggle muestra la grilla completa.
  const [showDesktopGrid, setShowDesktopGrid] = useState(false);
  // Modal mobile: edita un trabajador a la vez (una fila por día). Se cierra
  // al cambiar de labor, donde ese rut puede no existir.
  const [editingCycleWorkerRut, setEditingCycleWorkerRut] = useState(null);
  const [copyToast, setCopyToast] = useState("");

  const [catalogsOpen, setCatalogsOpen] = useState(false);
  const [defaultLeadersOpen, setDefaultLeadersOpen] = useState(false);
  const [overtimeDayView, setOvertimeDayView] = useState("detalle"); // "detalle" | "resumen"
  const [harvestView, setHarvestView] = useState("detalle"); // "detalle" | "resumen"
  const [pieceworkView, setPieceworkView] = useState("detalle"); // "detalle" | "resumen"
  const [transportsOpen, setTransportsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [groupView, setGroupView] = useState(() => {
    try { return localStorage.getItem("cycleDetail.groupView") === "group" ? "group" : "all"; }
    catch { return "all"; }
  });
  const [allWorkers, setAllWorkers] = useState([]);
  const [enabledLeaders, setEnabledLeaders] = useState([]);
  const [groupBusy, setGroupBusy] = useState(false);
  // Oculta de la grilla a los trabajadores con $0 en esta labor. Se ignora
  // mientras haya un filtro de columna activo (ver isExternalFilterPresent /
  // doesExternalFilterPass), así una búsqueda también encuentra a quien está
  // en $0.
  const [onlyWithProduction, setOnlyWithProduction] = useState(false);
  const [columnFilterActive, setColumnFilterActive] = useState(false);

  const gridRef = useRef(null);
  // Modo mobile (<768px): oculta la columna RUT y angosta las columnas para
  // que entren más días en pantalla.
  const isMobile = useIsMobile();
  // El toggle Detalle/Resumen solo cambia columnas de la grilla, así que se
  // oculta mientras la grilla no se ve (mobile con CycleWorkerList).
  const gridVisible = !isMobile || showDesktopGrid;

  const { closed, cycleWrite, readOnly, wdWrite } = useCycleWriteGuard({ cycle, id, toast });

  // Prefijos QR (`qrPrefixes`): pocos documentos que cambian poco, en caché
  // persistida con TTL de 1 h. Dicen qué labores alimenta la app de escaneo
  // antes de que llegue el primer pesaje.
  useEffect(() => {
    qrPrefixesService
      .list({ order: ["label", "asc"], cache: true, persist: true, ttl: 60 * 60 * 1000 })
      .then(setQrPrefixes)
      .catch(() => { /* si falla, la pantalla sigue sin el candado QR */ });
  }, []);

  // laborId → prefijo QR que la sincroniza. La sincronización pisa `qty` y
  // `amount`, así que esas celdas se bloquean (ver utils/harvestSync.js).
  const qrLockedLabors = useMemo(
    () => qrLockedLaborsOf(qrPrefixes, cycle?.id),
    [qrPrefixes, cycle?.id],
  );

  const qrPrefixForActive = activeLaborId ? qrLockedLabors.get(activeLaborId) : null;
  const qrLocked = !!qrPrefixForActive;

  const { nextCycle, prevCycle } = useSiblingCycles({ cycle, id });

  const loadAllWorkers = async () => {
    const list = await workersService.list(WORKERS_LIST);
    setAllWorkers(list);
  };

  const loadEnabledLeaders = async () => {
    const list = await groupLeadersService.list({
      cache: true,
      persist: true,
      ttl: 24 * 60 * 60 * 1000,
    });
    const names = list
      .filter((d) => d.habilitado === true)
      .map((d) => String(d.name || d.nombre || d.id || "").trim().toUpperCase())
      .filter(Boolean);
    const dedup = [...new Set(names)].sort();
    setEnabledLeaders(dedup);
  };

  useEffect(() => {
    loadAllWorkers();
    loadEnabledLeaders();
  }, []);

  useEffect(() => {
    try { localStorage.setItem("cycleDetail.groupView", groupView); } catch { /* ignore */ }
  }, [groupView]);

  const rutToLeader = useMemo(() => {
    const m = new Map();
    for (const w of allWorkers) {
      const l = String(w.groupLeader?.[0] || "").trim().toUpperCase();
      if (l) m.set(w.id, l);
    }
    // Los temporales solo existen en labor.workers y guardan el líder como
    // string, no como el array del doc del trabajador. Se recorren todas las
    // labores para que el mapa sirva al cambiar de labor activa.
    for (const labor of cycle?.labors || []) {
      for (const w of labor.workers || []) {
        if (!w?.isTemp) continue;
        const l = String(w.groupLeader || "").trim().toUpperCase();
        if (l) m.set(w.rut, l);
      }
    }
    return m;
  }, [allWorkers, cycle]);

  // Nombre vigente de cada trabajador según la caché de trabajadores. Las
  // filas lo usan para reflejar los cambios de nombre hechos en Trabajadores
  // sin reescribir la copia en `labor.workers[i].name`.
  const rutToName = useMemo(() => {
    const m = new Map();
    for (const w of allWorkers) {
      if (w?.name) m.set(w.id, w.name);
    }
    return m;
  }, [allWorkers]);

  const activeLabor = useMemo(
    () => cycle?.labors?.find((l) => l.id === activeLaborId) || cycle?.labors?.[0] || null,
    [cycle, activeLaborId],
  );

  useEffect(() => {
    setEditingCycleWorkerRut(null);
  }, [activeLabor?.id]);

  const isHarvestLabor = activeLabor?.type === "cosecha";
  const isPieceworkLabor = activeLabor?.type === "trato";
  const isPieceworkStagesLabor = activeLabor?.type === "tratoEtapas";
  const isOvertimeDayLabor = activeLabor?.type === "tratoHE";
  const isQtyLabor = isHarvestLabor || isPieceworkLabor || isPieceworkStagesLabor || isOvertimeDayLabor;
  // Etapas de la labor por etapas (fijas, no por día), normalizadas.
  const activeStages = useMemo(
    () => (isPieceworkStagesLabor ? normalizeStages(activeLabor?.stages) : []),
    [isPieceworkStagesLabor, activeLabor],
  );
  // Labores que pagan un monto por día por trabajador (main/supervision/extra).
  // No usan combos ni tiers — un único precio sugerido por día se persiste en
  // dayPrices y aparece como hint clickeable en la celda del trabajador.
  const isNormalLabor = !!activeLabor && !isQtyLabor;
  // Labores donde un trabajador puede ser de sueldo mensual: sus días pasan a
  // casillas de asistencia en $0.
  const allowsMonthly = isNormalLabor || isOvertimeDayLabor;
  const days = cycle?.days || [];
  const { employmentFilter, setEmploymentFilter, employmentPass, employmentLoading, employers } = useEmploymentFilter(days);
  const workers = activeLabor?.workers || [];
  const wdMap = (activeLabor && workdaysByLabor[activeLabor.id]) || {};
  const shownLaborId = activeLabor?.id;
  const peopleByDate = useMemo(() => peopleByDateOf(workdaysByLabor, shownLaborId), [workdaysByLabor, shownLaborId]);
  // Fechas con al menos un workday de esta labor. El ciclo comparte `days`
  // entre todas sus labores; esto acota en qué fechas se ofrece anotar.
  const activeLaborDatesWithProduction = new Set(
    Object.keys(wdMap).map((k) => k.split("__")[1]),
  );
  const defaultMode = activeLabor?.cosechaMode || activeLabor?.tratoMode || "unit";

  // `workerId` que se graba en cada workday junto a `workerRut`: el `id` de la
  // entrada del roster de la labor con ese rut, o el mismo rut si la entrada
  // no tiene `id` (ver docs/data-model.md).
  const workerIdFor = (laborId, rut) => {
    const labor = cycle?.labors?.find((l) => l.id === laborId);
    return labor?.workers?.find((w) => w.rut === rut)?.id || rut;
  };

  const daysWithFloor = useMemo(() => daysWithFloorOf(activeLabor, isHarvestLabor, isPieceworkLabor, dayPrices, wdMap), [activeLabor, isHarvestLabor, isPieceworkLabor, dayPrices, wdMap]);

  const dayCombosByDate = useMemo(() => dayCombosOf(isHarvestLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor), [isHarvestLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor]);

  const dayTiersByDate = useMemo(() => dayTiersOf(isPieceworkLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor), [isPieceworkLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor]);

  const dayStagesByDate = useMemo(() => dayStagesOf(isPieceworkStagesLabor, activeLabor, days, dayPrices, workdaysByLabor), [isPieceworkStagesLabor, activeLabor, days, dayPrices, workdaysByLabor]);

  const {
    activeLaborDayNotes,
    closeDayNote,
    dayHasContent,
    dayNoteBusy,
    dayNoteDirty,
    editingDayNote,
    editingDayNoteText,
    goToDayNote,
    hasNextDayNote,
    hasPrevDayNote,
    legacyDayNotes,
    noteForDay,
    openDayNote,
    saveDayNote,
    setEditingDayNoteText,
  } = useDayNotes({
    activeLabor,
    activeLaborDatesWithProduction,
    cycle,
    cycleWrite,
    days,
    setCycle,
  });

  // Nombre vigente de cada trabajador según la caché; si no está, el guardado
  // en labor.workers (temporales, o mientras carga la caché).
  const resolvedWorkers = useMemo(
    () => workers.map((w) => (w?.isTemp ? w : { ...w, name: rutToName.get(w.rut) || w.name })),
    [workers, rutToName],
  );

  const orphanWorkers = useMemo(() => orphanWorkersOf(activeLabor, workers, wdMap, rutToName), [activeLabor, workers, wdMap, rutToName]);

  const gridWorkers = useMemo(
    () => [...resolvedWorkers, ...orphanWorkers],
    [resolvedWorkers, orphanWorkers],
  );

  // Rut vigente de la ficha, para mostrar: la fila se identifica por el rut
  // guardado en la labor (ver utils/workerRut.js).
  const rutOf = useMemo(() => currentRutResolver(allWorkers), [allWorkers]);
  const rowDataRaw = useMemo(() => {
    let rows;
    if (isHarvestLabor) rows = buildRowsHarvest(gridWorkers, days, wdMap, dayCombosByDate);
    else if (isPieceworkLabor) rows = buildRowsPiecework(gridWorkers, days, wdMap, dayTiersByDate);
    else if (isPieceworkStagesLabor) rows = buildRowsPieceworkStages(gridWorkers, days, wdMap, dayStagesByDate);
    else if (isOvertimeDayLabor) rows = buildRowsOvertimeDay(gridWorkers, days, wdMap);
    else rows = buildRowsNormal(gridWorkers, days, wdMap);
    return rows.map((r) => (r._isTemp ? r : { ...r, _displayRut: rutOf(r.rut) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridWorkers, days, wdMap, isHarvestLabor, isPieceworkLabor, isPieceworkStagesLabor, isOvertimeDayLabor, dayCombosByDate, dayTiersByDate, dayStagesByDate, rutOf]);

  // Orden alfabético — mismo criterio que CycleWorkerList.jsx — para que el
  // modal mobile pueda navegar "‹ Anterior/Siguiente ›" entre trabajadores
  // sin cerrar y reabrir.
  const sortedWorkerRuts = useMemo(
    () => [...rowDataRaw].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((r) => r.rut),
    [rowDataRaw],
  );
  const editingWorkerIndex = editingCycleWorkerRut ? sortedWorkerRuts.indexOf(editingCycleWorkerRut) : -1;
  const navigateCycleWorker = (dir) => {
    if (editingWorkerIndex === -1) return;
    const nextIndex = editingWorkerIndex + dir;
    if (nextIndex < 0 || nextIndex >= sortedWorkerRuts.length) return;
    setEditingCycleWorkerRut(sortedWorkerRuts[nextIndex]);
  };

  const {
    doesExternalFilterPass,
    handleGridFilterChanged,
    isExternalFilterPresent,
    isGroupedView,
    LEADER_LOCAL,
    LEADER_NONE,
    orderedGroups,
    rowData,
    scrollToGroup,
  } = useLeaderGrouping({
    employmentPass,
    gridRef,
    groupView,
    onlyWithProduction,
    rowDataRaw,
    rutToLeader,
    setColumnFilterActive,
  });

  const assignLeaderToWorker = async (rut, leader) => {
    const w = allWorkers.find((x) => x.id === rut);
    const prev = Array.isArray(w?.groupLeader) ? w.groupLeader : [];
    const next = [leader, ...prev.filter((p) => String(p).toUpperCase() !== leader)];
    setGroupBusy(true);
    try {
      await workersService.update(rut, { groupLeader: next });
      await loadAllWorkers();
    } finally {
      setGroupBusy(false);
    }
  };

  const [leaderPickerFor, setLeaderPickerFor] = useState(null); // rut | null

  const totalsByLabor = useMemo(() => laborAmountTotals(cycle?.labors, workdaysByLabor), [cycle?.labors, workdaysByLabor]);

  const totalQtyByContainerByLabor = useMemo(() => harvestQtyByContainer(cycle?.labors, workdaysByLabor), [cycle?.labors, workdaysByLabor]);

  const totalQtyByLabor = useMemo(() => laborQtyTotals(cycle?.labors, workdaysByLabor), [cycle?.labors, workdaysByLabor]);

  const stagesDaySummary = useMemo(() => stagesDaySummaryOf(isPieceworkStagesLabor, activeLabor, workdaysByLabor), [isPieceworkStagesLabor, activeLabor, workdaysByLabor]);

  const pieceworkPeopleCountByLabor = useMemo(() => pieceworkPeopleCounts(cycle?.labors, workdaysByLabor), [cycle?.labors, workdaysByLabor]);

  const floorMetricsByLabor = useMemo(() => floorMetricsOf(cycle?.labors, workdaysByLabor), [cycle?.labors, workdaysByLabor]);

  const overtimeDayMetricsByLabor = useMemo(() => overtimeDayMetricsOf(cycle?.labors, workdaysByLabor, dayPrices), [cycle?.labors, workdaysByLabor, dayPrices]);

  const totalQtyByDayCombo = useMemo(() => harvestQtyByDayCombo(isHarvestLabor, activeLabor, workdaysByLabor, days, workers, dayCombosByDate), [isHarvestLabor, activeLabor, workdaysByLabor, days, workers, dayCombosByDate]);

  const pieceworkTierMetricsByLabor = useMemo(() => pieceworkTierMetricsOf(cycle?.labors, workdaysByLabor), [cycle?.labors, workdaysByLabor]);

  const { cycleTrips, reloadTransports, transportTotal } = useCycleTransports({ id });

  // "Total ciclo" = suma cruda de labores (sin transporte). El transporte
  // se muestra aparte y se suma en "Balance con transporte".
  const laborsTotal = useMemo(
    () => Object.values(totalsByLabor).reduce((a, b) => a + b, 0),
    [totalsByLabor],
  );
  const grandTotal = laborsTotal; // alias de laborsTotal: el "Total ciclo"
  const balanceWithTransport = useMemo(
    () => laborsTotal + transportTotal,
    [laborsTotal, transportTotal],
  );

  const {
    addComboFor,
    addComboToDay,
    computeOvertimeDayAmount,
    dayModeEdit,
    effectiveDayPrice,
    getCombo,
    getPriceInputValue,
    handlePriceBlur,
    inputKey,
    localPriceInputs,
    persistComboConfig,
    persistNormalDayPrice,
    persistStagePrice,
    persistOvertimeBonusDefaults,
    persistOvertimeDayConfig,
    removeCombo,
    removeComboFromDay,
    setAddComboFor,
    setDayModeEdit,
    setLocalPriceInputs,
    setRemoveCombo,
  } = useDayPrices({
    activeLabor,
    cycle,
    cycleWrite,
    dayCombosByDate,
    dayPrices,
    defaultMode,
    id,
    isHarvestLabor,
    setCycle,
    setDayPrices,
    setWorkdaysByLabor,
    toast,
    wdWrite,
    workdaysByLabor,
    workerIdFor,
  });

  const {
    applyFloorToAll,
    askApplyFloorToAll,
    floorBulk,
    floorBulkBusy,
    floorPendingByDate,
    floorRemove,
    floorRemoveBusy,
    persistDayFloor,
    removeDayFloor,
    setFloorBulk,
    setFloorRemove,
    toggleFloor,
  } = useFloorBonus({
    activeLabor,
    cycle,
    cycleWrite,
    dayPrices,
    id,
    setDayPrices,
    setWorkdaysByLabor,
    toast,
    wdWrite,
    workdaysByLabor,
    workerIdFor,
  });

  const {
    bonusEdit,
    commitHarvestCombo,
    commitStageQty,
    commitNormalAmount,
    commitPieceworkTier,
    onCellKeyDown,
    onCellValueChanged,
    setBonusEdit,
    upsertOvertimeDayWorkday,
  } = useCellEdits({
    activeLabor,
    computeOvertimeDayAmount,
    cycle,
    dayCombosByDate,
    dayPrices,
    days,
    dayStagesByDate,
    dayTiersByDate,
    getCombo,
    gridRef,
    id,
    isHarvestLabor,
    isOvertimeDayLabor,
    isPieceworkLabor,
    isPieceworkStagesLabor,
    qrLocked,
    readOnly,
    setCopyToast,
    setWorkdaysByLabor,
    toast,
    wdMap,
    wdWrite,
    workdaysByLabor,
    workerIdFor,
  });

  const {
    askRemoveLabor,
    confirmRemoveLabor,
    laborForm,
    openCreateLabor,
    openEditLabor,
    removeLabor,
    setLaborForm,
    setRemoveLabor,
    submitLabor,
  } = useLaborForm({
    activeLabor,
    catalogs,
    computeOvertimeDayAmount,
    cycle,
    cycleWrite,
    dayPrices,
    id,
    setActiveLaborId,
    setCycle,
    setLaborGroups,
    setWorkdaysByLabor,
    toast,
    wdWrite,
    workdaysByLabor,
    workerIdFor,
  });

  // ============================================================
  // Varios
  // ============================================================

  const showToast = (msg) => {
    setCopyToast(msg);
    setTimeout(() => setCopyToast(""), 1800);
  };

  const {
    askRemoveWorker,
    assignBusy,
    assignTempRut,
    confirmMonthly,
    confirmRemoveWorker,
    convertTempToReal,
    monthlyBusy,
    monthlyConfirm,
    pickerOpen,
    pickWorker,
    removeBusy,
    removeWorker,
    removeWorkerByRut,
    setAssignTempRut,
    setMonthlyConfirm,
    setPickerOpen,
    setRemoveWorker,
    toggleAttendance,
    toggleMonthly,
  } = useLaborWorkers({
    activeLabor,
    cycle,
    cycleWrite,
    id,
    isOvertimeDayLabor,
    readOnly,
    setCycle,
    setWorkdaysByLabor,
    showToast,
    toast,
    wdWrite,
    workdaysRef,
    workerIdFor,
    workers,
  });
  const {
    addDayOpen,
    addSelectedDays,
    confirmRemoveDay,
    doRemoveDay,
    removeDay,
    selectedDays,
    setAddDayOpen,
    setConfirmRemoveDay,
    setSelectedDays,
    setViewMonth,
    toggleSelectedDay,
    viewMonth,
  } = useCycleDays({
    cycleWrite,
    days,
    id,
    setCycle,
    showToast,
    toast,
    user,
  });
  const {
    closeBusy,
    closeFlow,
    confirmReopen,
    doReopenCycle,
    handleCloseCycle,
    handleReopenCycle,
    setCloseFlow,
    setConfirmReopen,
  } = useCycleClosing({ cycle, id, setCycle, showToast });

  // ============================================================
  // Columnas de la grilla
  // ============================================================

  const columnDefs = useMemo(
    () => buildColumnDefs({
      activeLabor,
      allowsMonthly,
      askRemoveWorker,
      assignLeaderToWorker,
      catalogs,
      commitNormalAmount,
      dayCombosByDate,
      dayHasContent,
      dayPrices,
      days,
      dayStagesByDate,
      daysWithFloor,
      dayTiersByDate,
      effectiveDayPrice,
      groupBusy,
      harvestView,
      isGroupedView,
      isHarvestLabor,
      isMobile,
      isOvertimeDayLabor,
      isPieceworkLabor,
      isPieceworkStagesLabor,
      isQtyLabor,
      LEADER_LOCAL,
      noteForDay,
      openDayNote,
      overtimeDayView,
      pieceworkView,
      qrLocked,
      readOnly,
      rutToLeader,
      setAssignTempRut,
      setBonusEdit,
      setEditingWorkerRut,
      setLeaderPickerFor,
      toggleAttendance,
      toggleMonthly,
      toggleFloor,
      upsertOvertimeDayWorkday,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, readOnly, qrLocked, isHarvestLabor, isPieceworkLabor, isPieceworkStagesLabor, isOvertimeDayLabor, dayCombosByDate, dayTiersByDate, dayStagesByDate, catalogs, dayPrices, activeLabor, overtimeDayView, harvestView, pieceworkView, activeLaborDayNotes, legacyDayNotes, activeLaborDatesWithProduction, daysWithFloor, isMobile],
  );

  if (loading) return <ScreenLoader />;
  if (!cycle) return <div className="text-[var(--color-muted)]">Ciclo no encontrado.</div>;

  const grid = (
    <div className="ag-theme-quartz ag-theme-app h-full overflow-x-auto" style={{ minHeight: 400 }}>
      {workers.length === 0 ? (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
          Agrega trabajadores para empezar.
        </div>
      ) : (
        <AgGridReact
          ref={gridRef}
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          onCellValueChanged={onCellValueChanged}
          onCellKeyDown={onCellKeyDown}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          onFilterChanged={handleGridFilterChanged}
          singleClickEdit={false}
          enterNavigatesVertically
          enterNavigatesVerticallyAfterEdit
          stopEditingWhenCellsLoseFocus
          getRowId={(p) => p.data.rut}
          enableCellTextSelection
          ensureDomOrder
          localeText={AG_GRID_LOCALE_ES}
          defaultColDef={{ resizable: true, sortable: true, filter: true }}
          rowHeight={isOvertimeDayLabor ? 58 : (isQtyLabor ? 44 : undefined)}
          isFullWidthRow={(p) => !!p.rowNode.data?._isHeader}
          fullWidthCellRenderer={GroupHeaderRowRenderer}
          getRowClass={(p) => (p.data?._isHeader ? "ag-group-header-row" : "")}
        />
      )}
    </div>
  );

  // Lo que leen las secciones de la pantalla (ver CycleDetailContext).
  const cycleDetailContext = {
    activeLabor,
    activeStages,
    addComboToDay,
    addDayOpen,
    addPriceBusy,
    addPriceModal,
    addSelectedDays,
    applyFloorToAll,
    askApplyFloorToAll,
    askRemoveLabor,
    assignLeaderToWorker,
    balanceWithTransport,
    catalogs,
    closeBusy,
    closed,
    closeDayNote,
    closeFlow,
    columnFilterActive,
    commitHarvestCombo,
    commitNormalAmount,
    commitPieceworkTier,
    commitStageQty,
    confirmMonthly,
    confirmRemoveDay,
    confirmRemoveLabor,
    confirmRemoveWorker,
    confirmReopen,
    cycle,
    cycleTrips,
    cycleWrite,
    dayCombosByDate,
    dayNoteBusy,
    dayNoteDirty,
    dayPrices,
    days,
    dayStagesByDate,
    daysWithFloor,
    dayTiersByDate,
    defaultMode,
    doRemoveDay,
    doReopenCycle,
    editingDayNote,
    editingDayNoteText,
    enabledLeaders,
    floorBulk,
    floorBulkBusy,
    floorMetricsByLabor,
    floorPendingByDate,
    floorRemove,
    floorRemoveBusy,
    getPriceInputValue,
    goToDayNote,
    grandTotal,
    gridVisible,
    groupView,
    handleCloseCycle,
    handlePriceBlur,
    handleReopenCycle,
    harvestView,
    hasNextDayNote,
    hasPrevDayNote,
    inputKey,
    isGroupedView,
    isHarvestLabor,
    isNormalLabor,
    isOvertimeDayLabor,
    isPieceworkLabor,
    isPieceworkStagesLabor,
    isQtyLabor,
    job,
    laborForm,
    laborGroups,
    LEADER_LOCAL,
    LEADER_NONE,
    localPriceInputs,
    metricsCollapsed,
    monthlyBusy,
    monthlyConfirm,
    navigate,
    nextCycle,
    onlyWithProduction,
    employmentFilter,
    setEmploymentFilter,
    employmentLoading,
    employers,
    openCreateLabor,
    openEditLabor,
    orderedGroups,
    overtimeDayMetricsByLabor,
    overtimeDayView,
    peopleByDate,
    persistComboConfig,
    persistDayFloor,
    persistNormalDayPrice,
    persistOvertimeDayConfig,
    persistStagePrice,
    pieceworkPeopleCountByLabor,
    pieceworkTierMetricsByLabor,
    pieceworkView,
    prevCycle,
    pricesCollapsed,
    qrLockedLabors,
    readOnly,
    removeBusy,
    removeCombo,
    removeComboFromDay,
    removeDay,
    removeDayFloor,
    removeLabor,
    removeWorker,
    saveDayNote,
    scrollToGroup,
    selectedDays,
    setActiveLaborId,
    setAddComboFor,
    setAddDayOpen,
    setAddPriceBusy,
    setAddPriceModal,
    setCatalogsOpen,
    setCloseFlow,
    setConfirmRemoveDay,
    setConfirmReopen,
    setDayModeEdit,
    setDayPrices,
    setDefaultLeadersOpen,
    setEditingDayNoteText,
    setFloorBulk,
    setFloorRemove,
    setGroupView,
    setHarvestView,
    setLaborForm,
    setLocalPriceInputs,
    setMetricsCollapsed,
    setMonthlyConfirm,
    setOnlyWithProduction,
    setOvertimeDayView,
    setPickerOpen,
    setPieceworkView,
    setPricesCollapsed,
    setRemoveCombo,
    setRemoveLabor,
    setRemoveWorker,
    setSelectedDays,
    setSummaryOpen,
    setToolbarCollapsed,
    setTransportsOpen,
    setViewMonth,
    stagesDaySummary,
    subjob,
    submitLabor,
    toggleAttendance,
    toggleFloor,
    toggleMonthly,
    toggleSelectedDay,
    toolbarCollapsed,
    totalQtyByContainerByLabor,
    totalQtyByDayCombo,
    totalQtyByLabor,
    totalsByLabor,
    transportTotal,
    upsertOvertimeDayWorkday,
    viewMonth,
    wdMap,
    workers,
  };

  return (
    <CycleDetailContext value={cycleDetailContext}>
      <div className="flex h-full flex-col">
        <CycleHeader />

        {!toolbarCollapsed && (
        <>
        <CycleTitleBar />

        <LaborMetrics />

        <LaborTabs />
        </>
        )}

        {activeLabor && (
          <>
            {closed && (
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-text)]">
                <span className="font-semibold text-[var(--color-warning)]">🔒 Ciclo cerrado</span>
                <span>
                  Está congelado: no se puede editar nada de la grilla, los precios ni las labores.
                  Para corregir algo hay que <strong>reabrirlo</strong> con el botón de arriba, y
                  volver a cerrarlo después.
                </span>
              </div>
            )}
            {/* Colores del tema (accent), no un violeta fijo: el accent cambia
                con el tema (ver la nota de colores en AGENTS.md). */}
            {qrLocked && (
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs text-[var(--color-text)]">
                <span className="font-semibold text-[var(--color-accent)]">📱 Cosecha sincronizada desde QR</span>
                <span>
                  La producción de esta labor la escribe la app de escaneo del prefijo{" "}
                  <span className="font-mono font-semibold">{qrPrefixForActive.id}</span>
                  {qrPrefixForActive.label ? ` (${qrPrefixForActive.label})` : ""}, así que las celdas
                  no se editan a mano: la próxima sincronización las sobrescribe. El piso sí se puede cargar.
                </span>
                <Link
                  to="/admin/harvest-qr"
                  className="font-medium text-[var(--color-accent)] underline hover:no-underline"
                >
                  Ir a Pesajes QR
                </Link>
              </div>
            )}
            {!toolbarCollapsed && (
            <>
            <LaborToolbar />

            <PricesPanel />
            </>
            )}

            {isMobile && workers.length > 0 && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setShowDesktopGrid((v) => !v)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]"
                >
                  {showDesktopGrid ? "📋 Ver por trabajador" : "🗂 Ver grilla completa"}
                </button>
              </div>
            )}

            <GridToolbar />

            {/* Este bloque ocupa el alto libre del <main> (flex-1, min-h-0) y la
                grilla se desplaza por dentro. En mobile se muestra
                CycleWorkerList en su lugar, salvo con "Ver grilla completa". */}
            <div className="flex min-h-0 flex-1 flex-col">
              {isMobile && !showDesktopGrid ? (
                <CycleWorkerList
                  rows={rowDataRaw}
                  days={days}
                  fmtCurrency={fmtCurrency}
                  onSelectWorker={setEditingCycleWorkerRut}
                  onlyWithProduction={onlyWithProduction}
                  employmentPass={employmentPass}
                />
              ) : (
                grid
              )}
            </div>
          </>
        )}

        {/* Modales */}
        <DayNoteModal />

        <AddPriceModal />

        <LeaderPickerModal
          open={!!leaderPickerFor}
          onClose={() => setLeaderPickerFor(null)}
          leaders={enabledLeaders}
          workerName={leaderPickerFor ? (allWorkers.find((w) => w.id === leaderPickerFor)?.name || leaderPickerFor) : ""}
          busy={groupBusy}
          onPick={async (leader) => {
            const rut = leaderPickerFor;
            setLeaderPickerFor(null);
            if (rut && leader) await assignLeaderToWorker(rut, leader);
          }}
        />
        <AddDaysModal />

        <LaborFormModal />

        <WorkerPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={pickWorker}
          excludeRuts={workers.map((w) => w.id || w.rut)}
          allowTemp
          availableLeaders={enabledLeaders}
        />

        <WorkerPickerModal
          open={!!assignTempRut}
          onClose={() => !assignBusy && setAssignTempRut(null)}
          onPick={convertTempToReal}
          excludeRuts={workers.filter((w) => w.rut !== assignTempRut).map((w) => w.id || w.rut)}
          allowTemp={false}
          title="Asignar RUT al trabajador temporal"
          availableLeaders={enabledLeaders}
        />

        <CycleConfirmDialogs />

        <AddComboModal
          open={!!addComboFor}
          onClose={() => setAddComboFor(null)}
          catalogs={catalogs}
          existingCombos={addComboFor ? (dayCombosByDate[addComboFor.date] || []) : []}
          date={addComboFor?.date}
          onAddCatalogEntry={addCatalogEntry}
          onAdd={async (x, y) => {
            if (!addComboFor) return;
            await addComboToDay(addComboFor.laborId, addComboFor.date, x, y);
            setAddComboFor(null);
          }}
        />

        <CatalogsModal
          open={catalogsOpen}
          onClose={() => setCatalogsOpen(false)}
          catalogs={catalogs}
          onAddEntry={addCatalogEntry}
          onRenameEntry={renameCatalogEntry}
        />

        <BonusEditModal
          open={!!bonusEdit}
          onClose={() => setBonusEdit(null)}
          labor={activeLabor}
          wd={bonusEdit ? (workdaysByLabor[bonusEdit.laborId] || {})[workdayMapKey(bonusEdit.workerRut, bonusEdit.date, SINGLE_COMBO)] : null}
          workerName={bonusEdit ? workers.find((w) => w.rut === bonusEdit.workerRut)?.name : ""}
          date={bonusEdit?.date}
          readOnly={readOnly}
          onSave={async (patch) => {
            if (!bonusEdit) return;
            await upsertOvertimeDayWorkday(bonusEdit.laborId, bonusEdit.date, bonusEdit.workerRut, patch);
            setBonusEdit(null);
          }}
        />

        <CycleWorkerEditModal
          workerRut={editingCycleWorkerRut}
          onClose={() => setEditingCycleWorkerRut(null)}
          row={editingCycleWorkerRut ? rowDataRaw.find((r) => r.rut === editingCycleWorkerRut) : null}
          onRemoveWorker={removeWorkerByRut}
          currentLeader={editingCycleWorkerRut ? rutToLeader.get(editingCycleWorkerRut) || null : null}
          leaderBusy={groupBusy}
          onNavigate={navigateCycleWorker}
          canGoPrev={editingWorkerIndex > 0}
          canGoNext={editingWorkerIndex !== -1 && editingWorkerIndex < sortedWorkerRuts.length - 1}
        />

        {/* Después del modal del teléfono, para quedar encima cuando se marca
            mensual desde ahí. */}
        <MonthlyConfirmModal />

        <DayModeModal
          open={!!dayModeEdit}
          onClose={() => setDayModeEdit(null)}
          date={dayModeEdit?.date}
          labor={activeLabor}
          cfg={dayModeEdit ? getDaySingle(dayPrices, dayModeEdit.laborId, dayModeEdit.date, "normal") : null}
          readOnly={readOnly}
          onSave={async (patch) => {
            if (!dayModeEdit) return;
            await persistOvertimeDayConfig(dayModeEdit.laborId, dayModeEdit.date, patch);
            setDayModeEdit(null);
          }}
        />

        <DefaultLeadersModal
          open={defaultLeadersOpen}
          onClose={() => setDefaultLeadersOpen(false)}
          labor={activeLabor}
          readOnly={readOnly}
          onSave={async (defaults) => {
            if (!activeLabor) return;
            await persistOvertimeBonusDefaults(activeLabor.id, defaults);
            setDefaultLeadersOpen(false);
          }}
        />

        <TransportsModal
          open={transportsOpen}
          onClose={async () => {
            setTransportsOpen(false);
            await reloadTransports();
          }}
          cycle={cycle}
          faena={job}
          subfaena={subjob}
          days={days}
          readOnly={readOnly}
        />

        <CycleSummaryModal
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          cycle={cycle}
          workdaysByLabor={workdaysByLabor}
          dayPrices={dayPrices}
          catalogs={catalogs}
          faena={job}
          subfaena={subjob}
        />

        <WorkerEditModal
          open={!!editingWorkerRut}
          mode="edit"
          worker={editingWorkerRut ? allWorkers.find((w) => w.id === editingWorkerRut) : null}
          allWorkers={allWorkers}
          onClose={() => setEditingWorkerRut(null)}
          onSaved={async () => {
            const rut = editingWorkerRut;
            setEditingWorkerRut(null);
            if (!rut) return;
            // Relee el trabajador y lo reemplaza en allWorkers: la grilla toma el
            // nombre y el líder de ahí (rutToName, rutToLeader).
            try {
              const updated = await workersService.getById(rut);
              if (updated) {
                setAllWorkers((prev) => {
                  const idx = prev.findIndex((w) => w.id === rut);
                  if (idx === -1) return [...prev, updated];
                  const next = prev.slice();
                  next[idx] = updated;
                  return next;
                });
              }
            } catch {
              /* noop */
            }
          }}
        />

        {copyToast && (
          <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-lg">
            {copyToast}
          </div>
        )}
      </div>
    </CycleDetailContext>
  );
}
