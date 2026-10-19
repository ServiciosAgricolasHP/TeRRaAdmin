import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { captureFullWidthDataUrl, captureFullWidthBlob } from "../utils/imageCapture";
import {
  cyclesService,
  jobsService,
  subjobsService,
  laborGroupsService,
  workdaysService,
  qrPrefixesService,
  workersService,
  groupLeadersService,
} from "../services";
import { parseAmount } from "../utils/formula";
import { AG_GRID_LOCALE_ES } from "../utils/agGridLocale";
import {
  effectivePiso,
  normalizeTratoDayPrices,
  normalizeDayPricesEntry,
  workdayComboKeyOf,
  PISO_COMBO_KEY,
  normalizeTratoWorkday,
  workdayMapKey,
  getDayCombos,
  comboKey as makeComboKey,
  getDaySingle,
  parseComboKey,
  workdayDocId,
  pisoAssigned,
  pisoTargets,
  COSECHA_MODES,
} from "../utils/cosechaCombos";
import {
  DEFAULT_BONUS_MANEJO,
  DEFAULT_BONUS_SUPERVISION,
  DEFAULT_OVERTIME_RATE,
  DEFAULT_BASE_DAY,
  calcTratoHEAmount,
  workdayHasData,
} from "../utils/tratoHE";
import {
  normalizeStages,
  computeStageDayAmount,
  getStageDayPrice,
  defaultStages,
} from "../utils/tratoEtapas";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { greeting, GREETING_SLOTS } from "../utils/greetings";
import Modal, { ModalCloseButton } from "../components/Modal";
import { hasChanges } from "../utils/formChanges";
import TextField from "../components/TextField";
import Select from "../components/Select";
import ConfirmDialog from "../components/ConfirmDialog";
import { useIsMobile } from "../hooks/useIsMobile";
import WorkerPickerModal from "./cycleDetail/WorkerPickerModal";
import WorkerEditModal from "../components/WorkerEditModal";
import TransportsModal from "../components/TransportsModal";
import CycleWorkerList from "./cycleDetail/CycleWorkerList";
import CycleWorkerEditModal from "./cycleDetail/CycleWorkerEditModal";
import CycleSummaryModal from "./cycleDetail/CycleSummaryModal";
import { tripsService } from "../services/transportsService";
import { qrLockedLaborsOf } from "../utils/harvestSync";
import { LABOR_TYPES } from "../utils/laborTypes";
import { localIsoDate } from "../utils/dates";
import { closedCyclePatch } from "../utils/cycleClosing";
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
import { unshout, toTitleName } from "../utils/textCase";
import { fmtCurrency } from "../utils/format";
import { AddComboModal } from "./cycleDetail/AddComboModal";
import { BonusEditModal } from "./cycleDetail/BonusEditModal";
import { CatalogsModal } from "./cycleDetail/CatalogsModal";
import { DayCalendarPicker } from "./cycleDetail/DayCalendarPicker";
import { DayHeader } from "./cycleDetail/DayHeader";
import { DayModeModal } from "./cycleDetail/DayModeModal";
import { DefaultLeadersModal } from "./cycleDetail/DefaultLeadersModal";
import { FormulaCellEditor } from "./cycleDetail/FormulaCellEditor";
import { GroupHeaderRowRenderer } from "./cycleDetail/GroupHeaderRowRenderer";
import { LeaderPickerModal } from "./cycleDetail/LeaderPickerModal";
import { FloorDayRow } from "./cycleDetail/FloorDayRow";
import {
  normalizeCycle,
  buildRowsHarvest,
  buildRowsPiecework,
  buildRowsPieceworkStages,
  buildRowsOvertimeDay,
  buildRowsNormal,
  SINGLE_COMBO,
  newId,
} from "./cycleDetail/rows";
import { StagesEditor } from "./cycleDetail/StagesEditor";
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

ModuleRegistry.registerModules([AllCommunityModule]);

const todayStr = () => localIsoDate();

export default function CycleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { catalogs, addEntry: addCatalogEntry, renameEntry: renameCatalogEntry } = useCatalogs();
  const toast = useToast();
  const { user } = useAuth();

  const [cycle, setCycle] = useState(null);
  const [job, setJob] = useState(null);
  const [subjob, setSubjob] = useState(null);
  // Agrupaciones de labor de esta subfaena (Poda, Riego, etc.), para hilar
  // labores del mismo tipo a través de ciclos. Ver laborGroupsService.
  const [laborGroups, setLaborGroups] = useState([]);
  const [workdaysByLabor, setWorkdaysByLabor] = useState({});
  // Última versión de las jornadas, para los handlers que las columnas de la
  // grilla capturan en un render anterior.
  const workdaysRef = useRef(workdaysByLabor);
  useEffect(() => { workdaysRef.current = workdaysByLabor; }, [workdaysByLabor]);

  // Prefijos QR apuntados a este ciclo. Ver `qrLockedLabors` más abajo.
  const [qrPrefixes, setQrPrefixes] = useState([]);
  // Confirmación del piso masivo: { laborId, date, ruts, amount }.
  const [floorBulk, setFloorBulk] = useState(null);
  const [floorBulkBusy, setFloorBulkBusy] = useState(false);
  // Confirmación de quitar el piso del día: { laborId, date, libres, liquidados }.
  const [floorRemove, setFloorRemove] = useState(null);
  const [floorRemoveBusy, setFloorRemoveBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeLaborId, setActiveLaborId] = useState(null);

  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDay, setNewDay] = useState(todayStr());
  const [selectedDays, setSelectedDays] = useState(() => new Set());
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  // Anotaciones por (labor, día) en cycle.dayNotesByLabor = { [laborId]:
  // { "YYYY-MM-DD": "texto" } }. cycle.dayNotes (compartido entre labores)
  // solo se lee, cuando la labor no tiene anotación propia para ese día. Se
  // editan en un modal que abre el encabezado de la fecha (DayHeader).
  const [editingDayNote, setEditingDayNote] = useState(null); // { laborId, date } o null
  const [editingDayNoteText, setEditingDayNoteText] = useState("");
  const [dayNoteBusy, setDayNoteBusy] = useState(false);

  // Modal para agregar un precio (tier) a un día de trato.
  const [addPriceModal, setAddPriceModal] = useState(null);
  // forma: { laborId, date, nextKey, defaultMode, value }
  const [addPriceBusy, setAddPriceBusy] = useState(false);

  // Secciones colapsables (métricas y precios), persistidas por dispositivo,
  // para dejarle más alto a la grilla.
  const [metricsCollapsed, setMetricsCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.metricsCollapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.metricsCollapsed", String(metricsCollapsed)); } catch { /* noop */ }
  }, [metricsCollapsed]);
  const [pricesCollapsed, setPricesCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.pricesCollapsed") === "true"; } catch { return false; }
  });
  // Toggle maestro: colapsa TODO el bloque de controles (título+botones,
  // métricas, tabs de labor, barra de la labor activa, chips de días,
  // precios) en una sola línea, para maximizar el alto de la grilla. Los
  // toggles individuales (metricsCollapsed/pricesCollapsed) siguen aplicando
  // cuando este está expandido.
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.toolbarCollapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.toolbarCollapsed", String(toolbarCollapsed)); } catch { /* noop */ }
  }, [toolbarCollapsed]);
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.pricesCollapsed", String(pricesCollapsed)); } catch { /* noop */ }
  }, [pricesCollapsed]);

  const [pickerOpen, setPickerOpen] = useState(false);
  // RUT sintético (TEMP-*) del temporal al que se le está asignando un RUT
  // real. Con valor, abre un segundo selector que reemplaza esa entrada (y
  // reescribe todas sus jornadas) por el trabajador elegido.
  const [assignTempRut, setAssignTempRut] = useState(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const [removeWorker, setRemoveWorker] = useState(null);
  // Aviso al marcar como mensual a alguien con días con monto (ver toggleMonthly).
  const [monthlyConfirm, setMonthlyConfirm] = useState(null);
  const [monthlyBusy, setMonthlyBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Edición rápida del trabajador desde la grilla — doble click en la
  // columna RUT abre el mismo modal del módulo de Trabajadores. No aplica
  // a temporales (no existen como doc en `worker`).
  const [editingWorkerRut, setEditingWorkerRut] = useState(null);

  const [laborForm, setLaborForm] = useState(null);
  const [removeLabor, setRemoveLabor] = useState(null);

  const [photoMode, setPhotoMode] = useState(false);
  // En mobile se muestra la lista de trabajadores (CycleWorkerList) en vez de
  // la grilla, que obliga a desplazarse por decenas de columnas de día. Este
  // toggle muestra la grilla completa.
  const [showDesktopGrid, setShowDesktopGrid] = useState(false);
  // Modal mobile: edita un trabajador a la vez (una fila por día). Se cierra
  // al cambiar de labor, donde ese rut puede no existir.
  const [editingCycleWorkerRut, setEditingCycleWorkerRut] = useState(null);
  const [copyToast, setCopyToast] = useState("");
  const [closeFlow, setCloseFlow] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [dayPrices, setDayPrices] = useState({});
  const [localPriceInputs, setLocalPriceInputs] = useState({});

  const [addComboFor, setAddComboFor] = useState(null);
  const [removeCombo, setRemoveCombo] = useState(null);
  const [confirmRemoveDay, setConfirmRemoveDay] = useState(null); // fecha (string) o null
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [catalogsOpen, setCatalogsOpen] = useState(false);
  // Modales de tratoHE
  const [bonusEdit, setBonusEdit] = useState(null);   // { laborId, date, workerRut }
  const [dayModeEdit, setDayModeEdit] = useState(null); // { laborId, date }
  const [defaultLeadersOpen, setDefaultLeadersOpen] = useState(false);
  const [overtimeDayView, setOvertimeDayView] = useState("detalle"); // "detalle" | "resumen"
  const [harvestView, setHarvestView] = useState("detalle"); // "detalle" | "resumen"
  const [pieceworkView, setPieceworkView] = useState("detalle"); // "detalle" | "resumen"
  const [transportsOpen, setTransportsOpen] = useState(false);
  const [cycleTrips, setCycleTrips] = useState([]);
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
  const photoRef = useRef(null);
  // Modo mobile (<768px): oculta la columna RUT y angosta las columnas para
  // que entren más días en pantalla.
  const isMobile = useIsMobile();
  // El toggle Detalle/Resumen solo cambia columnas de la grilla, así que se
  // oculta mientras la grilla no se ve (mobile con CycleWorkerList).
  const gridVisible = !isMobile || showDesktopGrid;
  // Pila de deshacer: cada entrada es un lote (array) de { rut, field, oldValue }.
  // Ctrl+Z saca un lote y vuelve a escribir los valores anteriores. Una edición
  // suelta apila un lote de 1; fillDown y pegar apilan uno de N, que se deshace
  // en un solo paso.
  const undoStackRef = useRef([]);
  const isUndoingRef = useRef(false);
  const pendingBatchRef = useRef(null);
  const UNDO_LIMIT = 50;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const c = await cyclesService.getById(id);
      if (!c) { setLoading(false); return; }
      const normalized = normalizeCycle(c);
      const needsPersist =
        !c.labors || !c.labors.length || !Array.isArray(c.days) || (c.labors || []).some((l) => Array.isArray(l.days));
      if (needsPersist) {
        await cyclesService.update(id, { days: normalized.days, labors: normalized.labors });
      }
      setCycle(normalized);
      setActiveLaborId(normalized.labors[0]?.id || null);

      const rawDP = c.dayPrices || {};
      const normalizedDP = {};
      let dpChanged = false;
      for (const lid of Object.keys(rawDP)) {
        normalizedDP[lid] = {};
        const labor = (c.labors || []).find((l) => l.id === lid);
        const laborDefaultMode = labor?.tratoMode || "unit";
        for (const date of Object.keys(rawDP[lid])) {
          const before = rawDP[lid][date];
          const isTratoType = labor?.type === "trato";
          const after = isTratoType
            ? normalizeTratoDayPrices(before, laborDefaultMode)
            : normalizeDayPricesEntry(before);
          normalizedDP[lid][date] = after;
          if (JSON.stringify(before) !== JSON.stringify(after)) dpChanged = true;
        }
      }
      setDayPrices(normalizedDP);
      if (dpChanged) await cyclesService.update(id, { dayPrices: normalizedDP });

      if (normalized.faenaId) setJob(await jobsService.getById(normalized.faenaId));
      if (normalized.subfaenaId) {
        setSubjob(await subjobsService.getById(normalized.subfaenaId));
        // Sin `order`: where(subfaenaId) + orderBy(name) pediría un índice
        // compuesto en Firestore. La lista es chica y se ordena en el cliente.
        const groups = await laborGroupsService.list({ wheres: [["subfaenaId", "==", normalized.subfaenaId]] });
        setLaborGroups([...groups].sort((a, b) => a.name.localeCompare(b.name)));
      }

      const wds = await workdaysService.list({ wheres: [["cycleId", "==", id]] });
      const byLabor = {};
      const labors = normalized.labors || [];
      for (const w of wds) {
        const lid = w.laborId || labors[0]?.id;
        // Clave de combo/tier (ck) del mapa en memoria (workdayComboKeyOf).
        // Las filas de trato buscan sus jornadas por tier ("t0", "t1"…).
        const laborForDoc = labors.find((l) => l.id === lid);
        const ck = workdayComboKeyOf(w, laborForDoc?.type);
        if (!byLabor[lid]) byLabor[lid] = {};
        // Los workdays de piso no se normalizan como trato: no tienen tiers.
        const normalizedWd = w.pisoOnly || ck === PISO_COMBO_KEY ? w : normalizeTratoWorkday(w);
        byLabor[lid][workdayMapKey(w.workerRut, w.date, ck)] = normalizedWd;
      }
      setWorkdaysByLabor(byLabor);
      setLoading(false);
    })();
  }, [id]);

  const closed = cycle?.status === "closed";
  // Un ciclo cerrado es de solo lectura para todos, admin incluido; para
  // editarlo hay que reabrirlo.
  //
  // El corte es el cierre del ciclo, no el `payrollId` del workday: se paga a
  // mitad de ciclo y se sigue trabajando ahí para revisar y generar
  // diferencias.
  const readOnly = closed;

  // Toda escritura del ciclo y de sus workdays pasa por `cycleWrite`/`wdWrite`, que
  // verifican en un solo punto que el ciclo esté abierto. assertOpen lanza en
  // vez de devolver: los llamadores actualizan el estado local justo después
  // de escribir.
  //
  // Quedan fuera la normalización del loader (corre al montar, no es una
  // edición del usuario) y cerrar/reabrir el ciclo, que es lo que levanta el
  // candado.
  const assertOpen = () => {
    if (!closed) return;
    toast.warning("El ciclo está cerrado. Reábrelo para poder editarlo.");
    throw new Error("Ciclo cerrado: no se puede editar");
  };
  const cycleWrite = async (patch) => {
    assertOpen();
    return cyclesService.update(id, patch);
  };
  const wdWrite = {
    upsert: async (docId, data, opts) => {
      assertOpen();
      return workdaysService.upsert(docId, data, opts);
    },
    remove: async (docId) => {
      assertOpen();
      return workdaysService.remove(docId);
    },
  };

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

  // Navegación entre ciclos hermanos (misma faena y subfaena), ordenados por
  // su primer día trabajado (mínimo de cycle.days), no por el número del
  // label. Se recarga solo cuando cambia la faena o la subfaena.
  const [siblingCycles, setSiblingCycles] = useState(null);
  useEffect(() => {
    const faenaId = cycle?.faenaId;
    if (!faenaId) { setSiblingCycles(null); return; }
    const subfaenaId = cycle?.subfaenaId || null;
    let cancelled = false;
    (async () => {
      const list = await cyclesService.list({
        wheres: [["faenaId", "==", faenaId]],
        cache: true,
        ttl: 2 * 60 * 1000,
      });
      if (cancelled) return;
      const scope = list.filter((c) => (c.subfaenaId || null) === subfaenaId);
      // Un ciclo sin días se ordena por startDate o createdAt, nunca por hoy
      // (a diferencia de firstWorkedDay).
      const firstDayForSort = (c) => {
        const days = c.days;
        if (Array.isArray(days) && days.length > 0) {
          return days.reduce((min, d) => (d < min ? d : min), days[0]);
        }
        return c.startDate || c.createdAt?.toDate?.()?.toISOString?.() || "";
      };
      scope.sort((a, b) => firstDayForSort(a).localeCompare(firstDayForSort(b)));
      setSiblingCycles(scope.map((c) => ({ id: c.id, label: c.label })));
    })();
    return () => { cancelled = true; };
  }, [cycle?.faenaId, cycle?.subfaenaId]);

  const cycleNavIndex = siblingCycles ? siblingCycles.findIndex((c) => c.id === id) : -1;
  const prevCycle = cycleNavIndex > 0 ? siblingCycles[cycleNavIndex - 1] : null;
  const nextCycle = cycleNavIndex >= 0 && cycleNavIndex < (siblingCycles?.length || 0) - 1
    ? siblingCycles[cycleNavIndex + 1]
    : null;

  const loadAllWorkers = async () => {
    const list = await workersService.list({
      order: ["name", "asc"],
      cache: true,
      persist: true,
      ttl: 2 * 60 * 60 * 1000,
    });
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

  const LEADER_LOCAL = "CHILENOS";
  const LEADER_FOREIGN = "EXTRANJEROS";
  const LEADER_NONE = "__NONE__";

  const orderLeaders = (leaders) => {
    const arr = [...leaders];
    return arr.sort((a, b) => {
      if (a === b) return 0;
      if (a === LEADER_LOCAL) return -1;
      if (b === LEADER_LOCAL) return 1;
      if (a === LEADER_FOREIGN) return -1;
      if (b === LEADER_FOREIGN) return 1;
      if (a === LEADER_NONE) return 1;
      if (b === LEADER_NONE) return -1;
      return a.localeCompare(b);
    });
  };

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

  const legacyDayNotes = cycle?.dayNotes || {};
  const dayNotesByLabor = cycle?.dayNotesByLabor || {};
  const activeLaborDayNotes = (activeLabor && dayNotesByLabor[activeLabor.id]) || {};
  // Manda la anotación de la labor; si no tiene una para ese día, se usa la
  // compartida del ciclo.
  const noteForDay = (d) => activeLaborDayNotes[d] ?? legacyDayNotes[d] ?? "";
  // Se puede anotar un día con producción de esta labor o que ya tenga
  // anotación.
  const dayHasContent = (d) => activeLaborDatesWithProduction.has(d) || !!noteForDay(d);

  const openDayNote = (date) => {
    if (!activeLabor || !dayHasContent(date)) return;
    setEditingDayNote({ laborId: activeLabor.id, date });
    setEditingDayNoteText(String(noteForDay(date) || ""));
  };

  const closeDayNote = () => {
    if (dayNoteBusy) return;
    setEditingDayNote(null);
    setEditingDayNoteText("");
  };

  const editingDayNoteIdx = editingDayNote ? days.indexOf(editingDayNote.date) : -1;
  const hasPrevDayNote = editingDayNoteIdx > 0 && days.slice(0, editingDayNoteIdx).some(dayHasContent);
  const hasNextDayNote = editingDayNoteIdx >= 0 && days.slice(editingDayNoteIdx + 1).some(dayHasContent);
  // Con la anotación cambiada y sin guardar, ◀ ▶ quedan deshabilitados: pasar
  // de día la descartaría.
  const dayNoteDirty =
    !!editingDayNote && !dayNoteBusy && hasChanges({ text: noteForDay(editingDayNote.date) }, { text: editingDayNoteText });
  const goToDayNote = (delta) => {
    if (!editingDayNote) return;
    let idx = editingDayNoteIdx;
    while (true) {
      idx += delta;
      if (idx < 0 || idx >= days.length) return;
      if (dayHasContent(days[idx])) break;
    }
    const nextDate = days[idx];
    setEditingDayNote({ ...editingDayNote, date: nextDate });
    setEditingDayNoteText(String(noteForDay(nextDate) || ""));
  };

  const saveDayNote = async () => {
    if (!editingDayNote) return;
    const { laborId, date } = editingDayNote;
    setDayNoteBusy(true);
    try {
      const text = unshout(String(editingDayNoteText || "").trim());
      const nextByLabor = { ...(cycle?.dayNotesByLabor || {}) };
      const nextForLabor = { ...(nextByLabor[laborId] || {}) };
      if (text) nextForLabor[date] = text;
      else delete nextForLabor[date];
      nextByLabor[laborId] = nextForLabor;
      await cycleWrite({ dayNotesByLabor: nextByLabor });
      setCycle((c) => (c ? { ...c, dayNotesByLabor: nextByLabor } : c));
      setEditingDayNote(null);
      setEditingDayNoteText("");
    } finally {
      setDayNoteBusy(false);
    }
  };

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

  const groupBuckets = useMemo(() => {
    const buckets = new Map();
    for (const row of rowDataRaw) {
      const leader = rutToLeader.get(row.rut) || LEADER_NONE;
      if (!buckets.has(leader)) buckets.set(leader, []);
      buckets.get(leader).push(row);
    }
    for (const [, rows] of buckets) rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowDataRaw, rutToLeader]);

  const orderedGroups = useMemo(() => {
    const keys = orderLeaders([...groupBuckets.keys()]);
    return keys.map((k) => ({
      key: k,
      label: k === LEADER_NONE ? "SIN GRUPO" : k,
      count: groupBuckets.get(k)?.length || 0,
      rows: groupBuckets.get(k) || [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBuckets]);

  const isGroupedView = groupView === "group" && !photoMode;

  const rowData = useMemo(() => {
    if (!isGroupedView) return rowDataRaw;
    const out = [];
    for (const g of orderedGroups) {
      out.push({
        rut: `__group__${g.key}`,
        _isHeader: true,
        _leader: g.label,
        _leaderKey: g.key,
        _count: g.count,
      });
      for (const r of g.rows) out.push(r);
    }
    return out;
  }, [isGroupedView, rowDataRaw, orderedGroups]);

  // "Solo con producción" es un filtro externo de AG-Grid (no recorta
  // `rowData`), así convive con el orden y la selección de la grilla. Con un
  // filtro de columna activo deja pasar todo: la búsqueda muestra a todos los
  // que calzan, tengan o no producción.
  const isExternalFilterPresent = () => onlyWithProduction;
  const doesExternalFilterPass = (node) => {
    if (node.data?._isHeader) return true;
    if (gridRef.current?.api?.isColumnFilterPresent()) return true;
    return Number(node.data?.total) > 0;
  };
  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [onlyWithProduction]);
  const handleGridFilterChanged = () => {
    setColumnFilterActive(!!gridRef.current?.api?.isColumnFilterPresent());
  };

  const scrollToGroup = (key) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const node = api.getRowNode(`__group__${key}`);
    if (node) api.ensureNodeVisible(node, "top");
  };

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

  const transportTotal = useMemo(
    () => cycleTrips.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [cycleTrips],
  );

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

  const reloadTransports = async () => {
    if (!id) return;
    try {
      const list = await tripsService.listByCycle(id);
      setCycleTrips(list);
    } catch (err) {
      console.error("[Transports] load failed:", err);
    }
  };

  useEffect(() => {
    reloadTransports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Guardan los días y una labor del ciclo (agregar o quitar día o trabajador,
  // toggle de mensual). Si la escritura falla muestran un toast de error y
  // devuelven false; si guarda, true, y el llamador decide si avisa.
  const persistDays = async (nextDays) => {
    try {
      await cycleWrite({ days: nextDays });
      setCycle((c) => ({ ...c, days: nextDays }));
      return true;
    } catch (err) {
      toast.error("No se pudo guardar el cambio de días: " + (err.message || err));
      return false;
    }
  };

  const persistLabor = async (next) => {
    try {
      const nextLabors = cycle.labors.map((l) => (l.id === next.id ? next : l));
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      return true;
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return false;
    }
  };

  // ============================================================
  // Combos y precio único por día
  // ============================================================

  const getCombo = (laborId, date, ck) => {
    const combos = laborId === activeLabor?.id && isHarvestLabor
      ? (dayCombosByDate[date] || [])
      : getDayCombos(dayPrices, laborId, date, defaultMode);
    return combos.find((c) => c.key === ck) || { key: ck, x: 0, y: 0, price: 0, mode: defaultMode };
  };

  const recalcDayCombo = async (laborId, date, ck, price, mode, isTrato) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || (labor.type !== "cosecha" && labor.type !== "trato")) return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const { x, y } = parseComboKey(ck);
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, ck);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const qty = Number(wd.qty) || 0;
      if (qty === 0) continue;
      const amount = mode === "flat" ? price : qty * price;
      const docId = workdayDocId(id, laborId, w.rut, date, ck);
      // En trato también se reescriben `tiers["0"]` y `totalAmount`, la copia
      // del monto que guarda el workday (igual que commitTratoTier).
      const patch = isTrato
        ? { ...wd, amount, tiers: { "0": { qty, amount } }, totalAmount: amount, workerId: w.id || w.rut }
        : { ...wd, qualityX: x, containerY: y, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, patch);
      updates[mapKey] = patch;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const persistComboConfig = async (laborId, date, ck, patch, isTrato = false) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry[ck] || { price: 0, mode: defaultMode };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, [ck]: merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayCombo(laborId, date, ck, merged.price, merged.mode, isTrato);
  };

  // tratoEtapas: recalcula el amount de los workdays de una etapa en un día
  // cuando cambia su precio o modo. Cada workday guarda su propio amount, que
  // es el que leen el resumen y la nómina.
  const recalcDayStage = async (laborId, date, stageId, price, mode) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoEtapas") return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, stageId);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const qty = Number(wd.qty) || 0;
      if (qty === 0) continue;
      const amount = computeStageDayAmount(mode, price, qty);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, w.rut, date, stageId);
      const patch = { ...wd, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, patch);
      updates[mapKey] = patch;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  // Persiste el precio/modo de una etapa en un día (dayPrices[lab][date][stageId])
  // y recalcula los workdays afectados.
  const persistStagePrice = async (laborId, date, stageId, patch) => {
    const dayEntry = dayPrices[laborId]?.[date] || {};
    const current = dayEntry[stageId] || { price: 0, mode: "unit" };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, [stageId]: merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayStage(laborId, date, stageId, merged.price, merged.mode);
  };

  // Piso: monto fijo por día, guardado como campo `piso` de
  // `dayPrices[laborId][date]`, junto a los combos o tiers. En 0 se quita el
  // campo.
  const writeDayPiso = async (laborId, date, value) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const nextDay = { ...dayEntry, piso: Number(value) || 0 };
    if (!nextDay.piso) delete nextDay.piso;
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // Quitar el piso del día (el ✕, o dejar el monto en cero) también borra los
  // bonos de ese día que no están en una nómina. Si hay bonos asignados, antes
  // pide confirmación.
  const persistDayFloor = async (laborId, date, value) => {
    const monto = Number(value) || 0;
    if (!monto) {
      const { libres, liquidados } = pisoAssigned(workdaysByLabor[laborId] || {}, date);
      if (libres.length || liquidados.length) {
        setFloorRemove({ laborId, date, libres, liquidados });
        return;
      }
    }
    await writeDayPiso(laborId, date, monto);
  };

  const removeDayFloor = async () => {
    if (!floorRemove) return;
    const { laborId, date, libres } = floorRemove;
    setFloorRemoveBusy(true);
    try {
      const borradas = [];
      for (const wd of libres) {
        const docId = wd.id || workdayDocId(id, laborId, wd.workerRut, date, PISO_COMBO_KEY);
        await wdWrite.remove(docId);
        borradas.push(workdayMapKey(wd.workerRut, date, PISO_COMBO_KEY));
      }
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        for (const k of borradas) delete lab[k];
        return { ...prev, [laborId]: lab };
      });
      await writeDayPiso(laborId, date, 0);
      setFloorRemove(null);
      toast.success(
        borradas.length
          ? `Piso del día quitado · ${borradas.length} bono${borradas.length === 1 ? "" : "s"} eliminado${borradas.length === 1 ? "" : "s"}.`
          : "Piso del día quitado.",
      );
    } catch (err) {
      toast.error("No se pudo quitar el piso: " + (err.message || err));
    } finally {
      setFloorRemoveBusy(false);
    }
  };

  // Cuántos trabajadores con producción quedan sin piso, por día. Alimenta el
  // contador del botón "a todos" del panel de precios.
  const floorPendingByDate = useMemo(() => {
    const out = {};
    if (!activeLabor) return out;
    const wds = workdaysByLabor[activeLabor.id] || {};
    const fechas = new Set(Object.values(wds).map((wd) => wd?.date).filter(Boolean));
    for (const d of fechas) out[d] = pisoTargets(wds, d).length;
    return out;
  }, [activeLabor, workdaysByLabor]);

  // Abre la confirmación del piso masivo, con la cantidad de personas y el
  // total. No escribe nada.
  const askApplyFloorToAll = (laborId, date) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const amount = effectivePiso(labor, dayPrices, date);
    if (!amount) {
      toast.warning("Configura primero el piso de este día.");
      return;
    }
    const ruts = pisoTargets(workdaysByLabor[laborId] || {}, date);
    if (ruts.length === 0) {
      toast.info("Todos los que tienen producción ese día ya tienen el piso.");
      return;
    }
    setFloorBulk({ laborId, date, ruts, amount });
  };

  // Escribe un workday `_piso` por cada trabajador pendiente. Es exactamente lo
  // mismo que apretar el toggle de cada uno en la columna 🪙, en lote.
  const applyFloorToAll = async () => {
    if (!floorBulk) return;
    const { laborId, date, ruts, amount } = floorBulk;
    setFloorBulkBusy(true);
    try {
      const escritos = {};
      for (const rut of ruts) {
        const mapKey = workdayMapKey(rut, date, PISO_COMBO_KEY);
        const docId = workdayDocId(id, laborId, rut, date, PISO_COMBO_KEY);
        const next = {
          cycleId: id, laborId, workerRut: rut, date,
          qty: 0, amount,
          pisoOnly: true,
          workerId: workerIdFor(laborId, rut),
        };
        await wdWrite.upsert(docId, next);
        escritos[mapKey] = { id: docId, ...next };
      }
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...escritos },
      }));
      setFloorBulk(null);
      toast.success(`Piso asignado a ${ruts.length} trabajador${ruts.length === 1 ? "" : "es"}.`);
    } catch (err) {
      toast.error("No se pudo asignar el piso: " + (err.message || err));
    } finally {
      setFloorBulkBusy(false);
    }
  };

  // Toggle del piso de un trabajador en un día: crea o borra su workday `_piso`
  // (`pisoOnly: true`) con el piso configurado para ese día.
  const togglePiso = async (laborId, date, workerRut) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const mapKey = workdayMapKey(workerRut, date, PISO_COMBO_KEY);
    const docId = workdayDocId(id, laborId, workerRut, date, PISO_COMBO_KEY);
    const existing = (workdaysByLabor[laborId] || {})[mapKey];
    if (existing) {
      // Un piso que ya está en una nómina no se borra: le descuadraría el total.
      if (existing.payrollId) {
        toast.warning("Ese piso ya está en una nómina. Hay que eliminar o editar la nómina para poder quitarlo.");
        return;
      }
      await wdWrite.remove(docId);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        delete lab[mapKey];
        return { ...prev, [laborId]: lab };
      });
      return;
    }
    const amount = effectivePiso(labor, dayPrices, date);
    if (!amount) {
      toast.warning("Configura primero el piso por día o el piso por defecto de la labor.");
      return;
    }
    const next = {
      cycleId: id, laborId, workerRut, date,
      qty: 0, amount,
      pisoOnly: true,
      workerId: workerIdFor(laborId, workerRut),
    };
    await wdWrite.upsert(docId, next);
    setWorkdaysByLabor((prev) => {
      const lab = { ...(prev[laborId] || {}) };
      lab[mapKey] = { id: docId, ...next };
      return { ...prev, [laborId]: lab };
    });
  };

  const addComboToDay = async (laborId, date, x, y) => {
    const ck = makeComboKey(x, y);
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    if (dayEntry[ck]) return;
    const nextDay = { ...dayEntry, [ck]: { price: 0, mode: defaultMode } };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // ============================================================
  // Helpers de tratoHE
  // ============================================================

  const tratoHERates = (labor) => ({
    bonusManejo: labor?.bonusManejo ?? DEFAULT_BONUS_MANEJO,
    bonusSupervision: labor?.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
    overtimeRate: labor?.overtimeRate ?? DEFAULT_OVERTIME_RATE,
    baseDayDefault: labor?.baseDayDefault ?? DEFAULT_BASE_DAY,
  });

  const effectiveDayPrice = (labor, dayCfg) =>
    Number(dayCfg?.price) || Number(labor?.baseDayDefault) || DEFAULT_BASE_DAY;

  // Labores main/supervision/extra: guarda el precio sugerido del día (uno por
  // día, no por trabajador). No recalcula los workdays existentes: solo cambia
  // el sugerido que muestran las celdas vacías.
  const persistNormalDayPrice = async (laborId, date, price) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry["0_0"] || { price: 0, mode: "normal" };
    const merged = { ...current, price: Number(price) || 0 };
    const nextDay = { ...dayEntry, "0_0": merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // Guarda el monto del día de un trabajador en labores main/supervision/extra.
  // Lo usan la grilla (onCellValueChanged), el botón del precio sugerido y el
  // modal de edición por trabajador. Con monto 0 borra el workday.
  const commitNormalAmount = async (date, workerRut, rawAmount) => {
    const laborId = activeLabor.id;
    const amount = parseAmount(rawAmount) || 0;
    const docId = workdayDocId(id, laborId, workerRut, date, SINGLE_COMBO);
    const mapKey = workdayMapKey(workerRut, date, SINGLE_COMBO);
    // Si la escritura falla, devuelve el último monto guardado; el llamador
    // pinta la celda con este valor.
    try {
      if (amount === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, { cycleId: id, laborId, workerRut, date, amount, workerId });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = { ...lab[mapKey], cycleId: id, laborId, workerRut, date, amount, workerId };
          return { ...prev, [laborId]: lab };
        });
      }
      return { amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  const computeTratoHEAmount = (labor, dayCfg, wd) =>
    calcTratoHEAmount({
      qty: wd.qty,
      overtimeHours: wd.overtimeHours,
      hasManejo: wd.hasManejo,
      hasSupervision: wd.hasSupervision,
      extras: wd.extras,
      dayPrice: effectiveDayPrice(labor, dayCfg),
      dayMode: dayCfg?.mode || "normal",
      ...tratoHERates(labor),
    });

  const upsertTratoHEWorkday = async (laborId, date, workerRut, patch) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return { amount: 0 };
    const mapKey = workdayMapKey(workerRut, date, SINGLE_COMBO);
    const docId = workdayDocId(id, laborId, workerRut, date, SINGLE_COMBO);
    const existing = (workdaysByLabor[laborId] || {})[mapKey];
    const defaults = labor.bonusDefaults?.[workerRut] || {};
    const seed = existing
      ? { ...existing }
      : { qty: 0, overtimeHours: 0, extras: 0, hasManejo: !!defaults.manejo, hasSupervision: !!defaults.supervision };
    const merged = { ...seed, ...patch };
    const dayCfg = getDaySingle(dayPrices, laborId, date, "normal");
    const amount = computeTratoHEAmount(labor, dayCfg, merged);
    const wd = { cycleId: id, laborId, workerRut, date, ...merged, amount, workerId: workerIdFor(laborId, workerRut) };

    // Si falla devuelve `ok: false`: la rama tratoHE de onCellValueChanged pinta
    // qty/HE con su propio valor (`newVal`) y usa esta bandera para revertir
    // el campo.
    try {
      if (!workdayHasData(wd)) {
        if (existing) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
        return { amount: 0 };
      }
      await wdWrite.upsert(docId, wd);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        lab[mapKey] = wd;
        return { ...prev, [laborId]: lab };
      });
      return { amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { amount: existing?.amount || 0, ok: false };
    }
  };

  // Guarda la cantidad de un combo (calidad×envase) de un trabajador en un día
  // de cosecha; qty 0 borra el workday. Lo usan la grilla
  // (onCellValueChanged) y el modal de edición por trabajador.
  const commitCosechaCombo = async (date, comboKey, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const { x, y } = parseComboKey(comboKey);
    const docId = workdayDocId(id, laborId, workerRut, date, comboKey);
    const mapKey = workdayMapKey(workerRut, date, comboKey);
    const qty = parseAmount(rawQty) || 0;
    const combo = getCombo(laborId, date, comboKey);
    const amount = combo.mode === "flat" ? combo.price : qty * combo.price;

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date,
          qualityX: x, containerY: y, qty, amount, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = { ...lab[mapKey], cycleId: id, laborId, workerRut, date, qualityX: x, containerY: y, qty, amount, workerId };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  // Guarda la cantidad de un tier de precio de un trabajador en un día de
  // trato; qty 0 borra el workday.
  const commitTratoTier = async (date, tierKey, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const docId = workdayDocId(id, laborId, workerRut, date, tierKey);
    const mapKey = workdayMapKey(workerRut, date, tierKey);
    const qty = parseAmount(rawQty) || 0;

    const tiers = dayTiersByDate[date] || [];
    const tier = tiers.find((t) => t.key === tierKey);
    const amount = tier && tier.mode === "flat" ? (qty > 0 ? tier.price : 0) : qty * (tier?.price || 0);

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        // `tiers` (una sola clave, "0") es la copia que normalizeTratoWorkday
        // agrega al cargar; se reescribe junto con qty/amount para que
        // coincidan.
        const tiersField = { "0": { qty, amount } };
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date, qty, amount,
          tiers: tiersField, totalAmount: amount, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = {
            ...lab[mapKey],
            cycleId: id, laborId, workerRut, date, qty, amount,
            tiers: tiersField, totalAmount: amount, workerId,
          };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  // Guarda la cantidad de una etapa de un trabajador en un día de
  // tratoEtapas; qty 0 borra el workday.
  const commitEtapaQty = async (date, stageId, workerRut, rawQty) => {
    const laborId = activeLabor.id;
    const docId = workdayDocId(id, laborId, workerRut, date, stageId);
    const mapKey = workdayMapKey(workerRut, date, stageId);
    const qty = parseAmount(rawQty) || 0;
    const { price, mode } = getStageDayPrice(dayPrices, laborId, date, stageId);
    const amount = computeStageDayAmount(mode, price, qty);

    try {
      if (qty === 0) {
        if (wdMap[mapKey]) {
          await wdWrite.remove(docId);
          setWorkdaysByLabor((prev) => {
            const lab = { ...(prev[laborId] || {}) };
            delete lab[mapKey];
            return { ...prev, [laborId]: lab };
          });
        }
      } else {
        // `stageId` explícito en el doc: lo consumen el conteo (getEtapasTotals),
        // los resúmenes y la nómina sin tener que re-parsear el docId.
        const workerId = workerIdFor(laborId, workerRut);
        await wdWrite.upsert(docId, {
          cycleId: id, laborId, workerRut, date, qty, amount, stageId, workerId,
        });
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[laborId] || {}) };
          lab[mapKey] = {
            ...lab[mapKey],
            cycleId: id, laborId, workerRut, date, qty, amount, stageId, workerId,
          };
          return { ...prev, [laborId]: lab };
        });
      }
      return { qty, amount };
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return { qty: wdMap[mapKey]?.qty || 0, amount: wdMap[mapKey]?.amount || 0 };
    }
  };

  const recalcDayTratoHE = async (laborId, date) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoHE") return;
    const dayCfg = getDaySingle(dayPrices, laborId, date, "normal");
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const w of labor.workers) {
      const mapKey = workdayMapKey(w.rut, date, SINGLE_COMBO);
      const wd = wdMapForLabor[mapKey];
      if (!wd) continue;
      const amount = computeTratoHEAmount(labor, dayCfg, wd);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, w.rut, date, SINGLE_COMBO);
      const next = { ...wd, amount, workerId: w.id || w.rut };
      await wdWrite.upsert(docId, next);
      updates[mapKey] = next;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const recalcAllTratoHE = async (laborId) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor || labor.type !== "tratoHE") return;
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    const updates = {};
    for (const k in wdMapForLabor) {
      const wd = wdMapForLabor[k];
      const dayCfg = getDaySingle(dayPrices, laborId, wd.date, "normal");
      const amount = computeTratoHEAmount(labor, dayCfg, wd);
      if (amount === wd.amount) continue;
      const docId = workdayDocId(id, laborId, wd.workerRut, wd.date, SINGLE_COMBO);
      const next = { ...wd, amount, workerId: workerIdFor(laborId, wd.workerRut) };
      await wdWrite.upsert(docId, next);
      updates[k] = next;
    }
    if (Object.keys(updates).length > 0) {
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...updates },
      }));
    }
  };

  const persistTratoHEDay = async (laborId, date, patch) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const current = dayEntry["0_0"] || {
      price: cycle.labors.find((l) => l.id === laborId)?.baseDayDefault ?? DEFAULT_BASE_DAY,
      mode: "normal",
      isHoliday: false,
    };
    const merged = { ...current, ...patch };
    const nextDay = { ...dayEntry, "0_0": merged };
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    await recalcDayTratoHE(laborId, date);
  };

  const persistTratoHEBonusDefaults = async (laborId, defaults) => {
    const nextLabors = cycle.labors.map((l) =>
      l.id === laborId ? { ...l, bonusDefaults: defaults } : l,
    );
    await cycleWrite({ labors: nextLabors });
    setCycle((c) => ({ ...c, labors: nextLabors }));
  };

  const removeComboFromDay = async (laborId, date, ck) => {
    const wdMapForLabor = workdaysByLabor[laborId] || {};
    for (const k in wdMapForLabor) {
      if (k.endsWith(`__${ck}`) && k.includes(`__${date}__`)) {
        if (Number(wdMapForLabor[k].qty) > 0) {
          toast.warning("No se puede quitar: hay producción registrada en este combo.");
          return false;
        }
      }
    }
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    delete dayEntry[ck];
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: dayEntry } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
    return true;
  };

  const inputKey = (laborId, date, ck) => `${laborId}__${date}__${ck}`;

  const handlePriceBlur = (laborId, date, ck, isTrato = false) => {
    const k = inputKey(laborId, date, ck);
    const raw = localPriceInputs[k];
    if (raw === undefined) return;
    const price = parseAmount(String(raw)) || 0;
    setLocalPriceInputs((prev) => { const n = { ...prev }; delete n[k]; return n; });
    // Los tiers (t0, t1…) pasan por persistComboConfig, que recalcula los workdays existentes.
    if (isTrato && typeof ck === "string" && ck.startsWith("t")) {
      const entry = dayPrices?.[laborId]?.[date];
      const cur = entry?.[ck];
      if (!cur || price !== Number(cur.price)) {
        persistComboConfig(laborId, date, ck, { price }, true);
      }
      return;
    }
    const cur = isTrato
      ? getDaySingle(dayPrices, laborId, date, defaultMode)
      : getCombo(laborId, date, ck);
    if (price !== cur.price) {
      persistComboConfig(laborId, date, ck, { price }, isTrato);
    }
  };

  const getPriceInputValue = (laborId, date, ck, isTrato = false) => {
    const k = inputKey(laborId, date, ck);
    if (k in localPriceInputs) return localPriceInputs[k];
    // Tiers (t0, t1…)
    if (isTrato && typeof ck === "string" && ck.startsWith("t")) {
      const entry = dayPrices?.[laborId]?.[date];
      const tier = entry?.[ck];
      return tier?.price || "";
    }
    const cur = isTrato
      ? getDaySingle(dayPrices, laborId, date, defaultMode)
      : getCombo(laborId, date, ck);
    return cur.price || "";
  };

  // ============================================================
  // Edición de celdas
  // ============================================================

  // Campos editables por día (combo de cosecha, tier de trato, qty/HE de
  // tratoHE, monto normal). rut/name/total/__amt/__total son derivados y no
  // se escriben en lote.
  const isEditableField = (field) => {
    if (!field) return false;
    if (["rut", "name", "total"].includes(field)) return false;
    if (field.endsWith("__amt") || field.endsWith("__total")) return false;
    return true;
  };

  const dispatchCellChange = async (node, colDef, newValue) => {
    if (!node || !colDef) return;
    if (!isEditableField(colDef.field)) return;
    // Una fila de sueldo mensual solo marca asistencia: rellenar, pegar o
    // deshacer no le escriben montos.
    if (node.data?._monthly) return;
    const oldValue = node.data?.[colDef.field];
    await onCellValueChanged({
      colDef,
      data: node.data,
      newValue,
      oldValue,
      node,
    });
  };

  // Ctrl+D (rellenar hacia abajo): copia el valor de la celda con foco a la
  // misma columna de cada fila seleccionada (api.getSelectedNodes()).
  const fillDown = async (params) => {
    if (readOnly || photoMode || qrLocked) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const colDef = params.colDef;
    if (!isEditableField(colDef?.field)) return;
    const sourceValue = params.data?.[colDef.field];
    if (sourceValue == null || sourceValue === "" || sourceValue === 0) {
      setCopyToast("Celda fuente vacía");
      setTimeout(() => setCopyToast(""), 1500);
      return;
    }
    const selected = api.getSelectedNodes();
    if (selected.length === 0) {
      setCopyToast("Selecciona filas con Shift+Click primero");
      setTimeout(() => setCopyToast(""), 2200);
      return;
    }
    pendingBatchRef.current = [];
    let count = 0;
    for (const node of selected) {
      if (node.id === params.node?.id) continue;
      await dispatchCellChange(node, colDef, sourceValue);
      count++;
    }
    if (pendingBatchRef.current.length) {
      undoStackRef.current.push(pendingBatchRef.current);
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    }
    pendingBatchRef.current = null;
    setCopyToast(`✓ Copiado a ${count} fila(s)`);
    setTimeout(() => setCopyToast(""), 1500);
  };

  // Ctrl+V: reparte las líneas del portapapeles en la misma columna, desde la
  // fila con foco hacia abajo y saltando los encabezados de grupo. De un
  // copiado con varias columnas (tabs) solo se usa la primera.
  const pasteFromClipboard = async (params) => {
    if (readOnly || photoMode || qrLocked) return;
    const api = gridRef.current?.api;
    if (!api) return;
    const colDef = params.colDef;
    if (!isEditableField(colDef?.field)) return;
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setCopyToast("No pude leer el portapapeles");
      setTimeout(() => setCopyToast(""), 2000);
      return;
    }
    if (!text) return;
    const lines = text.replace(/\r/g, "").split("\n").map((l) => l.split("\t")[0]);
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length === 0) return;
    const startIdx = params.node?.rowIndex;
    if (startIdx == null) return;
    pendingBatchRef.current = [];
    let count = 0;
    let lineIdx = 0;
    let targetIdx = startIdx;
    while (lineIdx < lines.length) {
      const node = api.getDisplayedRowAtIndex(targetIdx);
      if (!node) break;
      if (node.data?._isHeader) {
        targetIdx++;
        continue;
      }
      await dispatchCellChange(node, colDef, lines[lineIdx]);
      lineIdx++;
      targetIdx++;
      count++;
    }
    if (pendingBatchRef.current.length) {
      undoStackRef.current.push(pendingBatchRef.current);
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    }
    pendingBatchRef.current = null;
    setCopyToast(`✓ Pegadas ${count} celda(s)`);
    setTimeout(() => setCopyToast(""), 1500);
  };

  // Ctrl+Z: saca el último lote de la pila y vuelve a escribir los valores
  // anteriores. Mientras tanto, isUndoingRef evita que onCellValueChanged
  // apile la reversión.
  const undoLast = async () => {
    if (readOnly || photoMode) return;
    const batch = undoStackRef.current.pop();
    if (!batch || batch.length === 0) {
      setCopyToast("Nada que deshacer");
      setTimeout(() => setCopyToast(""), 1500);
      return;
    }
    const api = gridRef.current?.api;
    if (!api) return;
    isUndoingRef.current = true;
    try {
      for (let i = batch.length - 1; i >= 0; i--) {
        const { rut, field, oldValue } = batch[i];
        let target = null;
        api.forEachNode((n) => { if (n.data?.rut === rut) target = n; });
        if (!target) continue;
        await dispatchCellChange(target, { field }, oldValue);
      }
      setCopyToast(`↶ Deshecho (${batch.length} celda${batch.length === 1 ? "" : "s"})`);
      setTimeout(() => setCopyToast(""), 1500);
    } finally {
      isUndoingRef.current = false;
    }
  };

  const onCellKeyDown = async (params) => {
    const e = params.event;
    if (!e) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const key = String(e.key || "").toLowerCase();
    if (key === "d") {
      e.preventDefault();
      e.stopPropagation();
      await fillDown(params);
    } else if (key === "v") {
      e.preventDefault();
      e.stopPropagation();
      await pasteFromClipboard(params);
    } else if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      await undoLast();
    }
  };

  const onCellValueChanged = async (params) => {
    const field = params.colDef.field;
    if (!field || field === "total" || field === "rut" || field === "name" || field.endsWith("__amt") || field.endsWith("__total")) return;

    // Lo usan la pila de deshacer y la rama tratoHE, que revierte la celda si
    // falla el guardado.
    const oldValue = params.oldValue !== undefined ? params.oldValue : params.data?.[field];

    // Apila el valor anterior antes de escribir, salvo mientras se deshace.
    if (!isUndoingRef.current) {
      const entry = { rut: params.data?.rut, field, oldValue };
      if (pendingBatchRef.current) {
        pendingBatchRef.current.push(entry);
      } else {
        undoStackRef.current.push([entry]);
        if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
      }
    }

    if (isHarvestLabor) {
      const [date, ...rest] = field.split("__");
      const ck = rest.join("_");
      const workerRut = params.data.rut;
      const { qty, amount } = await commitCosechaCombo(date, ck, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      let newTotal = 0;
      for (const d of days) {
        const combos = dayCombosByDate[d] || [];
        for (const c of combos) {
          const f = `${d}__${c.key}`;
          if (f === field) newTotal += amount;
          else newTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", newTotal);
      return;
    }

    if (isOvertimeDayLabor) {
      const m = field.match(/^(\d{4}-\d{2}-\d{2})__(qty|he)$/);
      if (!m) return;
      const [, date, kind] = m;
      const workerRut = params.data.rut;
      const newVal = parseAmount(params.newValue) || 0;
      const patch = kind === "qty" ? { qty: newVal } : { overtimeHours: newVal };
      const result = await upsertTratoHEWorkday(activeLabor.id, date, workerRut, patch);
      // Esta rama pinta el campo con `newVal`, no con lo que devuelve la
      // función; si el guardado falló (`ok: false`) vuelve a `oldValue`.
      params.node.setDataValue(field, result.ok === false ? oldValue : newVal);
      params.node.setDataValue(`${date}__amt`, result.amount);
      let newTotal = 0;
      for (const d of days) {
        if (d === date) newTotal += result.amount;
        else newTotal += Number(params.data[`${d}__amt`]) || 0;
      }
      params.node.setDataValue("total", newTotal);
      return;
    }

    if (isPieceworkLabor) {
      const [date, ...rest] = field.split("__");
      const tierKey = rest.join("_"); // p. ej. "t0", "t1"
      const workerRut = params.data.rut;
      const { qty, amount } = await commitTratoTier(date, tierKey, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      // Recalcula el total con los datos de la fila
      let rowTotal = 0;
      for (const d of days) {
        const combos = dayTiersByDate[d] || [];
        for (const t of combos) {
          const f = `${d}__${t.key}`;
          if (f === field) rowTotal += amount;
          else rowTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", rowTotal);
      return;
    }

    if (isPieceworkStagesLabor) {
      const [date, ...rest] = field.split("__");
      const stageId = rest.join("_");
      const workerRut = params.data.rut;
      const { qty, amount } = await commitEtapaQty(date, stageId, workerRut, params.newValue);
      params.node.setDataValue(field, qty);
      params.node.setDataValue(`${field}__amt`, amount);

      let rowTotal = 0;
      for (const d of days) {
        for (const st of dayStagesByDate[d] || []) {
          const f = `${d}__${st.id}`;
          if (f === field) rowTotal += amount;
          else rowTotal += Number(params.data[`${f}__amt`]) || 0;
        }
      }
      params.node.setDataValue("total", rowTotal);
      return;
    }

    // Labor normal
    const date = field;
    const workerRut = params.data.rut;
    const { amount } = await commitNormalAmount(date, workerRut, params.newValue);
    params.node.setDataValue(date, amount);
    const total = days.reduce((acc, d) => acc + (d === date ? amount : Number(params.data[d]) || 0), 0);
    params.node.setDataValue("total", total);
  };

  // ============================================================
  // Días
  // ============================================================

  const addDay = async () => {
    if (!newDay) return;
    if (days.includes(newDay)) { setAddDayOpen(false); return; }
    const ok = await persistDays([...days, newDay].sort());
    setAddDayOpen(false);
    if (ok) showToast(`Día ${newDay} agregado`);
  };

  const addSelectedDays = async () => {
    const toAdd = [...selectedDays].filter((d) => !days.includes(d));
    if (toAdd.length === 0) { setAddDayOpen(false); return; }
    const ok = await persistDays([...days, ...toAdd].sort());
    setSelectedDays(new Set());
    setAddDayOpen(false);
    if (ok) showToast(`${toAdd.length} día${toAdd.length === 1 ? "" : "s"} agregado${toAdd.length === 1 ? "" : "s"}`);
  };

  const toggleSelectedDay = (date) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  // Un día se quita solo si no le queda nada: ni jornadas ni vueltas de
  // transporte. Las vueltas no se borran con el día, y quedarían colgando de
  // una fecha que el ciclo ya no muestra. El aviso dice todo lo que lo impide
  // de una vez, con el saludo del usuario al final.
  const removeDay = async (date) => {
    const [wds, cycleTrips] = await Promise.all([
      workdaysService.list({ wheres: [["cycleId", "==", id], ["date", "==", date]], take: 1 }),
      tripsService.listByCycle(id),
    ]);
    const trips = cycleTrips.filter((t) => t.date === date);
    const reasons = [];
    if (wds.length) {
      reasons.push("• Tiene producción registrada en alguna labor: bórrala primero desde la grilla.");
    }
    if (trips.length) {
      reasons.push(
        `• Tiene ${trips.length} vuelta${trips.length === 1 ? "" : "s"} de transporte: ` +
        `elimína${trips.length === 1 ? "la" : "las"} primero desde 🚐 Transportes.`,
      );
    }
    if (reasons.length) {
      const saludo = greeting(user, GREETING_SLOTS.removeDayBlocked);
      toast.warning(
        [`No se puede quitar ${date}:`, ...reasons].join("\n") + (saludo ? `\n\n${saludo}` : ""),
      );
      return;
    }
    setConfirmRemoveDay(date);
  };
  const doRemoveDay = async (date) => {
    const ok = await persistDays(days.filter((d) => d !== date));
    if (ok) showToast(`Día ${date} quitado`);
  };

  // ============================================================
  // Trabajadores
  // ============================================================

  const pickWorker = async (worker) => {
    const pickedId = worker.id || worker.rut;
    if (workers.find((w) => (w.id || w.rut) === pickedId)) { setPickerOpen(false); return; }
    const entry = { id: pickedId, rut: worker.rut, name: worker.name };
    if (worker.isTemp) {
      entry.isTemp = true;
      // Los temporales no tienen doc en `worker`: su líder se guarda en la
      // entrada de labor.workers y lo lee la vista por grupo.
      if (worker.groupLeader) entry.groupLeader = String(worker.groupLeader).toUpperCase();
    }
    const ok = await persistLabor({ ...activeLabor, workers: [...workers, entry] });
    setPickerOpen(false);
    if (ok) showToast(`${worker.name || "Trabajador"} agregado`);
  };

  // Toggle de sueldo mensual de un trabajador en la labor activa (`monthly:
  // true` en su entrada de labor.workers). Solo donde `allowsMonthly`: las
  // celdas del día pasan a casilla de asistencia y el workday se guarda con
  // amount 0, así no suma a la transferencia de la nómina.
  //
  // Al marcarlo, si ya tiene días con monto en la labor, pregunta antes
  // (`monthlyConfirm`): la grilla mostraría ✓ en esos días, pero sus montos se
  // seguirían pagando. Los días que ya están en una nómina no se tocan.
  const setMonthlyFlag = async (rut, monthly) => {
    const nextWorkers = workers.map((w) => (w.rut === rut ? { ...w, monthly } : w));
    await persistLabor({ ...activeLabor, workers: nextWorkers });
  };

  const toggleMonthly = async (rut) => {
    if (readOnly || !activeLabor) return;
    const worker = workers.find((w) => w.rut === rut);
    if (!worker) return;
    if (worker.monthly) {
      await setMonthlyFlag(rut, false);
      return;
    }
    // Las columnas de la grilla guardan esta función de un render anterior:
    // las jornadas se leen del ref para no decidir con datos viejos.
    const lab = workdaysRef.current[activeLabor.id] || {};
    const withAmount = Object.entries(lab).filter(
      ([, wd]) => wd?.workerRut === rut && Number(wd.amount) !== 0,
    );
    if (withAmount.length === 0) {
      await setMonthlyFlag(rut, true);
      return;
    }
    const free = withAmount.filter(([, wd]) => !wd.payrollId);
    setMonthlyConfirm({
      rut,
      name: worker.name || rut,
      free,
      freeTotal: free.reduce((s, [, wd]) => s + (Number(wd.amount) || 0), 0),
      inPayroll: withAmount.length - free.length,
    });
  };

  // Marca al trabajador como mensual. Con `convert`, deja en asistencia de $0
  // los días con monto que todavía no están en una nómina.
  const confirmMonthly = async (convert) => {
    const req = monthlyConfirm;
    if (!req || !activeLabor) return;
    setMonthlyBusy(true);
    try {
      if (convert) {
        const patch = { amount: 0, attendanceOnly: true };
        if (isOvertimeDayLabor) {
          Object.assign(patch, { qty: 0, overtimeHours: 0, extras: 0, hasManejo: false, hasSupervision: false });
        }
        for (const [, wd] of req.free) {
          const docId = wd.id || workdayDocId(id, activeLabor.id, req.rut, wd.date, SINGLE_COMBO);
          await wdWrite.upsert(docId, patch);
        }
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[activeLabor.id] || {}) };
          for (const [mapKey] of req.free) {
            if (lab[mapKey]) lab[mapKey] = { ...lab[mapKey], ...patch };
          }
          return { ...prev, [activeLabor.id]: lab };
        });
      }
      await setMonthlyFlag(req.rut, true);
      setMonthlyConfirm(null);
    } catch (err) {
      toast.error("No se pudo marcar como mensual: " + (err.message || err));
    } finally {
      setMonthlyBusy(false);
    }
  };

  // Crea o borra el workday en $0 (`attendanceOnly`) de un trabajador mensual:
  // la casilla "presente sin pago" de la celda del día. Como es un workday más,
  // cuenta en las métricas y en las jornadas. El llamador pasa
  // `currentlyPresent` desde la fila, sin depender del wdMap del closure.
  const toggleAttendance = async (rut, date, currentlyPresent) => {
    if (readOnly || !activeLabor) return;
    const mapKey = workdayMapKey(rut, date, SINGLE_COMBO);
    const docId = workdayDocId(id, activeLabor.id, rut, date, SINGLE_COMBO);
    if (currentlyPresent) {
      await wdWrite.remove(docId);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[activeLabor.id] || {}) };
        delete lab[mapKey];
        return { ...prev, [activeLabor.id]: lab };
      });
    } else {
      const workerId = workerIdFor(activeLabor.id, rut);
      await wdWrite.upsert(docId, {
        cycleId: id, laborId: activeLabor.id, workerRut: rut, date,
        amount: 0, attendanceOnly: true, workerId,
      });
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[activeLabor.id] || {}) };
        lab[mapKey] = { cycleId: id, laborId: activeLabor.id, workerRut: rut, date, amount: 0, attendanceOnly: true, workerId };
        return { ...prev, [activeLabor.id]: lab };
      });
    }
  };

  const askRemoveWorker = (rut) => {
    const w = workers.find((x) => x.rut === rut);
    if (w) setRemoveWorker(w);
  };

  // Quita a un trabajador de la labor activa, sin pasar por el ConfirmDialog:
  // la usan el diálogo de escritorio y el modal mobile, que confirma por su
  // cuenta. Devuelve true si lo quitó.
  const removeWorkerNow = async (worker) => {
    if (!worker || !activeLabor) return false;
    // Temporales: también se borran sus workdays en todo el ciclo.
    if (worker.isTemp) {
      const all = await workdaysService.list({
        wheres: [["cycleId", "==", id], ["workerRut", "==", worker.rut]],
      });
      for (const wd of all) await wdWrite.remove(wd.id);
      setWorkdaysByLabor((prev) => {
        const next = {};
        for (const [lid, m] of Object.entries(prev)) {
          const filtered = {};
          for (const [k, v] of Object.entries(m)) {
            if (v?.workerRut !== worker.rut) filtered[k] = v;
          }
          next[lid] = filtered;
        }
        return next;
      });
      const ok = await persistLabor({ ...activeLabor, workers: workers.filter((w) => w.rut !== worker.rut) });
      if (ok) showToast(`${worker.name || "Trabajador"} quitado`);
      return ok;
    }
    const existing = await workdaysService.list({
      wheres: [["cycleId", "==", id], ["laborId", "==", activeLabor.id], ["workerRut", "==", worker.rut]],
      take: 1,
    });
    if (existing.length) {
      toast.warning("No se puede quitar: el trabajador tiene producción registrada en esta labor.");
      return false;
    }
    const ok = await persistLabor({ ...activeLabor, workers: workers.filter((w) => w.rut !== worker.rut) });
    if (ok) showToast(`${worker.name || "Trabajador"} quitado`);
    return ok;
  };

  const confirmRemoveWorker = async () => {
    if (!removeWorker) return;
    setRemoveBusy(true);
    try {
      await removeWorkerNow(removeWorker);
    } finally {
      setRemoveBusy(false);
      setRemoveWorker(null);
    }
  };

  // Wrapper por rut para el modal mobile, que solo conoce el rut (viene de
  // rowDataRaw) y no la entrada cruda de activeLabor.workers.
  const removeWorkerByRut = async (rut) => {
    const w = workers.find((x) => x.rut === rut);
    if (!w) return false;
    return await removeWorkerNow(w);
  };

  // Convierte un temporal (TEMP-…) en un trabajador real: reemplaza su entrada
  // en labor.workers y reescribe cada workday del ciclo con el rut temporal.
  // El docId incluye el rut, así que cada doc se copia a un id nuevo y se
  // borra el viejo (Firestore no renombra documentos).
  const convertTempToReal = async (real) => {
    const tempRut = assignTempRut;
    if (!tempRut || !real?.rut) { setAssignTempRut(null); return; }
    if (real.isTemp) { setAssignTempRut(null); return; }
    if (real.rut === tempRut) { setAssignTempRut(null); return; }
    if (workers.some((w) => w.rut === real.rut)) {
      toast.warning("Ese trabajador ya existe en este ciclo. Quita primero la fila duplicada antes de asignar.");
      return;
    }
    setAssignBusy(true);
    try {
      const wds = await workdaysService.list({
        wheres: [["cycleId", "==", id], ["workerRut", "==", tempRut]],
      });
      for (const wd of wds) {
        const parts = String(wd.id).split("__");
        if (parts.length < 4) continue;
        parts[2] = real.rut;
        const newDocId = parts.join("__");
        const { id: _omit, ...rest } = wd;
        await wdWrite.upsert(newDocId, { ...rest, workerRut: real.rut, workerId: real.id || real.rut });
        await wdWrite.remove(wd.id);
      }
      // Reemplaza la entrada en labor.workers, conservando el orden.
      const nextWorkers = workers.map((w) =>
        w.rut === tempRut ? { id: real.id || real.rut, rut: real.rut, name: real.name } : w,
      );
      await persistLabor({ ...activeLabor, workers: nextWorkers });
      // Cambia la clave de las entradas del mapa local (de todas las labores)
      // que apuntaban al temporal.
      setWorkdaysByLabor((prev) => {
        const next = { ...prev };
        for (const [lid, m] of Object.entries(prev)) {
          const newMap = {};
          for (const [k, v] of Object.entries(m)) {
            if (v?.workerRut === tempRut) {
              const newKey = workdayMapKey(real.rut, v.date, k.split("__")[2] || SINGLE_COMBO);
              newMap[newKey] = { ...v, workerRut: real.rut };
            } else {
              newMap[k] = v;
            }
          }
          next[lid] = newMap;
        }
        return next;
      });
      setAssignTempRut(null);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo asignar el RUT: " + (err.message || err));
    } finally {
      setAssignBusy(false);
    }
  };

  // ============================================================
  // Labor
  // ============================================================

  // `initial`: cómo se abrió el formulario, para avisar si se cierra con
  // cambios sin guardar.
  const openLaborForm = (form) => setLaborForm({ ...form, initial: form.data });

  const openCreateLabor = () =>
    openLaborForm({
      mode: "create",
      data: {
        name: "", type: "extra",
        laborGroupId: "",
        newGroupName: "",
        cosechaMode: "unit",
        tratoMode: "unit",
        tratoType: catalogs.tratoTypes?.[0]?.value ?? 0,
        stages: defaultStages(),
        baseDayDefault: DEFAULT_BASE_DAY,
        bonusManejo: DEFAULT_BONUS_MANEJO,
        bonusSupervision: DEFAULT_BONUS_SUPERVISION,
        overtimeRate: DEFAULT_OVERTIME_RATE,
      },
    });

  const openEditLabor = () =>
    openLaborForm({
      mode: "edit",
      data: {
        id: activeLabor.id,
        name: activeLabor.name,
        type: activeLabor.type,
        laborGroupId: activeLabor.laborGroupId || "",
        newGroupName: "",
        cosechaMode: activeLabor.cosechaMode || "unit",
        tratoMode: activeLabor.tratoMode || "unit",
        tratoType: activeLabor.tratoType ?? (catalogs.tratoTypes?.[0]?.value ?? 0),
        stages: (activeLabor.stages && activeLabor.stages.length)
          ? activeLabor.stages.map((s) => ({ ...s }))
          : defaultStages(),
        baseDayDefault: activeLabor.baseDayDefault ?? DEFAULT_BASE_DAY,
        bonusManejo: activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO,
        bonusSupervision: activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
        overtimeRate: activeLabor.overtimeRate ?? DEFAULT_OVERTIME_RATE,
      },
    });

  const submitLabor = async (e) => {
    e.preventDefault();
    if (!laborForm.data.name.trim()) return;
    // "__new__": se crea la agrupación nueva en laborGroups antes de armar la
    // labor.
    let laborGroupId = laborForm.data.laborGroupId || null;
    if (laborGroupId === "__new__") {
      if (!laborForm.data.newGroupName.trim()) {
        toast.warning("Ponle un nombre a la agrupación nueva.");
        return;
      }
      const created = await laborGroupsService.create({
        subfaenaId: cycle.subfaenaId,
        name: toTitleName(laborForm.data.newGroupName),
        active: true,
      });
      laborGroupId = created.id;
      setLaborGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    }
    const buildLabor = (existing = {}) => {
      const base = {
        ...existing,
        name: toTitleName(laborForm.data.name),
        type: laborForm.data.type,
        laborGroupId: laborGroupId || null,
      };
      if (laborForm.data.type === "cosecha") {
        base.cosechaMode = laborForm.data.cosechaMode;
      }
      if (laborForm.data.type === "trato") {
        base.tratoMode = laborForm.data.tratoMode;
        base.tratoType = Number(laborForm.data.tratoType);
      }
      if (laborForm.data.type === "tratoEtapas") {
        base.stages = normalizeStages(laborForm.data.stages);
      }
      if (laborForm.data.type === "tratoHE") {
        base.baseDayDefault = Number(laborForm.data.baseDayDefault) || DEFAULT_BASE_DAY;
        base.bonusManejo = Number(laborForm.data.bonusManejo) || DEFAULT_BONUS_MANEJO;
        base.bonusSupervision = Number(laborForm.data.bonusSupervision) || DEFAULT_BONUS_SUPERVISION;
        base.overtimeRate = Number(laborForm.data.overtimeRate) || DEFAULT_OVERTIME_RATE;
      }
      if (["main", "supervision", "extra"].includes(laborForm.data.type)) {
        base.baseDayDefault = Number(laborForm.data.baseDayDefault) || DEFAULT_BASE_DAY;
      }
      return base;
    };
    if (laborForm.mode === "create") {
      const labor = { id: newId(), ...buildLabor(), workers: [] };
      const nextLabors = [...cycle.labors, labor];
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      setActiveLaborId(labor.id);
    } else {
      const nextLabors = cycle.labors.map((l) =>
        l.id === laborForm.data.id ? buildLabor(l) : l,
      );
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      // En tratoHE recalcula los workdays con las tarifas nuevas.
      if (laborForm.data.type === "tratoHE") {
        // Calcula con `nextLabors`: el estado `cycle` todavía tiene las
        // tarifas anteriores.
        const updatedLabor = nextLabors.find((l) => l.id === laborForm.data.id);
        const wdMapForLabor = workdaysByLabor[updatedLabor.id] || {};
        const updates = {};
        for (const k in wdMapForLabor) {
          const wd = wdMapForLabor[k];
          const dayCfg = getDaySingle(dayPrices, updatedLabor.id, wd.date, "normal");
          const amount = computeTratoHEAmount(updatedLabor, dayCfg, wd);
          if (amount === wd.amount) continue;
          const docId = workdayDocId(id, updatedLabor.id, wd.workerRut, wd.date, SINGLE_COMBO);
          const next = { ...wd, amount, workerId: workerIdFor(updatedLabor.id, wd.workerRut) };
          await wdWrite.upsert(docId, next);
          updates[k] = next;
        }
        if (Object.keys(updates).length > 0) {
          setWorkdaysByLabor((prev) => ({
            ...prev,
            [updatedLabor.id]: { ...(prev[updatedLabor.id] || {}), ...updates },
          }));
        }
      }
      // tratoEtapas: el precio es por día (no de la labor), así que cambiar
      // las etapas (nombre/counts) no recalcula montos de workdays.
    }
    setLaborForm(null);
  };

  const askRemoveLabor = () => setRemoveLabor(activeLabor);
  const confirmRemoveLabor = async () => {
    if (!removeLabor) return;
    const wds = await workdaysService.list({
      wheres: [["cycleId", "==", id], ["laborId", "==", removeLabor.id]], take: 1,
    });
    if (wds.length) {
      toast.warning("No se puede quitar: la labor tiene producción registrada.");
      setRemoveLabor(null);
      return;
    }
    if (cycle.labors.length === 1) {
      toast.warning("Debe existir al menos una labor.");
      setRemoveLabor(null);
      return;
    }
    const nextLabors = cycle.labors.filter((l) => l.id !== removeLabor.id);
    await cycleWrite({ labors: nextLabors });
    setCycle((c) => ({ ...c, labors: nextLabors }));
    setActiveLaborId(nextLabors[0]?.id || null);
    setRemoveLabor(null);
  };

  // ============================================================
  // Varios
  // ============================================================

  const showToast = (msg) => {
    setCopyToast(msg);
    setTimeout(() => setCopyToast(""), 1800);
  };

  const handleCloseCycle = async () => {
    setCloseBusy(true);
    try {
      const patch = closedCyclePatch(cycle);
      await cyclesService.update(id, patch);
      setCycle((c) => ({ ...c, ...patch }));
      setCloseFlow(false);
      showToast("Ciclo cerrado");
    } finally {
      setCloseBusy(false);
    }
  };

  const handleReopenCycle = () => setConfirmReopen(true);
  const doReopenCycle = async () => {
    await cyclesService.update(id, { status: "open", endDate: null });
    setCycle((c) => ({ ...c, status: "open", endDate: null }));
    showToast("Ciclo reabierto");
  };

  const exportPng = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await captureFullWidthDataUrl(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${cycle.label}_${activeLabor?.name || "labor"}_${todayStr()}.png`.replace(/\s+/g, "_");
      link.href = dataUrl;
      link.click();
      showToast("PNG descargado");
    } catch (err) {
      console.error(err);
      showToast("No se pudo generar el PNG");
    } finally {
      setExporting(false);
    }
  };

  const copyImage = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const blob = await captureFullWidthBlob(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("Imagen copiada");
    } catch (err) {
      console.error(err);
      showToast("No se pudo copiar la imagen");
    } finally {
      setExporting(false);
    }
  };

  const printPhoto = async () => {
    if (!photoRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await captureFullWidthDataUrl(photoRef.current, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
      const win = window.open("", "_blank", "width=1100,height=800");
      if (!win) {
        toast.warning("Permite las ventanas emergentes para imprimir.");
        return;
      }
      win.document.write(`<!DOCTYPE html><html><head><title>${cycle.label} · ${activeLabor?.name || ""}</title>
        <style>
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          body { margin: 0; padding: 16px; background: #fff; }
          img { max-width: 100%; height: auto; display: block; }
          @media print { @page { size: landscape; margin: 8mm; } body { padding: 0; } }
        </style>
      </head><body><img src="${dataUrl}" /></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 300);
    } catch (err) {
      console.error(err);
      showToast("No se pudo imprimir");
    } finally {
      setExporting(false);
    }
  };

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
      photoMode,
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
      togglePiso,
      upsertTratoHEWorkday,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, readOnly, photoMode, qrLocked, isHarvestLabor, isPieceworkLabor, isPieceworkStagesLabor, isOvertimeDayLabor, dayCombosByDate, dayTiersByDate, dayStagesByDate, catalogs, dayPrices, activeLabor, overtimeDayView, harvestView, pieceworkView, activeLaborDayNotes, legacyDayNotes, activeLaborDatesWithProduction, daysWithFloor, isMobile],
  );

  if (loading) return <div className="text-[var(--color-muted)]">Cargando...</div>;
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

  if (photoMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)] p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button onClick={copyImage} disabled={exporting} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {exporting ? "..." : "🖼 Copiar imagen"}
          </button>
          <button onClick={exportPng} disabled={exporting} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60">
            {exporting ? "Generando..." : "📥 Descargar PNG"}
          </button>
          <button onClick={printPhoto} disabled={exporting} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            🖨 Imprimir
          </button>
          <button onClick={() => setPhotoMode(false)} className="ml-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            Salir modo foto
          </button>
        </div>
        <div ref={photoRef} className="flex flex-1 flex-col bg-[var(--color-bg)] p-4">
          <div className="mb-3">
            <h1 className="text-xl font-semibold tracking-tight">{cycle.label} · {activeLabor?.name}</h1>
            <p className="text-xs text-[var(--color-muted)]">
              {job?.name || "—"}
              {subjob && ` · ${subjob.name}`}
              {` · ${workers.length} trabajadores · ${days.length} días`}
            </p>
          </div>
          <div className="flex-1">{grid}</div>
        </div>
        {copyToast && (
          <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-lg">
            {copyToast}
          </div>
        )}
      </div>
    );
  }

  // Lo que leen las secciones de la pantalla (ver CycleDetailContext).
  const cycleDetailContext = {
    LEADER_NONE,
    activeLabor,
    addDayOpen,
    addPriceBusy,
    addPriceModal,
    addSelectedDays,
    applyFloorToAll,
    askApplyFloorToAll,
    askRemoveLabor,
    balanceWithTransport,
    catalogs,
    closeBusy,
    closeDayNote,
    closeFlow,
    closed,
    columnFilterActive,
    confirmMonthly,
    confirmRemoveDay,
    confirmRemoveLabor,
    confirmRemoveWorker,
    confirmReopen,
    harvestView,
    cycle,
    cycleTrips,
    cycleWrite,
    dayCombosByDate,
    dayNoteBusy,
    dayNoteDirty,
    dayPrices,
    dayTiersByDate,
    days,
    defaultMode,
    doRemoveDay,
    doReopenCycle,
    editingDayNote,
    editingDayNoteText,
    activeStages,
    job,
    floorMetricsByLabor,
    getPriceInputValue,
    goToDayNote,
    grandTotal,
    gridVisible,
    groupView,
    handleCloseCycle,
    handlePriceBlur,
    handleReopenCycle,
    hasNextDayNote,
    hasPrevDayNote,
    inputKey,
    isHarvestLabor,
    isNormalLabor,
    isQtyLabor,
    isPieceworkStagesLabor,
    isOvertimeDayLabor,
    isPieceworkLabor,
    laborForm,
    laborGroups,
    localPriceInputs,
    metricsCollapsed,
    monthlyBusy,
    monthlyConfirm,
    navigate,
    nextCycle,
    onlyWithProduction,
    openCreateLabor,
    openEditLabor,
    orderedGroups,
    overtimeDayMetricsByLabor,
    peopleByDate,
    persistComboConfig,
    persistDayFloor,
    persistNormalDayPrice,
    persistStagePrice,
    photoMode,
    pieceworkPeopleCountByLabor,
    pieceworkTierMetricsByLabor,
    floorBulk,
    floorBulkBusy,
    floorPendingByDate,
    floorRemove,
    floorRemoveBusy,
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
    setHarvestView,
    setDayModeEdit,
    setDayPrices,
    setDefaultLeadersOpen,
    setEditingDayNoteText,
    setGroupView,
    setLaborForm,
    setLocalPriceInputs,
    setMetricsCollapsed,
    setMonthlyConfirm,
    setOnlyWithProduction,
    setPickerOpen,
    setFloorBulk,
    setFloorRemove,
    setPricesCollapsed,
    setRemoveCombo,
    setRemoveLabor,
    setRemoveWorker,
    setSelectedDays,
    setSummaryOpen,
    setToolbarCollapsed,
    setTransportsOpen,
    setOvertimeDayView,
    setPieceworkView,
    setViewMonth,
    stagesDaySummary,
    subjob,
    submitLabor,
    toggleSelectedDay,
    toolbarCollapsed,
    totalQtyByContainerByLabor,
    totalQtyByDayCombo,
    totalQtyByLabor,
    totalsByLabor,
    transportTotal,
    overtimeDayView,
    pieceworkView,
    isGroupedView,
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

            {!photoMode && isMobile && workers.length > 0 && (
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
              {isMobile && !showDesktopGrid && !photoMode ? (
                <CycleWorkerList
                  rows={rowDataRaw}
                  days={days}
                  fmtCurrency={fmtCurrency}
                  onSelectWorker={setEditingCycleWorkerRut}
                  onlyWithProduction={onlyWithProduction}
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
            await upsertTratoHEWorkday(bonusEdit.laborId, bonusEdit.date, bonusEdit.workerRut, patch);
            setBonusEdit(null);
          }}
        />

        <CycleWorkerEditModal
          workerRut={editingCycleWorkerRut}
          onClose={() => setEditingCycleWorkerRut(null)}
          activeLabor={activeLabor}
          row={editingCycleWorkerRut ? rowDataRaw.find((r) => r.rut === editingCycleWorkerRut) : null}
          days={days}
          dayPrices={dayPrices}
          dayCombosByDate={dayCombosByDate}
          dayTiersByDate={dayTiersByDate}
          dayStagesByDate={dayStagesByDate}
          daysWithFloor={daysWithFloor}
          catalogs={catalogs}
          readOnly={readOnly}
          fmtCurrency={fmtCurrency}
          commitCosechaCombo={commitCosechaCombo}
          commitTratoTier={commitTratoTier}
          commitEtapaQty={commitEtapaQty}
          commitNormalAmount={commitNormalAmount}
          upsertTratoHEWorkday={upsertTratoHEWorkday}
          toggleAttendance={toggleAttendance}
          togglePiso={togglePiso}
          persistComboConfig={persistComboConfig}
          addComboToDay={addComboToDay}
          removeComboFromDay={removeComboFromDay}
          persistStagePrice={persistStagePrice}
          persistDayFloor={persistDayFloor}
          persistNormalDayPrice={persistNormalDayPrice}
          persistTratoHEDay={persistTratoHEDay}
          toggleMonthly={toggleMonthly}
          onRemoveWorker={removeWorkerByRut}
          isGroupedView={isGroupedView}
          currentLeader={editingCycleWorkerRut ? rutToLeader.get(editingCycleWorkerRut) || null : null}
          enabledLeaders={enabledLeaders}
          leaderBusy={groupBusy}
          assignLeaderToWorker={assignLeaderToWorker}
          LEADER_LOCAL={LEADER_LOCAL}
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
            await persistTratoHEDay(dayModeEdit.laborId, dayModeEdit.date, patch);
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
            await persistTratoHEBonusDefaults(activeLabor.id, defaults);
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
