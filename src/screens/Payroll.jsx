import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { captureFullWidthBlob } from "../utils/imageCapture";
import {
  faenasService,
  subfaenasService,
  cyclesService,
  workersService,
  workdaysService,
  listWorkdaysByCycles,
  payrollSnapshotsService,
} from "../services";
import {
  payrollsService,
  markPaid as markPayrollPaid,
  markPending as markPayrollPending,
  tagWorkdaysWithPayroll,
  untagWorkdaysFromPayroll,
  removeWorkerFromPayroll,
  addWorkdaysToPayroll,
  workdaysForNewPayroll,
  markBankPaid,
  revertBankPaid,
  setCashPaidRuts,
  pendingCashOf,
  pendingCashItemsOf,
} from "../services/payrollsService";
import {
  listPendingForWorkers,
  applyAdvancesToPayroll,
  restoreAdvancesFromPayroll,
  advanceSign,
  advanceTypeMeta,
  hasInstallmentPlan,
  installmentProgress,
  cadenceMeta,
} from "../services/advancesService";
import {
  saveSnapshot,
  deleteSnapshot,
  readSnapshot,
  extendSnapshot,
  snapshotCycleOf,
  snapshotWorkdayOf,
  snapshotAdvanceOf,
} from "../services/payrollSnapshots";
import { workerKeys } from "../services/workersService";
import { formatRutForDisplay } from "../utils/rutUtils";
import { bankName, accountTypeLabel, ACCOUNT_TYPES, isCashBank, CASH_BANK_CODE } from "../utils/banks";
import { getTratoTierTotals, getDayCombos, getDaySingle, getTratoTiers, tratoTypeLabel, tratoUnitLabel, cosechaUnit, comboLabel, containerLabel, formatLaborDayPrice } from "../utils/cosechaCombos";
import { describeStage, normalizeStages, stageTag } from "../utils/tratoEtapas";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { getPublishedPortal, publishPayrollToPortal } from "../services/portalService";
import { planPayrollRecalc, applyPayrollRecalc, liveProfileOf } from "../services/payrollRecalc";
import {
  aggregateWorkerAmounts,
  workdayPayAmount,
  downloadBchileXlsx,
  downloadNominaOnlyXlsx,
  payrollSuggestedName,
  groupCashByLeader,
  splitBankAndCash,
  validateAccountNumber,
  normalizeLeader,
} from "../utils/payroll";
import {
  allocateAdvances,
  advanceNote,
  cycleDetailOf,
  withPaidPeriods,
  planAddWorkdays,
  workerDayRows,
  asPayrollWorker,
  inChosenCycles,
  newPayrollCycleDetails,
  stillFreeWorkdays,
  payrollCycleBreakdown,
} from "../utils/payrollItem";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import WorkerSummaryModal from "../components/WorkerSummaryModal";
import RowMenu from "../components/RowMenu";
import CloseCyclesModal from "../components/CloseCyclesModal";
import { settledOpenCycles, splitTaken, payrollStatusMap } from "../utils/cycleClosing";
import { useIsMobile } from "../hooks/useIsMobile";
import { matchesSearchQuery } from "../utils/textSearch";
import { localIsoDate } from "../utils/dates";
import { CASH_DENOMINATIONS, DEFAULT_AVAILABLE, estimateCashBreakdown, isBill } from "../utils/cashBreakdown";
import { currentRutResolver } from "../utils/workerRut";

const fmtCurrency = (v) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(
    Number(v) || 0,
  );

// "2026-08-31" -> "31/08". Etiqueta de día corta para las tablas de resumen.
const fmtDayShortEs = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  return m ? `${m[3]}/${m[2]}` : (d || "");
};

const fmtDate = (v) => {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL");
};

const accountTypeShort = (v) => ACCOUNT_TYPES.find((t) => t.value === Number(v))?.code || "JUV";

const SELECTION_KEY = "payroll_cycle_selection";
const loadSelection = () => {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
};
const saveSelection = (set) => {
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify([...set])); } catch {}
};

// Descarga el snapshot como archivo JSON. En el nombre, cada tramo de
// caracteres que no sean letra, número, "_" o "-" pasa a "_".
function downloadSnapshotJson(payrollName, snapshot) {
  try {
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = String(payrollName || "Nomina").replace(/[^a-z0-9_-]+/gi, "_");
    a.href = url;
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (err) {
    console.warn("No se pudo descargar el JSON del snapshot:", err);
  }
}

// Los anticipos cuelgan del rut vigente del trabajador, y un workday guarda el
// rut que tenía al crearse: se resuelve contra la ficha, con la lista de
// trabajadores ya cargada (sin lecturas).
const resolverRutVigente = (workers) => {
  const rutOf = currentRutResolver(workers);
  return (agg) => rutOf(agg.rut, agg.workerId);
};

// Copia de los items con el rut vigente, para exportar. Solo para archivos que
// se leen afuera: dentro de la app los items conservan el rut guardado, que es
// la clave con que se cruzan con jornadas y anticipos.
const withCurrentRuts = (items, rutOf) =>
  (items || []).map((it) => ({ ...it, rut: rutOf(it.rut, it.workerId) }));

export default function Payroll() {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  // Cabecera de la nómina publicada en el portal de trabajadores.
  const [portal, setPortal] = useState(null);
  const [publishing, setPublishing] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [tab, setTab] = useState("create"); // create | history | workers
  const [loading, setLoading] = useState(true);
  const [faenas, setFaenas] = useState([]);
  const [subfaenas, setSubfaenas] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [workers, setWorkers] = useState([]);
  // Rut vigente para mostrar, ver utils/workerRut.js.
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);
  const [payrolls, setPayrolls] = useState([]);

  const [selectedCycleIds, setSelectedCycleIds] = useState(loadSelection);
  // Labores que entran a la nómina, por ciclo seleccionado. No se persiste,
  // a diferencia de selectedCycleIds. Al marcar un ciclo entran todas sus
  // labores, y un ciclo marcado sin entrada en el mapa también entra con todas.
  const [selectedLaborsByCycle, setSelectedLaborsByCycle] = useState(() => new Map());
  // Personas sueltas: días puntuales de alguien, elegidos en el mismo modal que
  // "+ Agregar persona" del detalle de una nómina. Se suman a lo que traen los
  // ciclos (o arman la nómina por sí solas) y no se persisten.
  // [{ worker, workdayIds, rowKeys, filas: [{ cycleId, laborId, date, amount }] }]
  const [people, setPeople] = useState([]);
  // null = cerrado; {} abre el modal en la búsqueda, { worker } directo en esa
  // persona, para corregir lo que se le eligió.
  const [personModal, setPersonModal] = useState(null);
  // Los ciclos de la nómina que se está previsualizando, para el filtro por
  // ciclo: los elegidos más los que traen las personas sueltas.
  const [previewCycles, setPreviewCycles] = useState([]);
  const [step, setStep] = useState(1); // 1 = elegir ciclos, 2 = vista previa
  const [previewItems, setPreviewItems] = useState([]); // items de la vista previa; la forma se arma en buildPreview
  // Datos de origen de buildPreview, con los que generateAndSave arma el
  // snapshot sin volver a leer jornadas ni anticipos.
  const previewWorkdaysRef = useRef([]);
  const previewAdvancesRef = useRef([]);
  const [busy, setBusy] = useState(false);
  // Overlay de progreso: `step` es el mensaje principal (ej. "Etiquetando
  // jornadas"), `detail` un complemento opcional (ej. "340 / 500") y `percent`
  // va de 0 a 100. `null` oculta el overlay.
  const [progress, setProgress] = useState(null);
  const [payrollName, setPayrollName] = useState("");
  // Clasificación: "nomina" (default) o "diferencia". Las diferencias (ajustes,
  // pagos puntuales) se listan en una pestaña aparte del historial.
  const [payrollClassification, setPayrollClassification] = useState("nomina");

  const [confirmDelete, setConfirmDelete] = useState(null);
  // Confirmación genérica para flujos async que esperan la respuesta del
  // usuario a mitad de camino (ej. generateAndSave): `askConfirm` devuelve una
  // promesa que resuelve el diálogo.
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (message, opts = {}) =>
    new Promise((resolve) => setConfirmState({ message, resolve, ...opts }));
  // Mismo patrón que askConfirm, pero para el checklist de cuotas de
  // InstallmentConfirmModal — resuelve con la lista de advanceIds que el
  // admin destildó, o null si canceló.
  const [installmentConfirmState, setInstallmentConfirmState] = useState(null);
  // Si hay anticipos-con-plan entre `items`, pausa y espera que el admin
  // confirme cuáles se aplican esta corrida; si no hay ninguno, sigue de
  // largo. Devuelve `items` (ajustado) o `null` si el admin canceló.
  const confirmInstallments = async (items) => {
    const advanceById = new Map((previewAdvancesRef.current || []).map((a) => [a.id, a]));
    const candidates = [];
    for (const p of items) {
      for (const app of p.anticipoApplications || []) {
        const adv = advanceById.get(app.advanceId);
        if (adv && hasInstallmentPlan(adv)) {
          candidates.push({
            advanceId: app.advanceId,
            workerName: p.name,
            amount: app.amount,
            progress: installmentProgress(adv),
          });
        }
      }
    }
    if (candidates.length === 0) return items;

    const excludedIds = await new Promise((resolve) => setInstallmentConfirmState({ candidates, resolve }));
    setInstallmentConfirmState(null);
    if (excludedIds === null) return null;
    if (excludedIds.length === 0) return items;

    const excluded = new Set(excludedIds);
    return items.map((p) => {
      const apps = p.anticipoApplications || [];
      if (!apps.some((a) => excluded.has(a.advanceId))) return p;
      const kept = apps.filter((a) => !excluded.has(a.advanceId));
      const anticiposTotal = kept.reduce((s, x) => s + x.amount, 0);
      return {
        ...p,
        anticipoApplications: kept,
        advance: anticiposTotal,
        anticiposTotal,
        amount: Math.max(0, Math.round((Number(p.grossAmount) || 0) - anticiposTotal + (Number(p.bonus) || 0))),
      };
    });
  };
  const [detailPayroll, setDetailPayroll] = useState(null);
  // Nómina que se está renombrando, o null. El nombre es solo una etiqueta y se
  // cambia en cualquier estado; renombrar actualiza el doc y el snapshot
  // embebido, así la re-descarga del JSON trae el nombre nuevo.
  const [renaming, setRenaming] = useState(null);

  // Totales por ciclo activo: { [cycleId]: { unpaid, taken, total, firstDay,
  // lastDay, unpaidBank, unpaidCash, unpaidUnknown, unpaidByLabor,
  // takenByPayroll } }, con `unpaidByLabor[laborId]` = { unpaid, bank, cash,
  // unknown, ruts }. `taken` es lo que ya entró a alguna nómina y
  // `takenByPayroll[payrollId]`, lo que se llevó cada una: cuánto de eso está
  // pagado de verdad depende del estado de la nómina (`splitTaken`).
  const [cycleStats, setCycleStats] = useState({});
  // Separado de `loading`: al refrescar, el spinner va en el botón y no tapa
  // la pantalla con "Cargando…".
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [f, s, c, w, p] = await Promise.all([
        faenasService.list({ order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        subfaenasService.list({ order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        cyclesService.list({ order: ["createdAt", "desc"], cache: true, persist: true, ttl: 5 * 60 * 1000 }),
        workersService.list({ order: ["name", "asc"], cache: true, persist: true, ttl: 2 * 60 * 60 * 1000 }),
        payrollsService.list({ order: ["createdAt", "desc"], take: 50, cache: true, persist: true, ttl: 5 * 60 * 1000 }),
      ]);
      setFaenas(f);
      setSubfaenas(s);
      setCycles(c);
      setWorkers(w);
      setPayrolls(p);

      // Pendiente, lo que ya entró a nómina y rango de fechas de los ciclos activos.
      // firstDay/lastDay son el período que muestra CycleSelector.
      const activeIds = c.filter((x) => x.status !== "closed").map((x) => x.id);
      // Medio de pago por rut, para estimar sin lecturas extra cuánto de lo
      // pendiente sale en efectivo y cuánto por transferencia. Es un estimado
      // en bruto: el monto real por medio de pago sale en la vista previa, con
      // anticipos, bonos y los cambios de medio que haga el usuario.
      const payKindByRut = new Map();
      for (const wk of w) {
        const code = wk.bankDetails?.[3] || "";
        payKindByRut.set(wk.id, !code ? "unknown" : isCashBank(code) ? "cash" : "bank");
      }
      const stats = {};
      for (const id of activeIds) {
        stats[id] = {
          unpaid: 0, taken: 0, total: 0, firstDay: "", lastDay: "",
          unpaidBank: 0, unpaidCash: 0, unpaidUnknown: 0,
          unpaidByLabor: {}, takenByPayroll: {},
        };
      }
      const laborTypeMap = new Map();
      for (const cy of c) {
        for (const labor of cy.labors || []) laborTypeMap.set(labor.id, labor.type);
      }
      // Por ciclo y cacheado: `buildPreview` vuelve a pedir estos mismos
      // documentos al elegir los ciclos y los toma de la misma clave de caché.
      const wds = await listWorkdaysByCycles(activeIds);
      for (const wd of wds) {
        const cid = wd.cycleId;
        if (!stats[cid]) continue;
        const type = laborTypeMap.get(wd.laborId);
        let amount = 0;
        if (type === "trato") {
          amount = getTratoTierTotals(wd).amount;
        } else {
          amount = Number(wd.amount) || 0;
        }
        stats[cid].total += amount;
        if (wd.payrollId) {
          stats[cid].taken += amount;
          stats[cid].takenByPayroll[wd.payrollId] = (stats[cid].takenByPayroll[wd.payrollId] || 0) + amount;
        } else {
          stats[cid].unpaid += amount;
          // Un rut sin ficha o sin banco cargado queda aparte como "por
          // definir", no como transferencia.
          const kind = payKindByRut.get(wd.workerRut) || "unknown";
          if (kind === "cash") stats[cid].unpaidCash += amount;
          else if (kind === "bank") stats[cid].unpaidBank += amount;
          else stats[cid].unpaidUnknown += amount;
          // Lo mismo por labor, para que el total de lo elegido respete las
          // labores destildadas.
          const porLabor = stats[cid].unpaidByLabor;
          if (!porLabor[wd.laborId]) porLabor[wd.laborId] = { unpaid: 0, bank: 0, cash: 0, unknown: 0, ruts: new Set() };
          const pl = porLabor[wd.laborId];
          pl.unpaid += amount;
          pl.ruts.add(wd.workerRut);
          if (kind === "cash") pl.cash += amount;
          else if (kind === "bank") pl.bank += amount;
          else pl.unknown += amount;
        }
        if (wd.date) {
          if (!stats[cid].firstDay || wd.date < stats[cid].firstDay) stats[cid].firstDay = wd.date;
          if (!stats[cid].lastDay || wd.date > stats[cid].lastDay) stats[cid].lastDay = wd.date;
        }
      }
      setCycleStats(stats);
      return { cycles: c, stats, payrolls: p };
    } catch (err) {
      toast.error("No se pudo cargar la nómina: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getPublishedPortal().then(setPortal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publica la nómina elegida en el portal de trabajadores; reemplaza la que
  // estaba publicada.
  const runPublish = async () => {
    if (!publishing) return;
    setPublishBusy(true);
    try {
      const outcome = await publishPayrollToPortal(publishing.id, user);
      if (outcome.status === "done") {
        toast.success(`Publicada en el portal: ${outcome.result?.published ?? 0} trabajador(es)`);
        setPublishing(null);
        setPortal(await getPublishedPortal());
      } else if (outcome.status === "timeout") {
        toast.error("El backend no respondió. Pruébalo con el ping de la Consola admin.");
      } else {
        toast.error(outcome.error || "No se pudo publicar en el portal.");
      }
    } catch (err) {
      toast.error(err?.message || String(err));
    } finally {
      setPublishBusy(false);
    }
  };

  // Relee desde Firestore sin la caché local (memoria y localStorage): invalida
  // lo que alimenta el armado de la nómina y recarga. Sirve cuando otro usuario
  // cambió trabajadores, labores o jornadas y la caché todavía no vence.
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      faenasService.invalidate();
      subfaenasService.invalidate();
      cyclesService.invalidate();
      workersService.invalidate();
      workdaysService.invalidate();
      payrollsService.invalidate();
      await load();
      toast.success("Datos actualizados");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo recargar.");
    } finally {
      setRefreshing(false);
    }
  };

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
  const activeByFaena = useMemo(() => {
    const groups = new Map();
    for (const f of faenas) groups.set(f.id, { faena: f, cycles: [] });
    for (const c of cycles) {
      if (c.status === "closed") continue;
      const g = groups.get(c.faenaId);
      if (g) g.cycles.push(c);
    }
    return [...groups.values()].filter((g) => g.cycles.length > 0);
  }, [faenas, cycles]);

  const subfaenaName = (id) => subfaenas.find((s) => s.id === id)?.name || "";
  const workerById = (rut) => workers.find((w) => w.id === rut);

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

  const toggleCycle = (id) => {
    const marcar = !selectedCycleIds.has(id);
    setSelectedCycleIds((prev) => {
      const next = new Set(prev);
      if (marcar) next.add(id);
      else next.delete(id);
      saveSelection(next);
      return next;
    });
    // Sigue a la selección de ciclos, no a si el ciclo ya tenía entrada en
    // este mapa: marcar le pone todas sus labores y desmarcar lo saca.
    setSelectedLaborsByCycle((prev) => {
      const next = new Map(prev);
      if (marcar) {
        const cycle = cycles.find((c) => c.id === id);
        next.set(id, new Set((cycle?.labors || []).map((l) => l.id)));
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleLaborInCycle = (cycleId, laborId) => {
    setSelectedLaborsByCycle((prev) => {
      const next = new Map(prev);
      const todas = (cycles.find((c) => c.id === cycleId)?.labors || []).map((l) => l.id);
      const set = new Set(next.get(cycleId) ?? todas);
      if (set.has(laborId)) set.delete(laborId);
      else set.add(laborId);
      next.set(cycleId, set);
      return next;
    });
  };

  // Qué labores de un ciclo entran a la nómina, para `cycleDetails[].laborIds`:
  // `undefined` = todas (el ciclo entero), una lista = solo esas, `[]` =
  // ninguna. Recalcular respeta esta elección.
  const laborScopeOf = (cycle) => {
    const elegidas = selectedLaborsByCycle.get(cycle.id);
    if (!elegidas) return undefined;
    const todas = (cycle.labors || []).map((l) => l.id);
    if (todas.every((id) => elegidas.has(id))) return undefined;
    return todas.filter((id) => elegidas.has(id));
  };

  // Los ciclos elegidos y qué labores de cada uno: Map(cycleId → laborIds),
  // con la convención de `laborScopeOf`. Solo abiertos: la selección se guarda
  // entre sesiones, y un ciclo que se cerró desde entonces ya no aparece en la
  // lista para poder desmarcarlo.
  const chosenCycles = new Map(
    cycles
      .filter((c) => selectedCycleIds.has(c.id) && c.status !== "closed")
      .map((c) => [c.id, laborScopeOf(c)]),
  );

  // Agregar o corregir una persona suelta: la elección nueva reemplaza la que
  // tenía, en el mismo lugar de la lista.
  const savePerson = ({ worker, workdayIds, rowKeys, filas }) => {
    setPeople((prev) => {
      const entrada = { worker, workdayIds, rowKeys, filas };
      const i = prev.findIndex((p) => p.worker.id === worker.id);
      if (i < 0) return [...prev, entrada];
      const next = [...prev];
      next[i] = entrada;
      return next;
    });
    setPersonModal(null);
  };
  const removePerson = (workerId) => setPeople((prev) => prev.filter((p) => p.worker.id !== workerId));

  const buildPreview = async () => {
    if (chosenCycles.size === 0 && people.length === 0) return;
    setBusy(true);
    try {
      // Los tipos de labor de todos los ciclos: los días de una persona suelta
      // pueden ser de un ciclo que no se eligió.
      const laborTypeById = new Map();
      for (const cycle of cycles) {
        for (const labor of cycle.labors || []) {
          laborTypeById.set(labor.id, labor.type);
        }
      }

      // Lo pendiente de los ciclos y labores elegidos, más los días de las
      // personas sueltas, releídos (ver `workdaysForNewPayroll`). Las labores
      // no marcadas quedan disponibles para una próxima nómina. Los ciclos se
      // leen con el mismo helper que `load()`, así que dentro del minuto salen
      // de la caché; el botón de refrescar la invalida.
      const { workdays: allWorkdays, taken } = await workdaysForNewPayroll({
        chosen: chosenCycles,
        people: people.map((p) => ({ keys: workerKeys(p.worker), workdayIds: p.workdayIds })),
      });
      // Los ciclos de la nómina: los elegidos con alguna labor y los que traen
      // las personas sueltas. Cada item lleva una entrada por cada uno, incluso
      // en $0.
      const ciclosNomina = newPayrollCycleDetails({
        cycles,
        chosen: chosenCycles,
        workdays: allWorkdays,
        faenas,
        subfaenas,
      });

      const aggregates = aggregateWorkerAmounts(allWorkdays, laborTypeById);

      // Anticipos vigentes de todos los de la vista previa; el servidor
      // devuelve solo pending/partial.
      const claveDe = resolverRutVigente(workers);
      const candidateIds = aggregates.filter((a) => a.total > 0).map(claveDe);
      const pendingAdvances = await listPendingForWorkers(candidateIds);
      previewWorkdaysRef.current = allWorkdays;
      previewAdvancesRef.current = pendingAdvances;
      const advancesByRut = new Map();
      for (const adv of pendingAdvances) {
        const key = adv.workerId || adv.workerRut;
        const e = advancesByRut.get(key) || { anticipos: [], bonos: [] };
        if (advanceSign(adv) > 0) e.bonos.push(adv);
        else e.anticipos.push(adv);
        advancesByRut.set(key, e);
      }

      const items = aggregates
        .filter((a) => a.total > 0)
        .map((a) => {
          const w = workerById(a.rut);
          const bd = w?.bankDetails || [];
          const bankCode = bd[3] || "";
          const cash = isCashBank(bankCode);
          const byCycle = {};
          for (const { id: cid } of ciclosNomina) {
            byCycle[cid] = Math.round(a.byCycle[cid] || 0);
          }
          const accountIssue = validateAccountNumber(bd[1] || "", bankCode);
          const adv = advancesByRut.get(a.workerId || a.rut) || { anticipos: [], bonos: [] };

          const grossInt = Math.round(a.total);
          // Bonos primero y anticipos después, topeados por bruto + bonos.
          // La regla y el porqué viven en src/utils/payrollItem.js.
          const reparto = allocateAdvances({
            gross: grossInt,
            anticipos: adv.anticipos,
            bonos: adv.bonos,
          });
          const { anticipoApplications, bonoApplications, anticiposTotal, bonosTotal } = reparto;

          return {
            rut: a.rut,
            workerId: a.workerId || a.rut,
            name: w?.name || "(sin nombre)",
            paymentRut: bd[0] || a.rut,
            accountNumber: bd[1] || "",
            accountType: bd[2] != null ? Number(bd[2]) : 3,
            bankCode,
            email: w?.email || "",
            groupLeader: normalizeLeader(w?.groupLeader?.[0]),
            grossAmount: grossInt,
            advance: anticiposTotal,
            bonus: bonosTotal,
            advanceNote: advanceNote(reparto),
            anticipoApplications,
            bonoApplications,
            anticiposTotal,
            bonosTotal,
            // adelantosTotal se mantiene por compatibilidad del snapshot; siempre vale 0.
            adelantosTotal: 0,
            amount: reparto.amount,
            byCycle,
            workdayIds: a.workdayIds || [],
            include: true,
            _missing: !cash && (!w || !bd[1] || !bd[3]),
            _accountIssue: cash ? null : accountIssue,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      setPreviewItems(items);
      setPreviewCycles(ciclosNomina.map((c) => ({ id: c.id, label: c.label })));
      setPayrollName(payrollSuggestedName());
      setStep(2);
      if (taken > 0) {
        toast.warning(`Otra nómina tomó ${taken} jornada(s) de las personas sueltas mientras tanto; quedaron afuera.`);
      }
    } catch (err) {
      toast.error(`No se pudo armar la vista previa: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const totalSelected = useMemo(
    () => previewItems.filter((p) => p.include).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [previewItems],
  );
  const countSelected = useMemo(() => previewItems.filter((p) => p.include).length, [previewItems]);
  const bankSelected = useMemo(
    () => previewItems.filter((p) => p.include && !isCashBank(p.bankCode)),
    [previewItems],
  );
  const cashSelected = useMemo(
    () => previewItems.filter((p) => p.include && isCashBank(p.bankCode)),
    [previewItems],
  );
  const cashGroups = useMemo(() => groupCashByLeader(cashSelected), [cashSelected]);

  const updatePreview = (rut, patch) => {
    setPreviewItems((prev) =>
      prev.map((p) => {
        if (p.rut !== rut) return p;
        const next = { ...p, ...patch };
        const touchesAdvance = Object.prototype.hasOwnProperty.call(patch, "advance");
        const touchesBonus = Object.prototype.hasOwnProperty.call(patch, "bonus");
        if (touchesAdvance || touchesBonus) {
          const adv = Math.max(0, Number(next.advance) || 0);
          const bon = Math.max(0, Number(next.bonus) || 0);
          next.advance = adv;
          next.bonus = bon;
          next.amount = Math.max(0, Math.round((p.grossAmount || 0) - adv + bon));
          if (touchesAdvance) {
            // Reparte el total editado entre los anticipos, del más viejo al
            // más nuevo, para que el desglose cuadre con el total. El tope de
            // cada uno es el mayor entre su saldo real (`maxAmount`) y lo ya
            // aplicado, así el override puede superar la cuota sugerida.
            const apps = (p.anticipoApplications || []).map((x) => ({ ...x }));
            let remaining = adv;
            const out = [];
            for (const ap of apps) {
              if (remaining <= 0) break;
              const cap = Math.max(Number(ap.maxAmount) || 0, ap.amount);
              const take = Math.min(cap, remaining);
              if (take > 0) out.push({ advanceId: ap.advanceId, amount: take, maxAmount: ap.maxAmount });
              remaining -= take;
            }
            next.anticipoApplications = out;
            next.anticiposTotal = out.reduce((s, x) => s + x.amount, 0);
          }
          if (touchesBonus) {
            // Bonos: mismo reparto, topeado por el monto de cada aplicación.
            const apps = (p.bonoApplications || []).map((x) => ({ ...x }));
            let remaining = bon;
            const out = [];
            for (const ap of apps) {
              if (remaining <= 0) break;
              const take = Math.min(ap.amount, remaining);
              if (take > 0) out.push({ advanceId: ap.advanceId, amount: take });
              remaining -= take;
            }
            next.bonoApplications = out;
            next.bonosTotal = out.reduce((s, x) => s + x.amount, 0);
          }
        }
        return next;
      }),
    );
  };

  const bulkUpdate = (predicate, patch) => {
    setPreviewItems((prev) => prev.map((p) => (predicate(p) ? { ...p, ...patch } : p)));
  };

  const generateAndSave = async () => {
    // También entran los items en $0 con anticipo aplicado (el anticipo cubrió
    // todo el bruto), para que sus jornadas se etiqueten y sus anticipos queden
    // aplicados. El XLSX del banco filtra los de $0.
    const rawItems = previewItems.filter(
      (p) => p.include && (Number(p.amount) > 0 || Number(p.advance) > 0),
    );
    if (rawItems.length === 0) {
      toast.warning("No hay trabajadores seleccionados con monto > 0 ni anticipos por aplicar.");
      return;
    }
    // Cuotas: si hay anticipos con plan entre los incluidos, espera que el
    // admin confirme cuáles se aplican. Va antes de validar cuentas porque
    // excluir una cuota cambia el neto de un trabajador, y con eso si entra a
    // payableItems.
    const items = await confirmInstallments(rawItems);
    if (!items) return; // el admin canceló en el modal de cuotas
    // Las cuentas se validan solo para quienes reciben pago (amount > 0): los
    // de neto cero no van al banco.
    const payableItems = items.filter((p) => Number(p.amount) > 0);
    const missing = payableItems.filter((p) => !isCashBank(p.bankCode) && (!p.accountNumber || !p.bankCode));
    if (missing.length > 0) {
      const proceed = await askConfirm(
        `${missing.length} trabajador(es) bancarizados tienen datos incompletos. ¿Generar de todos modos?`,
      );
      if (!proceed) return;
    }
    const suspicious = payableItems
      .map((p) => ({ p, issue: validateAccountNumber(p.accountNumber, p.bankCode) }))
      .filter((x) => x.issue);
    if (suspicious.length > 0) {
      const sample = suspicious.slice(0, 5).map((x) => `• ${x.p.name}: ${x.issue}`).join("\n");
      const proceed = await askConfirm(
        `${suspicious.length} cuenta(s) sospechosa(s):\n${sample}${suspicious.length > 5 ? "\n…" : ""}\n\n¿Generar de todos modos?`,
      );
      if (!proceed) return;
    }
    setBusy(true);
    setProgress({ step: "Armando datos de la nómina...", detail: "", percent: 2 });
    try {
      // Los ciclos de la nómina y qué labores abarca cada uno, para que
      // Recalcular no traiga después lo que quedó afuera: los elegidos con
      // alguna labor, y con `laborIds: []` los que traen las personas sueltas.
      // El ciclo de una persona entra solo si ella quedó incluida.
      const incluidas = new Set(items.flatMap((p) => p.workdayIds || []));
      const cycleDetails = newPayrollCycleDetails({
        cycles,
        chosen: chosenCycles,
        workdays: (previewWorkdaysRef.current || []).filter((wd) => incluidas.has(wd.id)),
        faenas,
        subfaenas,
      });
      const cycleIds = cycleDetails.map((c) => c.id);
      const cycleLabels = cycleDetails.map((c) => c.label);
      const enLaNomina = new Set(cycleIds);

      const cleanItems = items.map((p) => {
        const anticipoApps = (p.anticipoApplications || []).map((x) => ({
          advanceId: x.advanceId,
          amount: Math.round(Number(x.amount) || 0),
        }));
        const bonoApps = (p.bonoApplications || []).map((x) => ({
          advanceId: x.advanceId,
          amount: Math.round(Number(x.amount) || 0),
        }));
        const advanceApplications = [...anticipoApps, ...bonoApps];
        return {
          rut: p.rut,
          workerId: p.workerId || p.rut,
          paymentRut: p.paymentRut || p.rut,
          name: p.name,
          accountNumber: p.accountNumber,
          bankCode: p.bankCode,
          accountType: p.accountType,
          email: p.email || "",
          groupLeader: p.groupLeader || "",
          grossAmount: Math.round(Number(p.grossAmount) || Number(p.amount) || 0),
          advance: Math.round(Number(p.advance) || 0),
          bonus: Math.round(Number(p.bonus) || 0),
          advanceNote: p.advanceNote || "",
          advanceIds: advanceApplications.map((x) => x.advanceId),
          advanceApplications,
          anticipoApplications: anticipoApps,
          bonoApplications: bonoApps,
          anticiposTotal: Math.round(Number(p.anticiposTotal) || 0),
          bonosTotal: Math.round(Number(p.bonosTotal) || 0),
          adelantosTotal: Math.round(Number(p.adelantosTotal) || 0),
          amount: Math.round(Number(p.amount) || 0),
          // Solo los ciclos de la nómina: el de una persona suelta que se
          // excluyó en la vista previa no tiene columna.
          byCycle: Object.fromEntries(Object.entries(p.byCycle || {}).filter(([cid]) => enLaNomina.has(cid))),
          workdayIds: p.workdayIds || [],
        };
      });

      const allWorkdayIds = cleanItems.flatMap((p) => p.workdayIds);
      const allAdvanceIds = cleanItems.flatMap((p) => p.advanceIds || []);
      const allApplications = cleanItems.flatMap((p) => p.advanceApplications || []);
      const { bank: bankItems, cash: cashItems } = splitBankAndCash(cleanItems);

      const total = cleanItems.reduce((s, x) => s + x.amount, 0);
      const bankTotal = bankItems.reduce((s, x) => s + x.amount, 0);
      const cashTotal = cashItems.reduce((s, x) => s + x.amount, 0);
      const advanceTotalSum = cleanItems.reduce((s, x) => s + (Number(x.advance) || 0), 0);
      const bonusTotalSum = cleanItems.reduce((s, x) => s + (Number(x.bonus) || 0), 0);
      const finalName = payrollName || payrollSuggestedName();

      // Snapshot estático: todo lo necesario para volver a mostrar la nómina
      // sin más lecturas ni depender de datos que pueden cambiar (detalle de
      // jornadas, origen de los anticipos y configuración de las labores).
      const wdIdSet = new Set(allWorkdayIds);
      const advIdSet = new Set(allAdvanceIds);
      const snapshot = {
        version: 1,
        generatedAt: new Date().toISOString(),
        payroll: {
          name: finalName,
          format: "bchile",
          classification: payrollClassification || "nomina",
          status: "pending",
          total, bankTotal, cashTotal,
          workerCount: cleanItems.length,
          bankCount: bankItems.length,
          cashCount: cashItems.length,
          advanceTotal: advanceTotalSum,
          bonusTotal: bonusTotalSum,
        },
        cycles: cycleDetails.map((cd) => snapshotCycleOf(cd, cycles.find((c) => c.id === cd.id))),
        workers: cleanItems,
        workdays: (previewWorkdaysRef.current || [])
          .filter((wd) => wdIdSet.has(wd.id))
          .map(snapshotWorkdayOf),
        advances: (previewAdvancesRef.current || [])
          .filter((adv) => advIdSet.has(adv.id))
          .map(snapshotAdvanceOf),
      };

      setProgress({ step: "Creando registro de la nómina...", detail: "", percent: 5 });
      const created = await payrollsService.create({
        name: finalName,
        format: "bchile",
        classification: payrollClassification || "nomina",
        status: "pending",
        cycleIds,
        cycleLabels,
        cycleDetails,
        items: cleanItems,
        total,
        bankTotal,
        cashTotal,
        workerCount: cleanItems.length,
        bankCount: bankItems.length,
        cashCount: cashItems.length,
        workdayIds: allWorkdayIds,
        advanceIds: allAdvanceIds,
        advanceTotal: advanceTotalSum,
        hasSnapshot: true,
      });

      // Snapshot completo para guardar en `payrollSnapshots` (1:1 con payroll).
      // El JSON se baja desde el menú de descargas del detalle.
      const fullSnapshot = { ...snapshot, payrollId: created.id };

      // Los tres pasos siguientes solo necesitan `created.id` y corren en paralelo:
      //   • subir el snapshot (1 escritura, hasta 1 MB)       ~15% del progreso
      //   • etiquetar jornadas (N updates, avance por chunk)  ~65%
      //   • aplicar anticipos (get M + batch update)          ~10%
      // El avance de las jornadas viene del callback; los otros dos solo
      // marcan iniciado o terminado.
      const W_SNAPSHOT = 15, W_TAG = 65, W_ADV = 10;
      let snapshotDone = false, advancesDone = false;
      let tagDone = 0, tagTotal = Math.max(1, allWorkdayIds.length);
      const recompute = () => {
        const pct =
          10 + // base por crear doc
          (snapshotDone ? W_SNAPSHOT : 0) +
          W_TAG * (tagDone / tagTotal) +
          (advancesDone ? W_ADV : 0);
        const detailParts = [];
        if (allWorkdayIds.length > 0) detailParts.push(`Jornadas ${tagDone}/${tagTotal}`);
        if (allApplications.length > 0) detailParts.push(`Anticipos ${advancesDone ? "✓" : "…"}`);
        detailParts.push(`JSON ${snapshotDone ? "✓" : "…"}`);
        setProgress({
          step: "Guardando y aplicando descuentos en paralelo...",
          detail: detailParts.join(" · "),
          percent: pct,
        });
      };
      recompute();

      const pSnapshot = (async () => {
        await saveSnapshot(created.id, fullSnapshot);
        snapshotDone = true;
        recompute();
      })();

      const pTag = (async () => {
        await tagWorkdaysWithPayroll(allWorkdayIds, created.id, (done, total) => {
          tagDone = done;
          tagTotal = Math.max(1, total);
          recompute();
        });
      })();

      const pAdv = (async () => {
        await applyAdvancesToPayroll(allApplications, created.id);
        advancesDone = true;
        recompute();
      })();

      await Promise.all([pSnapshot, pTag, pAdv]);

      setProgress({ step: "Actualizando lista...", detail: "", percent: 95 });
      // Limpia el armado y pasa al historial.
      setSelectedCycleIds(new Set());
      saveSelection(new Set());
      setSelectedLaborsByCycle(new Map());
      setPeople([]);
      setPreviewItems([]);
      setPreviewCycles([]);
      setPayrollName("");
      setStep(1);
      setTab("history");
      await load();
      setProgress({ step: "Listo ✓", detail: "", percent: 100 });
    } finally {
      setBusy(false);
      // Pequeño delay para que el "Listo ✓" sea visible un instante.
      setTimeout(() => setProgress(null), 400);
    }
  };

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
  const onRedownload = async (p) => {
    // Aplica los nombres de ciclo editados en "📝 Editar encabezados"
    // (guardados en el doc), así el XLSX usa los nombres cortos.
    const overrides = p.cycleLabelOverrides || {};
    const cyclesForExport = (p.cycleDetails || []).map((c) => {
      // Sin firstDay/lastDay guardados, toma el rango del ciclo en memoria; si
      // el ciclo ya no existe, queda vacío y el XLSX no incluye la fila Período.
      let firstDay = c.firstDay || "";
      let lastDay = c.lastDay || "";
      if (!firstDay && !lastDay) {
        const live = cycles.find((x) => x.id === c.id);
        if (live && Array.isArray(live.days) && live.days.length) {
          const sorted = [...live.days].sort();
          firstDay = sorted[0];
          lastDay = sorted[sorted.length - 1];
        }
      }
      return {
        id: c.id,
        label: overrides[c.id] || c.label,
        faenaId: c.faenaId,
        faenaName: c.faenaName,
        subfaenaId: c.subfaenaId,
        subfaenaName: c.subfaenaName,
        firstDay,
        lastDay,
      };
    });
    if (cyclesForExport.length === 0 && p.cycleIds) {
      for (const id of p.cycleIds) cyclesForExport.push({ id, label: overrides[id] || id });
    }
    await downloadBchileXlsx(withCurrentRuts(p.items, rutOf), p.name || "Nomina", cyclesForExport);
  };
  const onDownloadNominaOnly = async (p) => {
    const filename = `${p.name || "Nomina"}_BChile`;
    await downloadNominaOnlyXlsx(withCurrentRuts(p.items, rutOf), filename);
  };
  // Vuelve a bajar el JSON del snapshot de una nómina. Lo lee de
  // payrollSnapshots y, si no está, del campo `snapshot` embebido en la nómina.
  const onDownloadSnapshot = async (p) => {
    try {
      const snap = await readSnapshot(p);
      if (!snap) {
        toast.warning("Esta nómina no tiene JSON guardado (se creó antes de que existiera).");
        return;
      }
      downloadSnapshotJson(p.name || "Nomina", snap);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo descargar el JSON.");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nómina</h1>
          <p className="text-sm text-[var(--color-muted)]">Generar nóminas Banco de Chile a partir de ciclos activos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <ProgressOverlay info={progress} />
    </div>
  );
}

// Overlay de progreso, visible solo cuando hay `info`: el paso actual, un
// detalle opcional (ej. "340 / 500") y una barra. No es cancelable porque la
// mayoría de los pasos corren en paralelo.
function ProgressOverlay({ info }) {
  if (!info) return null;
  const pct = Math.max(0, Math.min(100, Math.round(Number(info.percent) || 0)));
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[420px] max-w-[90vw] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          <div className="text-sm font-medium">{info.step || "Procesando..."}</div>
        </div>
        {info.detail && (
          <div className="mb-2 text-xs text-[var(--color-muted)]">{info.detail}</div>
        )}
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-right text-xs text-[var(--color-muted)]">{pct}%</div>
      </div>
    </div>
  );
}

const PAY_SPLIT_HINT =
  "Estimado en bruto, según el banco que tiene cargado cada trabajador. El monto definitivo por medio de pago sale en la vista previa, después de anticipos/bonos y de los cambios que hagas ahí.";
const PAY_UNKNOWN_HINT =
  "Trabajadores sin banco cargado o que no están en el catálogo. Se define su medio de pago en la vista previa.";

// Paso 1 de "Generar": elegir los ciclos de la nómina y, además o en vez de
// eso, personas sueltas con sus días puntuales. Por defecto solo se listan los
// ciclos con plata pendiente; los demás quedan detrás del toggle "Sin
// pendientes", salvo los ya marcados, que siempre se ven.
function CycleSelector({
  groups,
  selected,
  toggle,
  selectedLaborsByCycle,
  toggleLaborInCycle,
  subfaenaName,
  cycleStats,
  pendingCashPayrolls = [],
  chosen = new Map(),
  people = [],
  onAddPerson,
  onEditPerson,
  onRemovePerson,
  onNext,
  busy,
  takenSplit = {},
  payrollNameOf = () => "",
  closableCount = 0,
  onClosePaid,
}) {
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [showPendingCash, setShowPendingCash] = useState(false);

  // Efectivo que quedó debiéndose de nóminas anteriores. No entra a esta
  // nómina ni se suma a nada: se entrega aparte, con su propio sobre. Está acá
  // porque es plata que hay que ir a sacar al banco el mismo día.
  const owedCash = useMemo(() => {
    let total = 0;
    let people = 0;
    for (const p of pendingCashPayrolls) {
      total += p.amount;
      people += p.count;
    }
    return { total, people, rows: pendingCashPayrolls };
  }, [pendingCashPayrolls]);

  // Lo pendiente de un ciclo marcado, contando solo las labores elegidas.
  const pendingOfChosenLabors = (cycle, stat) => {
    const elegidas = selectedLaborsByCycle?.get(cycle.id);
    const todas = (cycle.labors || []).map((l) => l.id);
    if (!elegidas || todas.every((id) => elegidas.has(id))) {
      return {
        unpaid: stat.unpaid,
        bank: stat.unpaidBank || 0,
        cash: stat.unpaidCash || 0,
        unknown: stat.unpaidUnknown || 0,
      };
    }
    const out = { unpaid: 0, bank: 0, cash: 0, unknown: 0 };
    for (const id of elegidas) {
      const pl = stat.unpaidByLabor?.[id];
      if (!pl) continue;
      out.unpaid += pl.unpaid;
      out.bank += pl.bank;
      out.cash += pl.cash;
      out.unknown += pl.unknown;
    }
    return out;
  };

  // Lo que suma cada persona suelta, sin los días que ya entran por un ciclo
  // elegido: esos ya se cuentan en el ciclo.
  const peopleRows = people.map((p) => {
    const propias = p.filas.filter((f) => !inChosenCycles(f, chosen));
    return {
      worker: p.worker,
      dias: propias.length,
      monto: propias.reduce((s, f) => s + f.amount, 0),
      cubiertas: p.filas.length - propias.length,
    };
  });
  const peopleTotal = peopleRows.reduce((s, r) => s + r.monto, 0);

  const {
    visibleGroups, emptyCount, totalPending, pendingCount,
    pendingBank, pendingCash, pendingUnknown,
    selectedTotal, selectedBank, selectedCash, selectedUnknown,
  } = useMemo(() => {
    const statOf = (id) =>
      cycleStats?.[id] || {
        unpaid: 0, taken: 0, total: 0, firstDay: "", lastDay: "",
        unpaidBank: 0, unpaidCash: 0, unpaidUnknown: 0,
      };
    let empty = 0;
    let pendingSum = 0;
    let withPending = 0;
    let bankSum = 0, cashSum = 0, unknownSum = 0;
    let selSum = 0, selBank = 0, selCash = 0, selUnknown = 0;
    const out = [];
    for (const { faena, cycles } of groups) {
      const rows = [];
      let groupPending = 0;
      let groupBank = 0;
      let groupCash = 0;
      for (const c of cycles) {
        const stat = statOf(c.id);
        const isSelected = selected.has(c.id);
        const hasPending = stat.unpaid > 0;
        if (hasPending) {
          withPending += 1;
          pendingSum += stat.unpaid;
          bankSum += stat.unpaidBank || 0;
          cashSum += stat.unpaidCash || 0;
          unknownSum += stat.unpaidUnknown || 0;
        } else {
          empty += 1;
        }
        if (isSelected) {
          const parte = pendingOfChosenLabors(c, stat);
          selSum += parte.unpaid;
          selBank += parte.bank;
          selCash += parte.cash;
          selUnknown += parte.unknown;
        }
        if (!hasPending && !showEmpty && !isSelected) continue;
        const sub = subfaenaName(c.subfaenaId);
        if (!matchesSearchQuery(`${c.label || c.id} ${sub} ${faena.name || ""}`, search)) continue;
        if (hasPending) {
          groupPending += stat.unpaid;
          groupBank += stat.unpaidBank || 0;
          groupCash += stat.unpaidCash || 0;
        }
        rows.push({ cycle: c, stat, sub, isSelected, hasPending });
      }
      if (rows.length > 0) out.push({ faena, rows, groupPending, groupBank, groupCash });
    }
    return {
      visibleGroups: out,
      emptyCount: empty,
      totalPending: pendingSum,
      pendingCount: withPending,
      pendingBank: bankSum,
      pendingCash: cashSum,
      pendingUnknown: unknownSum,
      selectedTotal: selSum,
      selectedBank: selBank,
      selectedCash: selCash,
      selectedUnknown: selUnknown,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, cycleStats, selected, selectedLaborsByCycle, search, showEmpty]);

  // "Todos / ninguno" por faena: solo opera sobre los ciclos que están a la
  // vista, así el botón nunca marca algo que el usuario no ve.
  const toggleGroup = (rows) => {
    const selectable = rows.filter((r) => r.hasPending || r.isSelected);
    const allOn = selectable.length > 0 && selectable.every((r) => r.isSelected);
    for (const r of selectable) {
      if (allOn === r.isSelected) toggle(r.cycle.id);
    }
  };

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
        No hay ciclos activos.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ciclo o faena..."
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] sm:w-56"
        />
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          disabled={emptyCount === 0}
          title="Los ciclos sin plata pendiente están ocultos porque no hay nada que pagar en ellos."
          className={`min-h-[32px] rounded-md border px-3 py-1 text-xs ${
            showEmpty
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
          } disabled:opacity-40 disabled:hover:bg-[var(--color-surface-2)]`}
        >
          {showEmpty ? "✓ " : ""}Sin pendientes ({emptyCount})
        </button>
        {closableCount > 0 && (
          <button
            type="button"
            onClick={onClosePaid}
            title="Ciclos abiertos que ya se pagaron por completo: cerrarlos de una vez."
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
          >
            🔒 Cerrar pagados ({closableCount})
          </button>
        )}
        <button
          type="button"
          onClick={onAddPerson}
          title="Sumar los días puntuales de una persona, de cualquier ciclo abierto. Sirve para armar la nómina solo con personas, o junto con los ciclos."
          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
        >
          + Agregar persona
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>
            <span className="text-[var(--color-muted)]">Ciclos con pendiente:</span>{" "}
            <span className="font-semibold tabular-nums">{pendingCount}</span>
          </span>
          <span>
            <span className="text-[var(--color-muted)]">Pendiente total:</span>{" "}
            <span className="font-semibold tabular-nums text-[var(--color-warning)]">{fmtCurrency(totalPending)}</span>
          </span>
          <span
            className="flex flex-wrap items-center gap-x-2 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1"
            title={PAY_SPLIT_HINT}
          >
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Estimado</span>
            <span className="tabular-nums">🏦 {fmtCurrency(pendingBank)}</span>
            <span className="tabular-nums">💵 {fmtCurrency(pendingCash)}</span>
            {pendingUnknown > 0 && (
              <span className="tabular-nums text-[var(--color-muted)]" title={PAY_UNKNOWN_HINT}>
                ❓ {fmtCurrency(pendingUnknown)}
              </span>
            )}
          </span>
        </div>
      </div>

      {owedCash.total > 0 && (
        <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)]/40 px-3 py-2">
          <button
            type="button"
            onClick={() => setShowPendingCash((v) => !v)}
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left text-xs"
          >
            <span className="text-[var(--color-muted)]">{showPendingCash ? "▾" : "▸"}</span>
            <span className="font-semibold">💵 Efectivo pendiente de antes:</span>
            <span className="font-semibold tabular-nums text-[var(--color-warning)]">
              {fmtCurrency(owedCash.total)}
            </span>
            <span className="text-[var(--color-muted)]">
              · {owedCash.rows.length} nómina{owedCash.rows.length === 1 ? "" : "s"} ·{" "}
              {owedCash.people} persona{owedCash.people === 1 ? "" : "s"}
            </span>
            <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">
              se entrega aparte, con su propio sobre
            </span>
          </button>
          {showPendingCash && (
            <div className="mt-2 space-y-1 border-t border-[var(--color-warning)]/40 pt-2">
              {owedCash.rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[var(--color-muted)]">· {r.count} pers.</span>
                  <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {peopleRows.length > 0 && (
        <div className="shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 sm:px-4">
            <span className="text-sm font-semibold">👤 Personas sueltas</span>
            <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
              {peopleRows.length}
            </span>
            <span className="ml-auto text-xs font-semibold tabular-nums text-[var(--color-warning)]">
              {fmtCurrency(peopleTotal)}
            </span>
          </div>
          <ul className="max-h-[30vh] divide-y divide-[var(--color-border)] overflow-auto">
            {peopleRows.map((r) => (
              <li key={r.worker.id} className="flex items-center gap-2 px-3 py-1 sm:px-4">
                <button
                  type="button"
                  onClick={() => onEditPerson(r.worker)}
                  title="Cambiar los días elegidos"
                  className="flex min-h-[40px] min-w-0 flex-1 flex-col items-start justify-center text-left"
                >
                  <span className="w-full truncate text-sm font-medium">{r.worker.name || "(sin nombre)"}</span>
                  <span className="text-xs tabular-nums text-[var(--color-muted)]">
                    {r.dias} día{r.dias === 1 ? "" : "s"} · {fmtCurrency(r.monto)}
                    {r.cubiertas > 0 &&
                      ` · ${r.cubiertas} ya entra${r.cubiertas === 1 ? "" : "n"} con un ciclo elegido`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemovePerson(r.worker.id)}
                  title="Quitar a esta persona"
                  aria-label={`Quitar a ${r.worker.name || "esta persona"}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-auto">
        {visibleGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted)]">
            {search ? "Ningún ciclo coincide con la búsqueda." : "No hay ciclos con pendientes por pagar."}
            {!search && emptyCount > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowEmpty(true)}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  Mostrar los {emptyCount} ciclo(s) sin pendientes
                </button>
              </div>
            )}
          </div>
        ) : (
          visibleGroups.map(({ faena, rows, groupPending, groupBank, groupCash }) => {
            const selectable = rows.filter((r) => r.hasPending || r.isSelected);
            const allOn = selectable.length > 0 && selectable.every((r) => r.isSelected);
            return (
              <div
                key={faena.id}
                className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 sm:px-4">
                  <span className="text-sm font-semibold">{faena.name}</span>
                  <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
                    {rows.length} ciclo{rows.length === 1 ? "" : "s"}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {groupPending > 0 && (
                      <span className="text-[11px] tabular-nums text-[var(--color-muted)]" title={PAY_SPLIT_HINT}>
                        🏦 {fmtCurrency(groupBank)} · 💵 {fmtCurrency(groupCash)}
                      </span>
                    )}
                    {groupPending > 0 && (
                      <span className="text-xs font-semibold tabular-nums text-[var(--color-warning)]">
                        {fmtCurrency(groupPending)}
                      </span>
                    )}
                    {selectable.length > 1 && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(rows)}
                        className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                      >
                        {allOn ? "Ninguno" : "Todos"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {rows.map(({ cycle: c, stat, sub, isSelected, hasPending }) => {
                    const periodLabel = (stat.firstDay || stat.lastDay)
                      ? (stat.firstDay === stat.lastDay
                          ? stat.firstDay
                          : `${stat.firstDay || "?"} → ${stat.lastDay || "?"}`)
                      : "";
                    const labors = c.labors || [];
                    // Sin entrada = todas: un ciclo que quedó marcado de otra
                    // sesión (ver `toggleCycle`).
                    const selectedLabors = selectedLaborsByCycle?.get(c.id) ?? new Set(labors.map((l) => l.id));
                    const allLaborsOn = labors.length > 0 && labors.every((l) => selectedLabors.has(l.id));
                    const noneOn = isSelected && labors.length > 0 && selectedLabors.size === 0;
                    // Con labores destildadas, el monto del ciclo es lo de las elegidas.
                    const partialLabors = isSelected && labors.length > 1 && !allLaborsOn;
                    const splitTitle = hasPending
                      ? [
                          `Estimado — 🏦 Transferencia ${fmtCurrency(stat.unpaidBank || 0)} · 💵 Efectivo ${fmtCurrency(stat.unpaidCash || 0)}`,
                          (stat.unpaidUnknown || 0) > 0
                            ? `❓ Sin banco cargado ${fmtCurrency(stat.unpaidUnknown)}`
                            : "",
                          PAY_SPLIT_HINT,
                        ].filter(Boolean).join("\n")
                      : undefined;
                    // Estar en una nómina no es estar pagado: recién lo es cuando
                    // esa nómina se marca pagada.
                    const taken = takenSplit[c.id] || { paid: 0, inPayroll: 0, openPayrollIds: [] };
                    const inPayrollTitle = `En nómina${taken.openPayrollIds.length === 1 ? "" : "s"} que todavía no se marca${taken.openPayrollIds.length === 1 ? "" : "n"} pagada${taken.openPayrollIds.length === 1 ? "" : "s"}: ${taken.openPayrollIds.map((id) => payrollNameOf(id) || id).join(", ")}`;
                    return (
                      <div
                        key={c.id}
                        className={`relative ${isSelected ? "bg-[var(--color-accent-soft)]/40" : ""} ${
                          hasPending ? "" : "opacity-60"
                        }`}
                      >
                        {isSelected && (
                          <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[var(--color-accent)]" />
                        )}
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-[var(--color-accent-soft)] sm:px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(c.id)}
                            disabled={!hasPending && !isSelected}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{c.label || c.id}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]">
                              {sub && <span>{sub}</span>}
                              {periodLabel && (
                                <span className="tabular-nums" title="Primer y último día con producción del ciclo">
                                  📅 {periodLabel}
                                </span>
                              )}
                              {taken.paid > 0 && (
                                <span className="tabular-nums" title="En nóminas ya marcadas como pagadas">
                                  ✓ {fmtCurrency(taken.paid)} pagado
                                </span>
                              )}
                              {taken.inPayroll > 0 && (
                                <span className="tabular-nums text-[var(--color-accent)]" title={inPayrollTitle}>
                                  🕓 {fmtCurrency(taken.inPayroll)} en nómina
                                </span>
                              )}
                            </div>
                            {isSelected && labors.length > 0 && !allLaborsOn && (
                              <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                                {noneOn
                                  ? "⚠ Sin labores seleccionadas — no entra a la vista previa"
                                  : `Pagar ${selectedLabors.size} de ${labors.length} labores`}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right" title={splitTitle}>
                            {hasPending ? (
                              <>
                                <div className="text-sm font-semibold tabular-nums text-[var(--color-warning)]">
                                  {fmtCurrency(partialLabors ? pendingOfChosenLabors(c, stat).unpaid : stat.unpaid)}
                                </div>
                                <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                                  {partialLabors ? `de ${fmtCurrency(stat.unpaid)}` : "pendiente"}
                                </div>
                              </>
                            ) : taken.inPayroll > 0 ? (
                              <span className="text-xs text-[var(--color-accent)]" title={inPayrollTitle}>En nómina</span>
                            ) : taken.paid > 0 ? (
                              <span className="text-xs text-[var(--color-muted)]">✓ Pagado</span>
                            ) : (
                              <span className="text-xs text-[var(--color-muted)]">Sin pendientes</span>
                            )}
                          </div>
                        </label>
                        {isSelected && labors.length > 1 && (
                          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-1.5 sm:px-4">
                            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                              Labores a pagar
                            </div>
                            <ul>
                              {labors.map((l) => {
                                const on = selectedLabors.has(l.id);
                                const pl = stat.unpaidByLabor?.[l.id];
                                return (
                                  <li key={l.id}>
                                    <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-1 text-xs hover:bg-[var(--color-accent-soft)]">
                                      <input
                                        type="checkbox"
                                        checked={on}
                                        onChange={() => toggleLaborInCycle(c.id, l.id)}
                                        className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                                      />
                                      <span className={`min-w-0 flex-1 truncate ${on ? "" : "text-[var(--color-muted)] line-through"}`}>
                                        {l.name}
                                      </span>
                                      {pl?.unpaid > 0 && (
                                        <span className="shrink-0 tabular-nums text-[var(--color-muted)]">
                                          {pl.ruts.size} pers.
                                        </span>
                                      )}
                                      <span
                                        className={`w-24 shrink-0 text-right tabular-nums ${
                                          pl?.unpaid > 0 && on ? "font-semibold" : "text-[var(--color-muted)]"
                                        }`}
                                      >
                                        {pl?.unpaid > 0 ? fmtCurrency(pl.unpaid) : "sin pendiente"}
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
        <div className="text-sm">
          <span className="font-semibold tabular-nums">{chosen.size}</span>{" "}
          <span className="text-[var(--color-muted)]">
            ciclo{chosen.size === 1 ? "" : "s"} seleccionado{chosen.size === 1 ? "" : "s"}
          </span>
          {chosen.size > 0 && (
            <span className="ml-2 tabular-nums">
              · <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(selectedTotal)}</span>
            </span>
          )}
          {peopleRows.length > 0 && (
            <span className="ml-2 tabular-nums">
              + <span className="font-semibold">{peopleRows.length}</span>{" "}
              <span className="text-[var(--color-muted)]">persona{peopleRows.length === 1 ? "" : "s"}</span>{" "}
              · <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(peopleTotal)}</span>
            </span>
          )}
          {chosen.size > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]" title={PAY_SPLIT_HINT}>
              <span>Estimado:</span>
              <span className="tabular-nums">🏦 {fmtCurrency(selectedBank)}</span>
              <span className="tabular-nums">💵 {fmtCurrency(selectedCash)}</span>
              {selectedUnknown > 0 && (
                <span className="tabular-nums" title={PAY_UNKNOWN_HINT}>❓ {fmtCurrency(selectedUnknown)}</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onNext}
          disabled={(chosen.size === 0 && peopleRows.length === 0) || busy}
          className="min-h-[36px] rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          {busy ? "Calculando..." : "Continuar →"}
        </button>
      </div>
    </div>
  );
}

function PreviewTable({
  rutOf,
  items,
  bankItems,
  cashGroups,
  updatePreview,
  bulkUpdate,
  payrollName,
  setPayrollName,
  payrollClassification,
  setPayrollClassification,
  totalSelected,
  countSelected,
  cycleOptions = [],
  onBack,
  onGenerate,
  busy,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | bank | cash | missing | suspicious | leader:<name>
  const [cycleFilter, setCycleFilter] = useState("all");

  const bankTotal = bankItems.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const cashTotal = cashGroups.reduce((s, g) => s + g.total, 0);
  const bankCount = bankItems.length;
  // Cuánta gente y en cuántos sobres va el efectivo: se arma un sobre por
  // líder de grupo, así que el conteo de grupos importa tanto como el monto.
  const cashCount = cashGroups.reduce((s, g) => s + g.items.length, 0);
  const totalAdvance = items.reduce((s, p) => s + (p.include ? Number(p.advance) || 0 : 0), 0);

  const leaders = useMemo(() => {
    const set = new Set();
    for (const p of items) {
      const l = normalizeLeader(p.groupLeader);
      if (l) set.add(l);
    }
    return [...set].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim();
    return items.filter((p) => {
      if (filter === "bank" && isCashBank(p.bankCode)) return false;
      if (filter === "cash" && !isCashBank(p.bankCode)) return false;
      if (filter === "missing" && !p._missing) return false;
      if (filter === "suspicious" && !p._accountIssue) return false;
      if (filter.startsWith("leader:") && normalizeLeader(p.groupLeader) !== filter.slice(7)) return false;
      if (cycleFilter !== "all" && !((p.byCycle?.[cycleFilter] || 0) > 0)) return false;
      if (q && !matchesSearchQuery(p.name, q) && !p.rut.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [items, search, filter, cycleFilter]);

  const toggleCash = (p) => {
    const newCode = isCashBank(p.bankCode) ? (p._origBank || "") : CASH_BANK_CODE;
    updatePreview(p.rut, {
      bankCode: newCode,
      _origBank: isCashBank(p.bankCode) ? p._origBank : p.bankCode,
    });
  };

  const matchPredicate = () => (p) => filteredItems.includes(p);
  const setIncludeAllVisible = (val) => bulkUpdate(matchPredicate(), { include: val });
  const setBankAllVisible = (cash) => {
    bulkUpdate(matchPredicate(), {});
    setPreviewItemsBulkBank(filteredItems, cash);
  };
  // Pasa cada item a efectivo o a banco con toggleCash, que guarda el banco
  // original en `_origBank`.
  const setPreviewItemsBulkBank = (list, cash) => {
    for (const p of list) {
      if (cash && !isCashBank(p.bankCode)) toggleCash(p);
      else if (!cash && isCashBank(p.bankCode)) toggleCash(p);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
        >
          ← Volver
        </button>
        <div className="flex flex-1 items-center gap-2">
          <label className="text-sm text-[var(--color-muted)]">Nombre:</label>
          <input
            value={payrollName}
            onChange={(e) => setPayrollName(e.target.value)}
            className="w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <label className="ml-2 text-sm text-[var(--color-muted)]">Tipo:</label>
          <select
            value={payrollClassification || "nomina"}
            onChange={(e) => setPayrollClassification(e.target.value)}
            title="Las diferencias son nóminas chicas de ajuste y se listan aparte"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            <option value="nomina">Nómina</option>
            <option value="diferencia">Diferencia</option>
          </select>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-right">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Total</div>
            <div className="text-sm font-semibold tabular-nums">{fmtCurrency(totalSelected)}</div>
            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
              {countSelected} trab.
              {totalAdvance > 0 && (
                <span title="Anticipos descontados en esta nómina"> · ↩ {fmtCurrency(totalAdvance)}</span>
              )}
            </div>
          </div>
          <div
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-right"
            title="Va en el archivo Banco de Chile, por transferencia"
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">🏦 Transferencia</div>
            <div className="text-sm font-semibold tabular-nums">{fmtCurrency(bankTotal)}</div>
            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">{bankCount} trab.</div>
          </div>
          <div
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-right"
            title="Plata que hay que sacar en efectivo y repartir: un sobre por jefe de grupo"
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">💵 Efectivo</div>
            <div className="text-sm font-semibold tabular-nums text-[var(--color-warning)]">{fmtCurrency(cashTotal)}</div>
            <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
              {cashCount} trab. · {cashGroups.length} sobre{cashGroups.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={busy || countSelected === 0}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          {busy ? "Generando..." : "Guardar nómina"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o RUT..."
          className="w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">Todos ({items.length})</option>
          <option value="bank">🏦 Banco</option>
          <option value="cash">💵 Efectivo</option>
          <option value="missing">⚠ Datos faltantes</option>
          <option value="suspicious">⚠ Cuenta sospechosa</option>
          {leaders.map((l) => (
            <option key={l} value={`leader:${l}`}>👥 {l}</option>
          ))}
        </select>
        {cycleOptions.length > 1 && (
          <select
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
            title="Filtra trabajadores que tienen producción en un ciclo específico"
          >
            <option value="all">📅 Todos los ciclos</option>
            {cycleOptions.map((c) => (
              <option key={c.id} value={c.id}>📅 {c.label}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-1 text-xs">
          <span className="text-[var(--color-muted)]">{filteredItems.length} visibles:</span>
          <button
            onClick={() => setIncludeAllVisible(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            ✓ Incluir
          </button>
          <button
            onClick={() => setIncludeAllVisible(false)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            ✗ Excluir
          </button>
          <button
            onClick={() => setBankAllVisible(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            💵 → Efectivo
          </button>
          <button
            onClick={() => setBankAllVisible(false)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
          >
            🏦 → Banco
          </button>
        </div>
      </div>

      <div className="min-h-[240px] flex-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-2)] text-left">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2">RUT</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Líder</th>
              <th className="px-3 py-2">Banco / Cuenta</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Bruto</th>
              <th className="px-3 py-2 text-right">Anticipo</th>
              <th className="px-3 py-2 text-right">Bono</th>
              <th className="px-3 py-2 text-right">A pagar</th>
              <th className="px-3 py-2 text-center">Pago</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((p) => {
              const cash = isCashBank(p.bankCode);
              return (
                <tr
                  key={p.rut}
                  className={`border-t border-[var(--color-border)] ${
                    p._missing ? "bg-[var(--color-danger-soft)]" : cash ? "bg-[var(--color-accent-soft)]" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={p.include}
                      onChange={(e) => updatePreview(p.rut, { include: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{formatRutForDisplay(rutOf(p.rut, p.workerId))}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {p.groupLeader || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {cash ? (
                      <span className="font-medium">Efectivo</span>
                    ) : p.bankCode ? (
                      <>
                        {bankName(p.bankCode)}
                        <span className={`ml-1 ${p._accountIssue ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}>
                          · {p.accountNumber || "—"}
                        </span>
                        {p._accountIssue && (
                          <span title={p._accountIssue} className="ml-1 cursor-help text-[var(--color-danger)]">
                            ⚠
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--color-danger)]">— faltante</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{cash ? "—" : accountTypeShort(p.accountType)}</td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--color-muted)] tabular-nums">
                    {fmtCurrency(p.grossAmount || 0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={p.advance || ""}
                      placeholder="0"
                      title="Anticipo a descontar"
                      onChange={(e) => updatePreview(p.rut, { advance: Number(e.target.value) || 0 })}
                      className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[var(--color-accent)]"
                    />
                    {Number(p.advance) > 0 && (
                      <input
                        value={p.advanceNote || ""}
                        onChange={(e) => updatePreview(p.rut, { advanceNote: e.target.value })}
                        placeholder="motivo..."
                        className="mt-1 block w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-right text-[10px] text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)]"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={p.bonus || ""}
                      placeholder="0"
                      title="Bono a sumar"
                      onChange={(e) => updatePreview(p.rut, { bonus: Number(e.target.value) || 0 })}
                      className={`w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[var(--color-accent)] ${Number(p.bonus) > 0 ? "text-[var(--color-success)]" : ""}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={p.amount || ""}
                      placeholder="0"
                      onChange={(e) => updatePreview(p.rut, { amount: Number(e.target.value) || 0 })}
                      className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm font-medium tabular-nums outline-none focus:border-[var(--color-accent)]"
                    />
                    {Number(p.amount) === 0 && Number(p.advance) > 0 && (
                      <div className="mt-0.5 text-[10px] font-normal text-[var(--color-warning)]" title="El anticipo cubrió todo el bruto. Igual se incluye en la nómina para marcar sus jornadas y el anticipo como aplicados, pero no se transfiere.">
                        ↩ liquidado por anticipo
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleCash(p)}
                      title={cash ? "Cambiar a banco" : "Pagar en efectivo"}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        cash
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                      }`}
                    >
                      {cash ? "💵 Efec." : "🏦 Banco"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-[var(--color-muted)]">
                  {items.length === 0
                    ? "No hay trabajadores con monto en lo elegido."
                    : "Ningún trabajador coincide con el filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cashGroups.length > 0 && (
        <div className="max-h-[32vh] shrink-0 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 text-sm font-semibold">💵 Efectivo agrupado por líder ({cashGroups.length})</div>
          <div className="space-y-2 text-sm">
            {cashGroups.map((g) => (
              <div key={g.leader} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
                <div className="mb-1 flex items-center justify-between text-xs font-medium">
                  <span>{g.leader}</span>
                  <span>{fmtCurrency(g.total)} · {g.items.length} trab.</span>
                </div>
                <div className="text-xs text-[var(--color-muted)]">
                  {g.items.map((it) => `${it.name} (${fmtCurrency(it.amount)})`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PayConfirmModal({ info, onCancel, onConfirm }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (info) { setText(""); setBusy(false); } }, [info]);
  if (!info) return null;
  const { payroll: p, mode } = info;
  const isRevert = mode === "revert" || mode === "revertBank";
  const owedCash = pendingCashOf(p);
  const COPY = {
    pay: {
      keyword: "Pagado",
      title: "Marcar como pagada",
      intro: p.bankPaidAt
        ? "Las transferencias ya estaban selladas, así que esto cierra el efectivo que faltaba. Los días de efectivo quedan sellados con la fecha de hoy."
        : "Vas a marcar esta nómina como pagada. Los días asociados quedan sellados con la fecha de pago.",
    },
    revert: {
      keyword: "No pagado",
      title: "Marcar como NO pagada",
      intro:
        "Vas a revertir esta nómina: el estado vuelve a pendiente y se liberan los días asociados (quedan disponibles para una nueva nómina). También se borra el sello de las transferencias y quiénes habían cobrado sueltos.",
    },
    bank: {
      keyword: "Transferencias",
      title: "Marcar solo las transferencias como pagadas",
      intro:
        "Vas a registrar que salieron las transferencias pero el efectivo todavía no. La nómina sigue PENDIENTE (porque no está pagada entera), pero su efectivo pasa a contarse como deuda y aparece al armar la nómina siguiente.",
    },
    revertBank: {
      keyword: "Revertir",
      title: "Revertir el pago de las transferencias",
      intro:
        "Vas a deshacer el sello de las transferencias: los días de los trabajadores de banco vuelven a quedar sin fecha de pago y el efectivo deja de contarse como deuda.",
    },
  };
  const { keyword, title, intro } = COPY[mode] || COPY.pay;
  const ok = text.trim().toLowerCase() === keyword.toLowerCase();
  return (
    <Modal
      open
      onClose={() => !busy && onCancel()}
      title={title}
      size="md"
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              if (!ok) return;
              setBusy(true);
              try { await onConfirm(); } finally { setBusy(false); }
            }}
            disabled={!ok || busy}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              isRevert
                ? "border border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white"
                : "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
            }`}
          >
            {busy ? "Procesando..." : isRevert ? "Revertir" : "Confirmar"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-[var(--color-muted)] mt-1">
            {p.workerCount || 0} trab. · {fmtCurrency(p.total || 0)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-[var(--color-muted)]">
            <span>🏦 {fmtCurrency(p.bankTotal || 0)}</span>
            <span>💵 {fmtCurrency(p.cashTotal || 0)}</span>
            {owedCash > 0 && (
              <span className="font-semibold text-[var(--color-warning)]">
                Efectivo debiendo: {fmtCurrency(owedCash)}
              </span>
            )}
          </div>
        </div>
        <p className="text-[var(--color-muted)]">{intro}</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
            Para confirmar, escribe <code className="rounded bg-[var(--color-surface-2)] px-1 font-semibold">{keyword}</code>:
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            placeholder={keyword}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}

// Confirmación manual de cuotas antes de generar una nómina: acá se decide qué
// cuotas entran en esta corrida. La cadencia del anticipo (Por pago/Quincenal/
// Mensual) es solo una etiqueta y nada se aplica solo por fecha. Todas vienen
// marcadas por defecto.
function InstallmentConfirmModal({ state, onCancel, onConfirm }) {
  const [checked, setChecked] = useState(() => new Set());
  useEffect(() => {
    setChecked(new Set((state?.candidates || []).map((c) => c.advanceId)));
  }, [state]);
  if (!state) return null;

  const toggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Confirmar cuotas de anticipos"
      size="md"
      footer={
        <>
          <button
            onClick={onCancel}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(state.candidates.filter((c) => !checked.has(c.advanceId)).map((c) => c.advanceId))}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Confirmar y generar
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-muted)]">
          Estos anticipos tienen plan de cuotas. Revisa cuáles se descuentan en esta nómina — vienen todas marcadas por defecto.
        </p>
        <div className="space-y-2">
          {state.candidates.map((c) => {
            const p = c.progress;
            const cadence = cadenceMeta(p?.cadence);
            return (
              <label
                key={c.advanceId}
                className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={checked.has(c.advanceId)}
                  onChange={() => toggle(c.advanceId)}
                />
                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{c.workerName}</span>
                    <span className="font-semibold">{fmtCurrency(c.amount)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    Cuota {(p?.paidCount || 0) + 1}/{p?.count || "?"} · {cadence.label}
                    {p?.daysSinceLastCuota != null
                      ? ` · última hace ${p.daysSinceLastCuota} día${p.daysSinceLastCuota === 1 ? "" : "s"}`
                      : " · primera cuota"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// Modal para renombrar una nómina. El nombre es solo una etiqueta: solo se
// valida que no esté vacío. Enter confirma, Escape cancela (vía Modal).
function RenamePayrollModal({ payroll, onCancel, onConfirm }) {
  const [name, setName] = useState(payroll?.name || "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onConfirm(name);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title="Renombrar nómina"
      footer={
        <>
          <button onClick={onCancel} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Nombre</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
    </Modal>
  );
}

// Estado visible de la nómina, de tres caras. `status` en Firestore es
// binario; una nómina con las transferencias pagadas y el efectivo adeudado se
// muestra aparte de una sin pagar nada.
function payStateOf(p) {
  if (p.status === "paid") return "paid";
  if (p.bankPaidAt) return "bankPaid";
  return "pending";
}

const PAY_STATE_PILL = {
  paid: { label: "✓ Pagada", cls: "bg-[var(--color-success-soft)] text-[var(--color-success)]" },
  bankPaid: { label: "🏦 Transf. pagadas", cls: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" },
  pending: { label: "⏳ Pendiente", cls: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" },
};

// Estado de la nómina en una sola línea y, si las transferencias ya salieron,
// el efectivo que falta entregar.
// Cuándo se pagó la nómina: el día en que se marcó pagada y, en un pago en dos
// tiempos, también el día en que salieron las transferencias. `short` es el
// rótulo corto de la tabla del historial.
function paymentDates(p) {
  const out = [];
  if (p?.bankPaidAt) out.push({ key: "bank", label: "Transferencias el", short: "Transf.", date: fmtDate(p.bankPaidAt) });
  if (p?.status === "paid" && p.paidAt) {
    out.push(
      p.bankPaidAt
        ? { key: "paid", label: "Pago final el", short: "Final", date: fmtDate(p.paidAt) }
        : { key: "paid", label: "Pagada el", short: "Pagada", date: fmtDate(p.paidAt) },
    );
  }
  return out;
}

// Las fechas de pago en una sola línea, para la tabla del historial.
function PaymentDatesLine({ p }) {
  const dates = paymentDates(p);
  if (dates.length === 0) return null;
  return (
    <span
      title={dates.map((d) => `${d.label} ${d.date}`).join(" · ")}
      className="whitespace-nowrap text-[11px] tabular-nums text-[var(--color-muted)]"
    >
      {dates.map((d) => `${d.short} ${d.date}`).join(" · ")}
    </span>
  );
}

// `showDates`: las fechas de pago debajo del estado (en la tabla del
// historial van en su propia columna, con `PaymentDatesLine`).
function PayStatePill({ p, showDates = true }) {
  const pill = PAY_STATE_PILL[payStateOf(p)];
  const owed = pendingCashOf(p);
  return (
    <div>
      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${pill.cls}`}>{pill.label}</span>
      {showDates && paymentDates(p).map((d) => (
        <div key={d.key} className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-[var(--color-muted)]">
          {d.label} {d.date}
        </div>
      ))}
      {owed > 0 && (
        <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-[var(--color-warning)]" title={`Falta entregar ${fmtCurrency(owed)} en efectivo`}>
          💵 debe {fmtCurrency(owed)}
        </div>
      )}
    </div>
  );
}

// Marca la nómina que está publicada en el portal de trabajadores.
function PortalBadge() {
  return (
    <span
      title="Es la nómina publicada en el portal de trabajadores"
      className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]"
    >
      🌐 Portal
    </span>
  );
}

function HistoryList({ payrolls, onMarkPaid, onMarkPending, onMarkBankPaid, onRevertBank, onAskDelete, onRedownload, onDownloadNominaOnly, onDownloadSnapshot, onChangeClassification, onOpen, onRename, publishedPayrollId = null }) {
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | paid | cashPending
  const [monthFilter, setMonthFilter] = useState("all"); // all | YYYY-MM
  const [search, setSearch] = useState("");
  // Pestaña del historial: "nomina" (default) | "diferencia". Una nómina sin
  // `classification` cuenta como "nomina".
  const [classificationTab, setClassificationTab] = useState("nomina");
  const classify = (p) => p.classification || "nomina";
  const classificationCounts = useMemo(() => {
    let nomina = 0, diferencia = 0;
    for (const p of payrolls) {
      if (classify(p) === "diferencia") diferencia += 1;
      else nomina += 1;
    }
    return { nomina, diferencia };
  }, [payrolls]);

  const monthKey = (v) => {
    const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const months = useMemo(() => {
    const set = new Set();
    for (const p of payrolls) {
      const k = monthKey(p.createdAt);
      if (k) set.add(k);
    }
    return [...set].sort().reverse();
  }, [payrolls]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payrolls.filter((p) => {
      if (classify(p) !== classificationTab) return false;
      if (statusFilter === "cashPending") {
        if (pendingCashOf(p) <= 0) return false;
      } else if (statusFilter !== "all" && (p.status || "pending") !== statusFilter) {
        return false;
      }
      if (monthFilter !== "all" && monthKey(p.createdAt) !== monthFilter) return false;
      if (q && !(p.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [payrolls, classificationTab, statusFilter, monthFilter, search]);

  // "Pendiente" es lo que se debe: de una nómina con las transferencias
  // pagadas solo cuenta el efectivo adeudado.
  const totals = useMemo(() => {
    let pending = 0, paid = 0, cashOwed = 0;
    for (const p of filtered) {
      const total = Number(p.total) || 0;
      let owed;
      if ((p.status || "pending") === "paid") owed = 0;
      else if (p.bankPaidAt) { owed = pendingCashOf(p); cashOwed += owed; }
      else owed = total;
      pending += owed;
      paid += total - owed;
    }
    return { pending, paid, cashOwed, total: pending + paid };
  }, [filtered]);

  // Paginación de a 15: los totales operan sobre todo el conjunto filtrado y
  // solo se pagina lo que se dibuja. Cambiar filtro, pestaña o búsqueda vuelve
  // a la página 1.
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [classificationTab, statusFilter, monthFilter, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );
  const pageNumbers = useMemo(() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const set = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
    const nums = [...set].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const n of nums) {
      if (n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    }
    return out;
  }, [pageCount, currentPage]);

  // Una acción principal según el estado de la nómina (ninguna si ya está
  // pagada) y el resto en el menú ⋯. Eliminar se muestra siempre: apagado,
  // dice qué hay que hacer antes.
  const actionsOf = (p) => {
    const state = payStateOf(p);
    const move =
      classify(p) === "diferencia"
        ? { icon: "→", label: "Mover a Nóminas", onClick: () => onChangeClassification(p) }
        : { icon: "→", label: "Mover a Diferencias", onClick: () => onChangeClassification(p) };
    const rename = { icon: "✎", label: "Renombrar", onClick: () => onRename(p) };
    const remove = {
      icon: "🗑",
      label: "Eliminar",
      danger: true,
      disabled: state !== "pending",
      hint:
        state === "paid"
          ? "Primero márcala como no pagada."
          : state === "bankPaid"
            ? "Primero revierte las transferencias."
            : "Libera los días y devuelve los anticipos.",
      onClick: () => onAskDelete(p),
    };
    if (state === "paid") {
      return {
        primary: null,
        menu: [
          { icon: "↩", label: "Marcar como no pagada", hint: "Vuelve a pendiente y quita el sello de pago.", onClick: () => onMarkPending(p) },
          move,
          rename,
          { divider: true },
          remove,
        ],
      };
    }
    if (state === "bankPaid") {
      return {
        primary: { label: "💵 Pagar efectivo", title: "Cierra la nómina: sella el efectivo que faltaba entregar", onClick: () => onMarkPaid(p) },
        menu: [
          { icon: "↩", label: "Revertir transferencias", hint: "Deshace el sello de las transferencias.", onClick: () => onRevertBank(p) },
          move,
          rename,
          { divider: true },
          remove,
        ],
      };
    }
    return {
      primary: { label: "✓ Marcar pagada", title: "Marcar la nómina entera como pagada", onClick: () => onMarkPaid(p) },
      menu: [
        ...((p.cashTotal || 0) > 0
          ? [{ icon: "🏦", label: "Solo transferencias", hint: "Salieron las transferencias; el efectivo queda debiéndose.", onClick: () => onMarkBankPaid(p) }]
          : []),
        move,
        rename,
        { divider: true },
        remove,
      ],
    };
  };

  const pager = filtered.length > 0 && (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pt-1 text-xs">
      <span className="text-[var(--color-muted)]">
        Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
          >
            ‹
          </button>
          {pageNumbers.map((n, i) =>
            n === "…" ? (
              <span key={`e_${i}`} className="px-1 text-[var(--color-muted)]">…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`min-h-[32px] min-w-[32px] rounded-md border px-2 py-1 tabular-nums ${
                  n === currentPage
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] font-semibold text-[var(--color-accent-fg)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );

  if (payrolls.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
        No hay nóminas generadas todavía.
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 w-fit">
        {[
          { key: "nomina", label: "Nóminas", count: classificationCounts.nomina },
          { key: "diferencia", label: "Diferencias", count: classificationCounts.diferencia },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setClassificationTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              classificationTab === t.key
                ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
            }`}
          >
            {t.label} <span className="ml-1 text-xs opacity-75">({t.count})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] sm:w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="cashPending">💵 Efectivo pendiente</option>
          <option value="paid">Pagadas</option>
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">Todos los meses</option>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-3 text-xs">
          <span><span className="text-[var(--color-muted)]">Pendiente:</span> <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(totals.pending)}</span></span>
          <span><span className="text-[var(--color-muted)]">Pagado:</span> <span className="font-semibold text-[var(--color-success)]">{fmtCurrency(totals.paid)}</span></span>
          <span><span className="text-[var(--color-muted)]">Total:</span> <span className="font-semibold">{fmtCurrency(totals.total)}</span></span>
          {totals.cashOwed > 0 && (
            <span title="Efectivo de nóminas cuyas transferencias ya se pagaron. Es la deuda que hay que entregar en mano.">
              <span className="text-[var(--color-muted)]">💵 Debiendo:</span>{" "}
              <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(totals.cashOwed)}</span>
            </span>
          )}
        </div>
      </div>

    {isMobile ? (
      <>
      <div className="flex-1 space-y-2 overflow-auto">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
            Ninguna nómina coincide con el filtro.
          </div>
        ) : (
          paged.map((p) => {
            const { primary, menu } = actionsOf(p);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p)}
                onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen(p)}
                className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm active:bg-[var(--color-surface-2)]"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[var(--color-accent)] [overflow-wrap:anywhere]">{p.name}</span>
                      {p.id === publishedPayrollId && <PortalBadge />}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {fmtDate(p.createdAt)} · {p.workerCount || (p.items?.length ?? 0)} trab.
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <RowMenu items={menu} />
                  </div>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <PayStatePill p={p} />
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Total</div>
                    <div className="text-base font-semibold tabular-nums">{fmtCurrency(p.total || 0)}</div>
                  </div>
                </div>
                <div className="mt-2 flex justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-xs tabular-nums text-[var(--color-muted)]">
                  <span>🏦 {fmtCurrency(p.bankTotal || 0)} · {p.bankCount || 0}</span>
                  <span>💵 {fmtCurrency(p.cashTotal || 0)} · {p.cashCount || 0}</span>
                </div>
                {primary && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      primary.onClick();
                    }}
                    title={primary.title}
                    className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-accent)] text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                  >
                    {primary.label}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      {pager}
      </>
    ) : (
    <>
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] text-left">
          <tr className="whitespace-nowrap">
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2 text-right">Trab.</th>
            <th className="px-3 py-2 text-right">🏦 Banco</th>
            <th className="px-3 py-2 text-right">💵 Efectivo</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-[var(--color-muted)]">
                Ninguna nómina coincide con el filtro.
              </td>
            </tr>
          )}
          {paged.map((p) => {
            const { primary, menu } = actionsOf(p);
            return (
              <tr
                key={p.id}
                onClick={() => onOpen(p)}
                className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(p);
                      }}
                      className="text-left font-medium text-[var(--color-accent)] hover:underline"
                    >
                      {p.name}
                    </button>
                    {p.id === publishedPayrollId && <PortalBadge />}
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">{fmtDate(p.createdAt)}</div>
                </td>
                <td className="px-3 py-2">
                  <PayStatePill p={p} showDates={false} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.workerCount || (p.items?.length ?? 0)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {fmtCurrency(p.bankTotal || 0)}
                  <div className="text-[10px] text-[var(--color-muted)]">{p.bankCount || 0} pers.</div>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {fmtCurrency(p.cashTotal || 0)}
                  <div className="text-[10px] text-[var(--color-muted)]">{p.cashCount || 0} pers.</div>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtCurrency(p.total || 0)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <PaymentDatesLine p={p} />
                    {primary && (
                      <button
                        type="button"
                        onClick={primary.onClick}
                        title={primary.title}
                        className="whitespace-nowrap rounded-md border border-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                      >
                        {primary.label}
                      </button>
                    )}
                    <RowMenu items={menu} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {pager}
    </>
    )}
    </div>
  );
}

// Arma la grilla de un grupo de trabajadores en un ciclo: una tabla por labor
// con producción, con filas = trabajadores y columnas = días. El contenido de
// cada celda depende del tipo de labor, como en la grilla de CycleDetail.
function buildGroupCycleSnapshot(groupRuts, cycle, workdays, nameByRut, catalogs = {}) {
  const rutSet = new Set(groupRuts);
  const wdsCycle = workdays.filter((w) => w.cycleId === cycle.id && rutSet.has(w.workerRut));
  if (wdsCycle.length === 0) return [];

  const dayPrices = cycle.dayPrices || {};
  const labors = cycle.labors || [];
  const out = [];

  for (const labor of labors) {
    const wdsLabor = wdsCycle.filter((w) => w.laborId === labor.id);
    if (wdsLabor.length === 0) continue;
    // tratoEtapas: orden de las etapas para el desglose de cada celda.
    const ordenEtapas = labor.type === "tratoEtapas"
      ? normalizeStages(labor.stages).map((st) => String(st.id))
      : null;

    // Acumula por (trabajador, día) el contenido de la celda: las jornadas del
    // mismo trabajador y día se suman (los tiers de trato vía
    // getTratoTierTotals, los combos calidad × envase de cosecha, etc.).
    const cellByWorkerDay = new Map(); // clave: rut + "|" + fecha
    const dates = new Set();
    const workersInLabor = new Set();
    const containers = new Set(); // envases vistos en cosecha — define la unidad
    const tratoUnits = new Set(); // unidades de los tiers del día, en trato (Árbol, Metro…)
    let anyPiso = false;
    for (const wd of wdsLabor) {
      const key = `${wd.workerRut}|${wd.date}`;
      dates.add(wd.date);
      workersInLabor.add(wd.workerRut);
      if (!cellByWorkerDay.has(key)) {
        cellByWorkerDay.set(key, {
          amount: 0,
          kilos: 0,
          jornadas: 0,
          overtimeHours: 0,
          extras: 0,
          piso: 0,
          hasManejo: false,
          hasSupervision: false,
          isHoliday: false,
          byCombo: {},
          byTier: {},
          byStage: {},
        });
      }
      const c = cellByWorkerDay.get(key);
      if (wd.pisoOnly) {
        const pa = Number(wd.amount) || 0;
        c.piso += pa;
        c.amount += pa;
        anyPiso = true;
        continue;
      }
      if (labor.type === "cosecha") {
        const x = Number(wd.qualityX) || 0;
        const y = Number(wd.containerY) || 0;
        // Clave estructural por combo (calidad_envase); el nombre visible lo
        // arma `comboLabel(catalogs, x, y)` al dibujar.
        const ck = `${x}_${y}`;
        const kg = Number(wd.qty) || 0;
        const amt = Number(wd.amount) || 0;
        c.kilos += kg;
        c.amount += amt;
        containers.add(y);
        if (!c.byCombo[ck]) c.byCombo[ck] = { x, y, kilos: 0, amount: 0 };
        c.byCombo[ck].kilos += kg;
        c.byCombo[ck].amount += amt;
      } else if (labor.type === "trato") {
        const t = getTratoTierTotals(wd);
        c.jornadas += t.qty;
        c.amount += t.amount;
        // Unidades configuradas en los tiers del día: van en la grilla para que
        // el comprobante muestre la unidad (Árbol, Metro…) en vez del tipo
        // (Poda) cuando la haya.
        const tiersForDay = getTratoTiers(dayPrices, labor.id, wd.date);
        for (const tier of tiersForDay) {
          if (tier.unit != null) tratoUnits.add(tier.unit);
        }
        // Desglose por tramo del comprobante. Cada doc de trato tiene un solo
        // tier (clave "0") y `t` ya viene conciliado (los campos de primer nivel
        // mandan sobre el espejo `tiers`): se usa `t` para que cuadre con el total.
        if (t.qty || t.amount) {
          const idx = "0";
          if (!c.byTier[idx]) c.byTier[idx] = { index: 0, jornadas: 0, amount: 0 };
          c.byTier[idx].jornadas += t.qty;
          c.byTier[idx].amount += t.amount;
        }
      } else if (labor.type === "tratoHE") {
        c.jornadas += Number(wd.qty) || 0;
        c.amount += Number(wd.amount) || 0;
        c.overtimeHours += Number(wd.overtimeHours) || 0;
        c.extras += Number(wd.extras) || 0;
        c.hasManejo = c.hasManejo || !!wd.hasManejo;
        c.hasSupervision = c.hasSupervision || !!wd.hasSupervision;
      } else if (labor.type === "tratoEtapas") {
        // Para el trabajador cuenta toda la producción: `counts` decide qué se
        // le factura al cliente, no qué hizo la persona. Cada etapa suma
        // cantidad y monto.
        const q = Number(wd.qty) || 0;
        const monto = Number(wd.amount) || 0;
        c.amount += monto;
        c.jornadas += q;
        const sid = String(wd.stageId ?? "");
        const acc = c.byStage[sid] || { ...describeStage(labor, sid, ordenEtapas), qty: 0, amount: 0 };
        acc.qty += q;
        acc.amount += monto;
        c.byStage[sid] = acc;
      } else {
        c.amount += Number(wd.amount) || 0;
        c.jornadas += 1;
      }
    }

    const sortedDates = [...dates].sort();
    const sortedRuts = [...workersInLabor].sort((a, b) =>
      (nameByRut.get(a) || a).localeCompare(nameByRut.get(b) || b),
    );

    const rows = sortedRuts.map((rut) => {
      let totalAmount = 0;
      let totalKilos = 0;
      let totalJornadas = 0;
      let totalPiso = 0;
      const cells = {};
      for (const d of sortedDates) {
        const c = cellByWorkerDay.get(`${rut}|${d}`);
        if (c) {
          cells[d] = c;
          totalAmount += c.amount;
          totalKilos += c.kilos;
          totalJornadas += c.jornadas;
          totalPiso += c.piso || 0;
        }
      }
      return {
        rut,
        name: nameByRut.get(rut) || "",
        cells,
        totalAmount,
        totalKilos,
        totalJornadas,
        totalPiso,
      };
    });

    // Totales por día, con kilos, jornadas, etc. por separado y no solo el monto.
    const dayTotals = {};
    let grandAmount = 0;
    let grandKilos = 0;
    let grandJornadas = 0;
    let grandOvertimeHours = 0;
    let grandExtras = 0;
    let grandPiso = 0;
    for (const d of sortedDates) {
      const agg = { amount: 0, kilos: 0, jornadas: 0, overtimeHours: 0, extras: 0, piso: 0, byCombo: {}, byTier: {}, byStage: {} };
      for (const r of rows) {
        const c = r.cells[d];
        if (!c) continue;
        agg.amount += c.amount || 0;
        agg.kilos += c.kilos || 0;
        agg.jornadas += c.jornadas || 0;
        agg.overtimeHours += c.overtimeHours || 0;
        agg.extras += c.extras || 0;
        agg.piso += c.piso || 0;
        for (const [ck, b] of Object.entries(c.byCombo || {})) {
          if (!agg.byCombo[ck]) agg.byCombo[ck] = { x: b.x, y: b.y, kilos: 0, amount: 0 };
          agg.byCombo[ck].kilos += b.kilos;
          agg.byCombo[ck].amount += b.amount;
        }
        for (const [tk, b] of Object.entries(c.byTier || {})) {
          if (!agg.byTier[tk]) agg.byTier[tk] = { index: b.index, jornadas: 0, amount: 0 };
          agg.byTier[tk].jornadas += b.jornadas;
          agg.byTier[tk].amount += b.amount;
        }
        for (const [sid, b] of Object.entries(c.byStage || {})) {
          if (!agg.byStage[sid]) agg.byStage[sid] = { stageId: sid, name: b.name, counts: b.counts, order: b.order, qty: 0, amount: 0 };
          agg.byStage[sid].qty += b.qty;
          agg.byStage[sid].amount += b.amount;
        }
      }
      dayTotals[d] = agg;
      grandAmount += agg.amount;
      grandKilos += agg.kilos;
      grandJornadas += agg.jornadas;
      grandOvertimeHours += agg.overtimeHours;
      grandExtras += agg.extras;
      grandPiso += agg.piso;
    }

    const priceByDate = {};
    for (const d of sortedDates) {
      priceByDate[d] = formatLaborDayPrice(labor, d, dayPrices, catalogs);
    }

    out.push({
      laborId: labor.id,
      laborName: labor.name,
      laborType: labor.type,
      tratoType: labor.tratoType ?? 0,
      cosechaContainers: [...containers],
      tratoUnits: [...tratoUnits],
      anyPiso,
      dates: sortedDates,
      rows,
      dayTotals,
      grandAmount,
      grandKilos,
      grandJornadas,
      grandOvertimeHours,
      grandExtras,
      grandPiso,
      priceByDate,
    });
  }

  return out;
}

function fmtMoneyShort(v) {
  return "$" + (Number(v) || 0).toLocaleString("es-CL");
}

function fmtDateShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()];
  return `${String(d.getDate()).padStart(2, "0")}-${m}`;
}

function renderProductionCell(cell, laborType, tratoLabel, kilosUnit, catalogs = {}) {
  if (!cell) return "";
  const fmtMoney = (v) => "$" + (Number(v) || 0).toLocaleString("es-CL");
  const num = (v) => (Number(v) || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  const pisoTag = (cell.piso || 0) > 0
    ? `<div class="muted" style="color:#b45309">🪙 Piso ${fmtMoney(cell.piso)}</div>`
    : "";
  if (laborType === "cosecha") {
    const unit = (kilosUnit || "kg").toLowerCase();
    const combos = Object.entries(cell.byCombo || {})
      .filter(([, b]) => b.kilos || b.amount)
      .sort(([, a], [, b]) => a.x - b.x || a.y - b.y);
    if (combos.length > 1) {
      // Cada combo se muestra con su nombre del catálogo (ej. "Premium / Saco").
      const lines = combos
        .map(([, b]) => {
          const lbl = comboLabel(catalogs, b.x, b.y);
          return `<div class="muted prod-breakdown">${lbl}: ${num(b.kilos)}</div>`;
        })
        .join("");
      return `${lines}<div>${num(cell.kilos)} ${unit}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
    }
    return `<div>${num(cell.kilos)} ${unit}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  if (laborType === "trato") {
    const unit = tratoLabel || "";
    const tiers = Object.entries(cell.byTier || {})
      .filter(([, b]) => b.jornadas || b.amount)
      .sort(([, a], [, b]) => a.index - b.index);
    if (tiers.length > 1) {
      const lines = tiers
        .map(([, b]) => `<div class="muted prod-breakdown">T${b.index + 1}: ${num(b.jornadas)}</div>`)
        .join("");
      return `${lines}<div>${num(cell.jornadas)}${unit ? ` ${unit}` : ""}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
    }
    return `<div>${num(cell.jornadas)}${unit ? ` ${unit}` : ""}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  if (laborType === "tratoHE") {
    const flags = [];
    if (cell.overtimeHours) flags.push(`HE:${num(cell.overtimeHours)}h`);
    if (cell.hasManejo) flags.push("M");
    if (cell.hasSupervision) flags.push("S");
    if (cell.extras) flags.push(`X:${fmtMoney(cell.extras)}`);
    const flagsHtml = flags.length ? `<div class="muted">${flags.join(" · ")}</div>` : "";
    // En tratoHE, `jornadas` suma el `qty` de las jornadas: el monto base del día.
    const baseHtml = cell.jornadas ? `<div>Base ${fmtMoney(cell.jornadas)}</div>` : "";
    return `${baseHtml}${flagsHtml}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  if (laborType === "tratoEtapas") {
    // jornadas = unidades producidas, de todas las etapas. El desglose dice
    // de qué etapa salió cada una, sin marcar cuáles cuentan para facturar:
    // esto lo lee el trabajador.
    const j = cell.jornadas || 0;
    const etapas = Object.values(cell.byStage || {})
      .filter((b) => b.qty || b.amount)
      .sort((a, b) => a.order - b.order);
    const breakdown = etapas.length > 1
      ? etapas.map((b) => `<div class="muted prod-breakdown">${stageTag(b)}: ${num(b.qty)}</div>`).join("")
      : "";
    const jHtml = j ? `<div>${num(j)} unid</div>` : "";
    return `${breakdown}${jHtml}${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  // main / supervision / extra
  return `<div>${fmtMoney(cell.amount)}</div>`;
}

// Como renderProductionCell, pero para filas y celdas de total: muestra los
// kilos o jornadas junto al monto.
function renderProductionTotal(totals, laborType, tratoLabel, kilosUnit, catalogs = {}) {
  if (!totals) return "";
  const fmtMoney = (v) => "$" + (Number(v) || 0).toLocaleString("es-CL");
  const num = (v) => (Number(v) || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  const amount = totals.amount || 0;
  const piso = totals.piso || 0;
  const pisoTag = piso > 0
    ? `<div class="muted" style="color:#b45309">🪙 ${fmtMoney(piso)}</div>`
    : "";
  if (laborType === "cosecha") {
    const kilos = totals.kilos || 0;
    const unit = (kilosUnit || "kg").toLowerCase();
    const combos = Object.entries(totals.byCombo || {})
      .filter(([, b]) => b.kilos || b.amount)
      .sort(([, a], [, b]) => a.x - b.x || a.y - b.y);
    const breakdown = combos.length > 1
      ? combos.map(([, b]) => {
          const lbl = comboLabel(catalogs, b.x, b.y);
          return `<div class="muted prod-breakdown">${lbl}: ${num(b.kilos)}</div>`;
        }).join("")
      : "";
    const kHtml = kilos ? `<div>${num(kilos)} ${unit}</div>` : "";
    return `${breakdown}${kHtml}${pisoTag}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  if (laborType === "trato") {
    const j = totals.jornadas || 0;
    const unit = tratoLabel || "jorn.";
    const tiers = Object.entries(totals.byTier || {})
      .filter(([, b]) => b.jornadas || b.amount)
      .sort(([, a], [, b]) => a.index - b.index);
    const breakdown = tiers.length > 1
      ? tiers.map(([, b]) => `<div class="muted prod-breakdown">T${b.index + 1}: ${num(b.jornadas)}</div>`).join("")
      : "";
    const jHtml = j ? `<div>${num(j)} ${unit}</div>` : "";
    return `${breakdown}${jHtml}${pisoTag}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  if (laborType === "tratoHE") {
    const parts = [];
    if (totals.overtimeHours) parts.push(`HE:${num(totals.overtimeHours)}h`);
    if (totals.extras) parts.push(`X:${fmtMoney(totals.extras)}`);
    const sub = parts.length ? `<div class="muted">${parts.join(" · ")}</div>` : "";
    return `${sub}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  if (laborType === "tratoEtapas") {
    const j = totals.jornadas || 0;
    const etapas = Object.values(totals.byStage || {})
      .filter((b) => b.qty || b.amount)
      .sort((a, b) => a.order - b.order);
    const breakdown = etapas.length > 1
      ? etapas.map((b) => `<div class="muted prod-breakdown">${stageTag(b)}: ${num(b.qty)}</div>`).join("")
      : "";
    const jHtml = j ? `<div>${num(j)} unid</div>` : "";
    return `${breakdown}${jHtml}${pisoTag}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  return `<div><b>${fmtMoney(amount)}</b></div>`;
}

const LABOR_TYPE_LABEL = {
  main: "Pago al día",
  supervision: "Supervisión",
  extra: "Adicional",
  cosecha: "Cosecha",
  trato: "A trato",
  tratoEtapas: "A trato por etapas",
  tratoHE: "Jornadas con HE",
};

function buildCashReceiptHtml(payroll, cashGroups, options = {}) {
  const cycleDetails = payroll.cycleDetails || [];
  const titleOverrides = options.titleOverrides || {};
  const workdaysByGroup = options.workdaysByGroup || {}; // { leader: { cycleId: rows[] } }
  const cyclesById = options.cyclesById || {};
  const catalogs = options.catalogs || {};
  // Rut vigente para mostrar (utils/workerRut.js); sin resolver, el guardado.
  const rutOf = options.rutOf || ((r) => r);
  const mode = options.mode || "cash"; // "cash" | "detail"
  const isDetail = mode === "detail";
  const summaries = options.summaries || [];
  const subfaenaSummary = options.subfaenaSummary || null;
  const laborSummary = options.laborSummary || null;
  const bonusAdvanceSummary = options.bonusAdvanceSummary || null;
  // Filas de ajuste (Bonos / Anticipos), comunes a "Resumen por subfaena" y
  // "Resumen por labor"; el total cuadrado sale de `adjustedTotals`.
  // `labelColspan` = columnas de etiqueta antes de las 3 de plata (bank/cash/total).
  const buildAdjustmentRowsHtml = (labelColspan) => {
    const rows = [];
    if (bonusAdvanceSummary?.bonus.total > 0) {
      rows.push(`
        <tr class="adj-row">
          <td colspan="${labelColspan}" style="text-align:right">Bonos</td>
          <td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.bank)}</td>
          <td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.cash)}</td>
          <td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.total)}</td>
        </tr>`);
    }
    if (bonusAdvanceSummary?.advance.total > 0) {
      rows.push(`
        <tr class="adj-row">
          <td colspan="${labelColspan}" style="text-align:right">Anticipos</td>
          <td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.bank)}</td>
          <td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.cash)}</td>
          <td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.total)}</td>
        </tr>`);
    }
    return rows.join("");
  };
  const adjustedTotals = (base) => ({
    bank: base.bank + (bonusAdvanceSummary?.bonus.bank || 0) - (bonusAdvanceSummary?.advance.bank || 0),
    cash: base.cash + (bonusAdvanceSummary?.bonus.cash || 0) - (bonusAdvanceSummary?.advance.cash || 0),
    total: base.total + (bonusAdvanceSummary?.bonus.total || 0) - (bonusAdvanceSummary?.advance.total || 0),
  });
  const overviewTitle = isDetail ? "Detalle de pago" : "Comprobante de pago en efectivo";
  const docTitle = isDetail ? `${payroll.name} — Detalle pago` : `${payroll.name} — Efectivo`;
  const cycleLabel = (cycleId) => titleOverrides[cycleId] || cyclesById[cycleId]?.label || cycleDetails.find((c) => c.id === cycleId)?.label || cycleId;
  // Período del ciclo como dd/mm → dd/mm: sale de firstDay/lastDay de
  // cycleDetails y, si no están guardados, de `days` del ciclo en cyclesById.
  const fmtDayShort = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : d;
  };
  const cyclePeriod = (cycleId) => {
    const cd = cycleDetails.find((c) => c.id === cycleId);
    let first = cd?.firstDay || "";
    let last = cd?.lastDay || "";
    if (!first && !last) {
      const days = cyclesById[cycleId]?.days;
      if (Array.isArray(days) && days.length) {
        const sorted = [...days].sort();
        first = sorted[0]; last = sorted[sorted.length - 1];
      }
    }
    const a = fmtDayShort(first);
    const b = fmtDayShort(last);
    if (a && b && a !== b) return `${a} → ${b}`;
    return a || b || "";
  };
  // El subtítulo solo muestra los nombres de ciclo — el período va en una
  // columna propia de la tabla, no acá.
  const cyclesLine = cycleDetails.map((c) => cycleLabel(c.id)).join(" · ");
  const fmt = (v) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(
      Number(v) || 0,
    );
  const fmtRut = (r) => {
    const m = String(r || "").match(/^(\d+)-([0-9KBH])$/i);
    if (!m) return r || "";
    return m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + m[2];
  };
  const today = new Date().toLocaleDateString("es-CL");

  // Paletas por grupo de líder (las mismas de la hoja Excel).
  const LEADER_FILLS = ["#FFE699", "#C6E0B4", "#F8CBAD", "#B4C7E7", "#E2C2F0", "#FFC9C9", "#CFE7F5", "#D9D2E9"];
  const ITEM_FILLS   = ["#FFF2CC", "#E2EFDA", "#FCE4D6", "#D9E1F2", "#EAD8F2", "#FCE0E0", "#E7F2F8", "#EEE7F4"];

  const groupsHtml = cashGroups
    .map((g, idx) => {
      const itemFill = ITEM_FILLS[idx % ITEM_FILLS.length];
      const leaderFill = LEADER_FILLS[idx % LEADER_FILLS.length];

      // Columnas solo de los ciclos donde alguien del grupo tuvo producción.
      const activeCycleIds = new Set();
      for (const it of g.items) {
        for (const cid of Object.keys(it.byCycle || {})) {
          if ((it.byCycle[cid] || 0) > 0) activeCycleIds.add(cid);
        }
      }
      const cycleCols = cycleDetails.filter((c) => activeCycleIds.has(c.id));
      const showCycleCols = cycleCols.length > 1;

      const cycleHeaders = showCycleCols
        ? cycleCols.map((c) => `<th style="text-align:right">${cycleLabel(c.id)}</th>`).join("")
        : "";

      // Las columnas Anticipo y Bono aparecen solo si alguien del grupo tiene
      // un descuento o un bono.
      const groupHasAdvance = g.items.some((it) => (Number(it.advance) || 0) > 0);
      const groupHasBonus = g.items.some((it) => (Number(it.bonus) || 0) > 0);
      const advanceHeader = groupHasAdvance
        ? `<th style="width:110px;text-align:right">Anticipo</th>`
        : "";
      const bonusHeader = groupHasBonus
        ? `<th style="width:110px;text-align:right">Bono</th>`
        : "";

      // Desglose del trabajador por (subfaena, labor), sumando todos los ciclos
      // del grupo. Va solo en el comprobante de efectivo, para que se vea de
      // dónde sale el monto antes de firmar.
      const workerBreakdown = (it) => {
        const acc = new Map();
        const groupSnapshots = workdaysByGroup[g.leader] || {};
        for (const cid of Object.keys(groupSnapshots)) {
          const cd = cycleDetails.find((c) => c.id === cid);
          const subName = cd?.subfaenaName || cd?.label || cycleLabel(cid);
          const snapshots = groupSnapshots[cid] || [];
          for (const snap of snapshots) {
            const row = snap.rows.find((r) => r.rut === it.rut);
            if (!row || !(row.totalAmount > 0)) continue;
            const key = `${subName}||${snap.laborName}`;
            const cur = acc.get(key) || { subfaena: subName, labor: snap.laborName, amount: 0 };
            cur.amount += row.totalAmount;
            acc.set(key, cur);
          }
        }
        return [...acc.values()].sort((a, b) => {
          const s = a.subfaena.localeCompare(b.subfaena, "es");
          return s !== 0 ? s : a.labor.localeCompare(b.labor, "es");
        });
      };
      const renderDetalle = (it) => {
        const list = workerBreakdown(it);
        if (list.length === 0) return "—";
        return list.map((b) =>
          `<div style="font-size:10px;line-height:1.35"><span style="color:#666">${b.subfaena} · ${b.labor}:</span> <b>${fmt(b.amount)}</b></div>`
        ).join("");
      };

      const rows = g.items
        .map((it, i, arr) => {
          // Las últimas 3 filas se marcan para no cortar la página entre ellas
          // y la firma: con `break-after:avoid` en tfoot y `break-inside:avoid`
          // en .signs-block, si la firma no entra, el navegador pasa también
          // estas filas a la página siguiente.
          const keepWithSign = i >= arr.length - 3;
          const cellsByCycle = showCycleCols
            ? cycleCols
                .map(
                  (c) =>
                    `<td style="text-align:right">${
                      it.byCycle && it.byCycle[c.id] ? fmt(it.byCycle[c.id]) : ""
                    }</td>`,
                )
                .join("")
            : "";
          const advanceCell = groupHasAdvance
            ? `<td style="text-align:right;color:#b45309">${
                Number(it.advance) > 0 ? `− ${fmt(it.advance)}` : "—"
              }</td>`
            : "";
          const bonusCell = groupHasBonus
            ? `<td style="text-align:right;color:#166534">${
                Number(it.bonus) > 0 ? `+ ${fmt(it.bonus)}` : "—"
              }</td>`
            : "";
          return `
            <tr class="${keepWithSign ? "keep-with-sign" : ""}" style="background:${itemFill}">
              <td>${i + 1}</td>
              <td>${it.name}</td>
              <td class="mono">${fmtRut(rutOf(it.rut, it.workerId))}</td>
              <td style="vertical-align:top">${renderDetalle(it)}</td>
              ${cellsByCycle}
              ${advanceCell}
              ${bonusCell}
              <td style="text-align:right"><b>${fmt(it.amount)}</b></td>
              <td></td>
            </tr>`;
        })
        .join("");

      const subtotalCells = showCycleCols
        ? cycleCols
            .map((c) => {
              const sum = g.items.reduce((s, it) => s + (it.byCycle?.[c.id] || 0), 0);
              return `<td style="text-align:right;background:${leaderFill}"><b>${fmt(sum)}</b></td>`;
            })
            .join("")
        : "";
      const advanceSubtotalCell = groupHasAdvance
        ? `<td style="text-align:right;background:${leaderFill};color:#b45309"><b>${
            (() => {
              const sum = g.items.reduce((s, it) => s + (Number(it.advance) || 0), 0);
              return sum > 0 ? `− ${fmt(sum)}` : "—";
            })()
          }</b></td>`
        : "";
      const bonusSubtotalCell = groupHasBonus
        ? `<td style="text-align:right;background:${leaderFill};color:#166534"><b>${
            (() => {
              const sum = g.items.reduce((s, it) => s + (Number(it.bonus) || 0), 0);
              return sum > 0 ? `+ ${fmt(sum)}` : "—";
            })()
          }</b></td>`
        : "";

      const totalColSpan = 3; // # + Nombre + RUT

      // Producción del grupo por ciclo, como la grilla de CycleDetail: una
      // tabla por labor, filas = trabajadores, columnas = días.
      const detailHtml = cycleCols
        .map((c) => {
          const laborSnapshots = workdaysByGroup[g.leader]?.[c.id] || [];
          if (laborSnapshots.length === 0) return "";
          const laborTables = laborSnapshots
            .map((ls) => {
              // En trato manda la unidad de los tiers del día (Árbol, Metro,
              // Polín…) si hay una sola; si no hay o hay mezcla, el tipo de
              // trato (Poda, Amarre…). En cosecha la unidad sale del envase.
              let tratoLabel = "";
              if (ls.laborType === "trato") {
                const units = ls.tratoUnits || [];
                if (units.length === 1) {
                  tratoLabel = tratoUnitLabel(catalogs, units[0]) || tratoTypeLabel(catalogs, ls.tratoType ?? 0);
                } else {
                  tratoLabel = tratoTypeLabel(catalogs, ls.tratoType ?? 0);
                }
              }
              const kilosUnit = ls.laborType === "cosecha"
                ? cosechaUnit(catalogs, new Set(ls.cosechaContainers || []))
                : "";
              const typeLabel = ls.laborType === "trato" && tratoLabel
                ? tratoLabel
                : ls.laborType === "cosecha" && kilosUnit
                  ? kilosUnit
                  : (LABOR_TYPE_LABEL[ls.laborType] || ls.laborType);
              const dayHeaders = ls.dates
                .map((d) => {
                  const price = ls.priceByDate?.[d];
                  const priceLine = price ? `<div class="muted prod-price">${price}</div>` : "";
                  return `<th class="prod-day">${fmtDateShort(d)}${priceLine}</th>`;
                })
                .join("");
              const rows = ls.rows
                .map((row) => {
                  const dayCells = ls.dates
                    .map(
                      (d) => `<td class="prod-cell">${renderProductionCell(row.cells[d], ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>`,
                    )
                    .join("");
                  const rowTotalAgg = {
                    amount: row.totalAmount,
                    kilos: row.totalKilos,
                    jornadas: row.totalJornadas,
                    piso: row.totalPiso || 0,
                  };
                  return `
                    <tr>
                      <td class="prod-name">${row.name || row.rut}</td>
                      ${dayCells}
                      <td class="prod-total">${renderProductionTotal(rowTotalAgg, ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>
                    </tr>`;
                })
                .join("");
              const dayTotals = ls.dates
                .map((d) => `<td class="prod-total">${renderProductionTotal(ls.dayTotals[d], ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>`)
                .join("");
              const grandTotalAgg = {
                amount: ls.grandAmount,
                kilos: ls.grandKilos,
                jornadas: ls.grandJornadas,
                overtimeHours: ls.grandOvertimeHours,
                extras: ls.grandExtras,
                piso: ls.grandPiso || 0,
              };
              return `
                <div class="prod-table">
                  <h4 style="background:${itemFill}">${ls.laborName} <span class="muted">(${typeLabel})</span></h4>
                  <table class="prod">
                    <thead>
                      <tr>
                        <th class="prod-name">Trabajador</th>
                        ${dayHeaders}
                        <th class="prod-total">Total</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                      <tr style="background:${leaderFill}">
                        <td class="prod-name"><b>Total día</b></td>
                        ${dayTotals}
                        <td class="prod-total">${renderProductionTotal(grandTotalAgg, ls.laborType, tratoLabel, kilosUnit, catalogs)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>`;
            })
            .join("");

          return `
            <div class="detail">
              <h3 style="background:${leaderFill}">${cycleLabel(c.id)}</h3>
              ${laborTables}
            </div>`;
        })
        .join("");

      const rowsNoSign = isDetail
        ? g.items
            .map((it, i) => {
              const cellsByCycle = showCycleCols
                ? cycleCols
                    .map(
                      (c) =>
                        `<td style="text-align:right">${
                          it.byCycle && it.byCycle[c.id] ? fmt(it.byCycle[c.id]) : ""
                        }</td>`,
                    )
                    .join("")
                : "";
              const bankTag = isCashBank(it.bankCode) ? "Efectivo" : "Transferencia";
              const advanceCell = groupHasAdvance
                ? `<td style="text-align:right;color:#b45309">${
                    Number(it.advance) > 0 ? `− ${fmt(it.advance)}` : "—"
                  }</td>`
                : "";
              const bonusCell = groupHasBonus
                ? `<td style="text-align:right;color:#166534">${
                    Number(it.bonus) > 0 ? `+ ${fmt(it.bonus)}` : "—"
                  }</td>`
                : "";
              return `
                <tr style="background:${itemFill}">
                  <td>${i + 1}</td>
                  <td>${it.name}</td>
                  <td class="mono">${fmtRut(rutOf(it.rut, it.workerId))}</td>
                  <td style="font-size:10px;color:#555">${bankTag}</td>
                  ${cellsByCycle}
                  ${advanceCell}
                  ${bonusCell}
                  <td style="text-align:right"><b>${fmt(it.amount)}</b></td>
                </tr>`;
            })
            .join("")
        : rows;

      const overviewPage = (copyLabel) => `
    <section class="receipt">
      <header>
        <div class="hd">
          <div>
            <h1 class="group-h1">${overviewTitle} <span class="group-leader-name">— ${g.leader}</span>${copyLabel ? `<span class="copy-tag">${copyLabel}</span>` : ""}</h1>
            <div class="sub">${payroll.name} · ${cyclesLine}</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${today}</div>
            <div><b>Líder:</b> ${g.leader}</div>
            <div><b>Personas:</b> ${g.items.length}</div>
          </div>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Nombre</th>
            <th style="width:110px">RUT</th>
            ${isDetail ? '<th style="width:90px">Forma pago</th>' : '<th style="width:240px">Detalle</th>'}
            ${cycleHeaders}
            ${advanceHeader}
            ${bonusHeader}
            <th style="width:120px;text-align:right">TOTAL</th>
            ${isDetail ? "" : '<th style="width:200px">Firma</th>'}
          </tr>
        </thead>
        <tbody>
          ${isDetail ? rowsNoSign : rows}
        </tbody>
        <tfoot>
          <tr style="background:${leaderFill}">
            <td colspan="${totalColSpan + 1}" style="text-align:right"><b>Subtotal ${g.leader}</b></td>
            ${subtotalCells}
            ${advanceSubtotalCell}
            ${bonusSubtotalCell}
            <td style="text-align:right"><b>${fmt(g.total)}</b></td>
            ${isDetail ? "" : "<td></td>"}
          </tr>
        </tfoot>
      </table>
      ${isDetail ? "" : `
      <div class="signs-block">
        <div class="signs-recap">
          Subtotal ${g.leader} · ${g.items.length} persona${g.items.length === 1 ? "" : "s"}:
          <b>${fmt(g.total)}</b>
        </div>
        <div class="signs">
          <div class="sign sign-right">
            <div class="line"></div>
            <div>Firma líder (${g.leader})</div>
          </div>
        </div>
      </div>`}
    </section>`;

      return `
    ${isDetail ? overviewPage("") : overviewPage("ORIGINAL — Líder")}
    ${isDetail ? "" : overviewPage("COPIA — Empresa")}
    ${
      detailHtml
        ? `<section class="receipt detail-page">
            <div class="hd">
              <div>
                <h1 class="group-h1">Detalle de producción <span class="group-leader-name">— ${g.leader}</span></h1>
                <div class="sub">${payroll.name}</div>
              </div>
              <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
            </div>
            ${detailHtml}
          </section>`
        : ""
    }`;
    })
    .join("");

  // Período cubierto por un conjunto de ciclos: primer día más temprano →
  // último día más tardío. Si hay un solo ciclo, queda el rango del ciclo
  // tal cual. Compartido entre "Resumen por subfaena" y "Resumen por labor".
  const cyclesPeriod = (cycleIds) => {
    let minFirst = null;
    let maxLast = null;
    for (const cid of cycleIds) {
      const cd = cycleDetails.find((c) => c.id === cid);
      let first = cd?.firstDay || "";
      let last = cd?.lastDay || "";
      if (!first && !last) {
        const days = cyclesById[cid]?.days;
        if (Array.isArray(days) && days.length) {
          const sorted = [...days].sort();
          first = sorted[0]; last = sorted[sorted.length - 1];
        }
      }
      if (first && (!minFirst || first < minFirst)) minFirst = first;
      if (last && (!maxLast || last > maxLast)) maxLast = last;
    }
    const a = fmtDayShort(minFirst);
    const b = fmtDayShort(maxLast);
    if (a && b && a !== b) return `${a} → ${b}`;
    return a || b || "—";
  };

  // Resumen por subfaena (primera hoja del detalle imprimible). Filas:
  // subfaena, con la faena solo en la primera fila del bloque y un subtotal
  // por faena; columnas: Período, Transferencia, Efectivo y TOTAL. Solo en
  // modo "detail".
  const subfaenaSummaryHtml = (isDetail && subfaenaSummary && subfaenaSummary.rows.length > 0)
    ? (() => {
        let prevFaena = null;
        const rowsHtml = subfaenaSummary.rows.map((r, i, arr) => {
          const showFaena = r.faenaName !== prevFaena;
          prevFaena = r.faenaName;
          const row = `
            <tr>
              <td>${showFaena ? r.faenaName : ""}</td>
              <td>${r.subfaenaName}</td>
              <td style="font-size:11px;color:#444">${cyclesPeriod(r.cycleIds)}</td>
              <td style="text-align:right">${fmt(r.bank)}</td>
              <td style="text-align:right">${fmt(r.cash)}</td>
              <td style="text-align:right"><b>${fmt(r.total)}</b></td>
            </tr>`;
          const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
          if (!isLastOfFaena) return row;
          const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
          const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
          const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
          const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
          return `${row}
            <tr class="subtotal-faena">
              <td colspan="3" style="text-align:right"><b>Sub total por faena</b></td>
              <td style="text-align:right"><b>${fmt(subBank)}</b></td>
              <td style="text-align:right"><b>${fmt(subCash)}</b></td>
              <td style="text-align:right"><b>${fmt(subTotal)}</b></td>
            </tr>`;
        }).join("");
        return `<section class="receipt summary-page">
          <div class="hd">
            <div>
              <h1>Resumen por subfaena</h1>
              <div class="sub">${payroll.name} · ${cyclesLine}</div>
            </div>
            <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
          </div>
          <table class="subfaena-summary">
            <thead>
              <tr>
                <th>Faena</th>
                <th>Subfaena</th>
                <th style="width:130px">Período</th>
                <th style="text-align:right">Transferencia</th>
                <th style="text-align:right">Efectivo</th>
                <th style="text-align:right">TOTAL</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              ${buildAdjustmentRowsHtml(3)}
              <tr class="summary-total">
                <td colspan="3"><b>TOTAL</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(subfaenaSummary.totals).bank)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(subfaenaSummary.totals).cash)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(subfaenaSummary.totals).total)}</b></td>
              </tr>
            </tfoot>
          </table>
        </section>`;
      })()
    : "";

  // Resumen por labor (segunda hoja del detalle imprimible): la misma tabla
  // que el resumen por subfaena, desglosada también por labor. Solo en modo
  // "detail".
  const laborSummaryHtml = (isDetail && laborSummary && laborSummary.rows.length > 0)
    ? (() => {
        let prevSubfaena = null;
        const rowsHtml = laborSummary.rows.map((r, i, arr) => {
          const showSubfaena = r.subfaenaName !== prevSubfaena;
          prevSubfaena = r.subfaenaName;
          const row = `
            <tr>
              <td>${showSubfaena ? r.faenaName : ""}</td>
              <td>${showSubfaena ? r.subfaenaName : ""}</td>
              <td>${r.laborName}</td>
              <td style="font-size:11px;color:#444">${cyclesPeriod(r.cycleIds)}</td>
              <td style="text-align:right">${fmt(r.bank)}</td>
              <td style="text-align:right">${fmt(r.cash)}</td>
              <td style="text-align:right"><b>${fmt(r.total)}</b></td>
            </tr>`;
          const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
          if (!isLastOfFaena) return row;
          const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
          const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
          const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
          const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
          return `${row}
            <tr class="subtotal-faena">
              <td colspan="4" style="text-align:right"><b>Sub total por faena</b></td>
              <td style="text-align:right"><b>${fmt(subBank)}</b></td>
              <td style="text-align:right"><b>${fmt(subCash)}</b></td>
              <td style="text-align:right"><b>${fmt(subTotal)}</b></td>
            </tr>`;
        }).join("");
        return `<section class="receipt summary-page">
          <div class="hd">
            <div>
              <h1>Resumen por labor</h1>
              <div class="sub">${payroll.name} · ${cyclesLine}</div>
            </div>
            <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
          </div>
          <table class="subfaena-summary">
            <thead>
              <tr>
                <th>Faena</th>
                <th>Subfaena</th>
                <th>Labor</th>
                <th style="width:130px">Período</th>
                <th style="text-align:right">Transferencia</th>
                <th style="text-align:right">Efectivo</th>
                <th style="text-align:right">TOTAL</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              ${buildAdjustmentRowsHtml(4)}
              <tr class="summary-total">
                <td colspan="4"><b>TOTAL</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).bank)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).cash)}</b></td>
                <td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).total)}</b></td>
              </tr>
            </tfoot>
          </table>
        </section>`;
      })()
    : "";

  const summariesHtml = (isDetail && summaries.length > 0)
    ? `<section class="receipt summary-page">
        <div class="hd">
          <div>
            <h1>Resumen por grupo</h1>
            <div class="sub">${payroll.name} · ${cyclesLine}</div>
          </div>
          <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
        </div>
        ${summaries.map((s) => {
          const rowsHtml = s.rows.map((r) => {
            const faenas = (r.byFaena && r.byFaena.length > 0)
              ? r.byFaena
              : [{ faenaName: "—", total: r.total }];
            return faenas.map((f, i) => `
              <tr>
                <td>${i === 0 ? `<b>${r.leader}</b>` : ""}</td>
                <td>${f.faenaName}</td>
                <td style="text-align:right">${fmt(f.total)}</td>
              </tr>`).join("");
          }).join("");
          return `
          <div class="summary-block">
            <h3>${s.title}</h3>
            <table class="group-summary">
              <thead>
                <tr>
                  <th>Líder</th>
                  <th>Faena</th>
                  <th style="text-align:right">TOTAL</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr class="summary-total">
                  <td colspan="2"><b>Total ${s.title}</b></td>
                  <td style="text-align:right"><b>${fmt(s.total)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>`;
        }).join("")}
      </section>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${docTitle}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #222; }
  .receipt { padding: 22px 28px; page-break-after: always; }
  .receipt:last-child { page-break-after: auto; }
  .hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 2px solid #555; padding-bottom: 10px; margin-bottom: 12px; }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .copy-tag { font-size: 10px; font-weight: 600; padding: 2px 8px; margin-left: 8px; border: 1px solid #999; border-radius: 4px; vertical-align: middle; background: #FFE699; color: #555; }
  .sub { color: #666; font-size: 12px; }
  .meta { font-size: 12px; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #B7DEE8; }
  th, td { border: 1px solid #999; padding: 5px 7px; }
  th .muted { font-weight: normal; color: #666; font-size: 10px; }
  .mono { font-family: ui-monospace, monospace; }
  /* Bloque firma + recap del subtotal. El recap repite el subtotal del grupo
     justo encima de la firma — si la paginación rompe entre la tabla y la
     firma, el recap garantiza que la página de la firma no quede vacía de
     contexto (subtotal grupo X · N personas · $YYY). break-inside: avoid
     mantiene el recap pegado a la firma como una unidad. Tamaños comprimidos
     ~75% del original para minimizar casos borde de paginación. */
  /* Cadena de "avoid break" para que la firma jamás quede sola en una hoja:
     últimas 3 filas (.keep-with-sign) → tfoot → .signs-block. Si la firma
     no entra en la página actual, el navegador empuja también las 3 filas
     marcadas y el tfoot a la página siguiente. Soportado por todos los
     navegadores modernos en print (Chrome/Edge/Firefox/Safari). */
  tbody tr.keep-with-sign { break-after: avoid; page-break-after: avoid; }
  tfoot { break-after: avoid; page-break-after: avoid; }
  .signs-block { break-inside: avoid; page-break-inside: avoid; margin-top: 18px; }
  .signs-recap { text-align: right; font-size: 10px; color: #444; padding: 4px 0; border-top: 1px dashed #999; }
  .signs { display: flex; justify-content: flex-end; margin-top: 18px; gap: 45px; font-size: 11px; }
  .sign { width: 210px; text-align: center; }
  .sign-right { margin-left: auto; }
  .line { border-top: 1px solid #444; margin-bottom: 3px; height: 22px; }
  .detail-title { font-size: 14px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #999; }
  .detail { margin-top: 12px; }
  .detail h3 { font-size: 12px; padding: 4px 8px; margin: 0 0 6px; border: 1px solid #999; }
  .prod-table { margin: 6px 0 12px; }
  .prod-table h4 { font-size: 11px; padding: 3px 6px; margin: 0 0 0; border: 1px solid #999; border-bottom: none; }
  .prod-table h4 .muted { font-weight: normal; color: #555; font-size: 10px; }
  table.prod { width: 100%; font-size: 10px; table-layout: auto; }
  table.prod .prod-name { text-align: left; min-width: 110px; }
  table.prod .prod-day { text-align: center; min-width: 60px; }
  table.prod .prod-cell { text-align: center; }
  table.prod .prod-cell .muted { color: #555; font-size: 9px; }
  table.prod .prod-day .prod-price { color: #555; font-size: 9px; font-weight: normal; margin-top: 1px; }
  table.prod .prod-breakdown { font-size: 9px; color: #555; line-height: 1.2; }
  .summary-block { margin: 16px 0; }
  .summary-block h3 { font-size: 13px; margin: 0 0 6px; padding: 4px 8px; background: #F2F2F2; border: 1px solid #999; }
  table.summary { width: 60%; min-width: 320px; }
  table.summary .summary-total td { background: #FFE699; }
  table.group-summary { width: 100%; margin-top: 8px; }
  table.group-summary .summary-total td { background: #FFE699; }
  h1.group-h1 { font-size: 22px; }
  h1.group-h1 .group-leader-name { color: #555; font-weight: 600; }
  table.subfaena-summary { width: 100%; margin-top: 8px; }
  table.subfaena-summary .summary-total td { background: #FFE699; }
  table.subfaena-summary .subtotal-faena td { background: #F2F2F2; font-style: italic; }
  table.subfaena-summary .adj-row td { background: #EAF3FA; }
  table.subfaena-summary .pending-row td { background: #FFF4E5; }
  table.prod .prod-total { text-align: right; min-width: 70px; }
  @media print { @page { margin: 14mm landscape; } .receipt { padding: 0; } }
</style>
</head><body>${subfaenaSummaryHtml}${laborSummaryHtml}${summariesHtml}${groupsHtml}
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
}

// Ciclos y jornadas de una nómina: la parte cara. No depende de cómo se agrupe
// a la gente (`wdIdSet` sale de `payroll.items[].workdayIds`, la unión de todos
// los grupos), así que se pide una vez por nómina y la reusan el detalle de
// pago, los comprobantes de efectivo y la hoja de cada líder.
async function fetchPayrollWorkdays(payroll) {
  const cycleIds = payroll.cycleIds || (payroll.cycleDetails || []).map((c) => c.id);
  const cycles = await Promise.all(cycleIds.map((id) => cyclesService.getById(id)));
  const cyclesById = {};
  for (const c of cycles) if (c) cyclesById[c.id] = c;

  const items = payroll.items || [];
  // Solo las jornadas de esta nómina: sus ciclos también tienen jornadas de
  // otras nóminas.
  const wdIdSet = new Set(items.flatMap((it) => it.workdayIds || []));
  const workdays = [];
  for (let i = 0; i < cycleIds.length; i += 10) {
    const chunk = cycleIds.slice(i, i + 10);
    if (chunk.length === 0) continue;
    const wds = await workdaysService.list({ wheres: [["cycleId", "in", chunk]] });
    for (const w of wds) if (wdIdSet.has(w.id)) workdays.push(w);
  }

  const nameByRut = new Map(items.map((it) => [it.rut, it.name]));
  return { cycleIds, cyclesById, workdays, nameByRut };
}

// Grillas por (grupo, ciclo), calculadas en memoria sobre lo que trajo
// `fetchPayrollWorkdays`. Cada llamador pasa sus grupos: todos para el detalle
// de pago, solo los de efectivo para los comprobantes, uno para la hoja de un
// líder. Los grupos de `allGroups` juntan banco y efectivo bajo el mismo líder,
// así que su resultado no sirve para la hoja firmable de efectivo.
//
// Las jornadas sí se comparten: `buildGroupCycleSnapshot` filtra por ciclo y
// por rut, así que recibir jornadas de más no cambia ninguna fila.
function buildWorkdaysByGroup(groups, payrollData, catalogs = {}) {
  const { cycleIds, cyclesById, workdays, nameByRut } = payrollData;
  const workdaysByGroup = {};
  for (const g of groups) {
    const groupRuts = g.items.map((it) => it.rut);
    const byCycle = {};
    for (const cid of cycleIds) {
      const cycle = cyclesById[cid];
      if (!cycle) continue;
      byCycle[cid] = buildGroupCycleSnapshot(groupRuts, cycle, workdays, nameByRut, catalogs);
    }
    workdaysByGroup[g.leader] = byCycle;
  }
  return workdaysByGroup;
}

// Resumen por labor (segunda hoja del "Detalle de pago" imprimible y vista
// "con labores" del Resumen en pantalla). Mismo criterio que subfaenaSummary
// (banco y efectivo por fila), desglosado también por labor y sumando a todos
// los trabajadores de la nómina. Necesita `workdaysByGroup` (ver
// buildWorkdaysByGroup): payroll.items solo trae el total por ciclo.
function computeLaborSummary(payroll, allGroups, workdaysByGroup) {
  const allItems = allGroups.flatMap((g) => g.items);
  const cashByRut = new Map(allItems.map((it) => [it.rut, isCashBank(it.bankCode)]));
  const cycleDetails = payroll.cycleDetails || [];
  const acc = new Map(); // clave: subfaenaName||laborName
  for (const g of allGroups) {
    const byCycle = workdaysByGroup[g.leader] || {};
    for (const [cid, snapshots] of Object.entries(byCycle)) {
      const cd = cycleDetails.find((c) => c.id === cid);
      const subfaenaName = cd?.subfaenaName || cd?.label || cid;
      const faenaName = cd?.faenaName || "—";
      for (const snap of snapshots) {
        for (const row of snap.rows) {
          if (!(row.totalAmount > 0)) continue;
          const key = `${subfaenaName}||${snap.laborName}`;
          if (!acc.has(key)) {
            acc.set(key, { faenaName, subfaenaName, laborName: snap.laborName, bank: 0, cash: 0, total: 0, cycleIds: new Set() });
          }
          const entry = acc.get(key);
          if (cashByRut.get(row.rut)) entry.cash += row.totalAmount;
          else entry.bank += row.totalAmount;
          entry.total += row.totalAmount;
          entry.cycleIds.add(cid);
        }
      }
    }
  }
  const rows = [...acc.values()].sort((a, b) => {
    const f = a.faenaName.localeCompare(b.faenaName, "es");
    if (f !== 0) return f;
    const s = a.subfaenaName.localeCompare(b.subfaenaName, "es");
    if (s !== 0) return s;
    return a.laborName.localeCompare(b.laborName, "es");
  });
  const totals = rows.reduce(
    (acc2, r) => ({ bank: acc2.bank + r.bank, cash: acc2.cash + r.cash, total: acc2.total + r.total }),
    { bank: 0, cash: 0, total: 0 },
  );
  return { rows, totals };
}

// Bonos y anticipos por medio de pago. Son un ajuste por trabajador, no por
// subfaena ni labor, así que van como filas de ajuste al pie de
// subfaenaSummary/laborSummary para que el TOTAL cuadre con lo que hay que
// pagar.
function computeBonusAdvanceSummary(items) {
  let bankBonus = 0, cashBonus = 0, bankAdvance = 0, cashAdvance = 0;
  for (const it of items) {
    const isCash = isCashBank(it.bankCode);
    const bonus = Number(it.bonus) || 0;
    const advance = Number(it.advance) || 0;
    if (isCash) { cashBonus += bonus; cashAdvance += advance; }
    else { bankBonus += bonus; bankAdvance += advance; }
  }
  return {
    bonus: { bank: bankBonus, cash: cashBonus, total: bankBonus + cashBonus },
    advance: { bank: bankAdvance, cash: cashAdvance, total: bankAdvance + cashAdvance },
  };
}

async function printPaymentDetails(payroll, allGroups, titleOverrides = {}, summaries = [], catalogs = {}, subfaenaSummary = null, payrollData = null, rutOf = undefined) {
  if (allGroups.length === 0) return;
  const allItems = allGroups.flatMap((g) => g.items);
  // `payrollData` viene memorizado desde el modal; si no llega, se lee acá.
  const data = payrollData || (await fetchPayrollWorkdays(payroll));
  const { cyclesById } = data;
  const workdaysByGroup = buildWorkdaysByGroup(allGroups, data, catalogs);
  const laborSummary = computeLaborSummary(payroll, allGroups, workdaysByGroup);
  const bonusAdvanceSummary = computeBonusAdvanceSummary(allItems);

  const html = buildCashReceiptHtml(payroll, allGroups, {
    titleOverrides,
    workdaysByGroup,
    cyclesById,
    catalogs,
    mode: "detail",
    summaries,
    subfaenaSummary,
    laborSummary,
    bonusAdvanceSummary,
    rutOf,
  });
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    throw new Error("Permite las ventanas emergentes para imprimir.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// Imprime solo la tabla de resumen, por subfaena o por labor según el toggle
// del Resumen en pantalla: las mismas tablas del "Detalle de pago", sin los
// comprobantes de cada grupo.
function printResumenTable(payroll, {
  showLabor, subfaenaSummary, laborSummary, bonusAdvanceSummary,
  pendingRows = [], pendingMode = "none",
}) {
  const fmt = (v) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(Number(v) || 0);
  const fmtDayShort = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : d;
  };
  const cycleDetails = payroll.cycleDetails || [];
  const cyclesPeriod = (cycleIds) => {
    let minFirst = null, maxLast = null;
    for (const cid of cycleIds) {
      const cd = cycleDetails.find((c) => c.id === cid);
      const first = cd?.firstDay || "";
      const last = cd?.lastDay || "";
      if (first && (!minFirst || first < minFirst)) minFirst = first;
      if (last && (!maxLast || last > maxLast)) maxLast = last;
    }
    const a = fmtDayShort(minFirst), b = fmtDayShort(maxLast);
    if (a && b && a !== b) return `${a} → ${b}`;
    return a || b || "—";
  };
  const buildAdjustmentRowsHtml = (labelColspan) => {
    const rows = [];
    if (bonusAdvanceSummary?.bonus.total > 0) {
      rows.push(`<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Bonos</td><td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.bank)}</td><td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.cash)}</td><td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.total)}</td></tr>`);
    }
    if (bonusAdvanceSummary?.advance.total > 0) {
      rows.push(`<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Anticipos</td><td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.bank)}</td><td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.cash)}</td><td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.total)}</td></tr>`);
    }
    return rows.join("");
  };
  const adjustedTotals = (base) => ({
    bank: base.bank + (bonusAdvanceSummary?.bonus.bank || 0) - (bonusAdvanceSummary?.advance.bank || 0),
    cash: base.cash + (bonusAdvanceSummary?.bonus.cash || 0) - (bonusAdvanceSummary?.advance.cash || 0),
    total: base.total + (bonusAdvanceSummary?.bonus.total || 0) - (bonusAdvanceSummary?.advance.total || 0),
  });
  // Filas del efectivo adeudado de nóminas anteriores. `nameColspan` = cuántas
  // columnas ocupa el nombre (2 en la vista por labor, que tiene una columna
  // más antes del período).
  const pendingRowsHtml = (nameColspan) => (pendingMode === "none" ? "" : pendingRows.map((r) => `
    <tr class="pending-row">
      <td>—</td>
      <td colspan="${nameColspan}">💵 Efectivo pendiente — ${r.name} <span style="color:#666;font-size:11px">· ${r.count} pers.</span></td>
      <td style="font-size:11px;color:#444">${r.period ? `${fmtDayShort(r.period.first)} → ${fmtDayShort(r.period.last)}` : "—"}</td>
      <td style="text-align:right">${fmt(0)}</td>
      <td style="text-align:right">${fmt(r.cash)}</td>
      <td style="text-align:right"><b>${fmt(r.total)}</b></td>
    </tr>`).join(""));
  const pendingSum = pendingRows.reduce((s, r) => s + r.total, 0);
  // En "onlyPending" el efectivo de esta nómina no sale: se difiere a la vuelta
  // siguiente, así que se resta con una fila propia.
  const deferredOf = (base) => (pendingMode === "onlyPending" ? adjustedTotals(base).cash : 0);
  const deferRowHtml = (labelColspan, base) => {
    const d = deferredOf(base);
    if (d <= 0) return "";
    return `<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Efectivo que queda pendiente</td><td style="text-align:right">${fmt(0)}</td><td style="text-align:right">− ${fmt(d)}</td><td style="text-align:right">− ${fmt(d)}</td></tr>`;
  };
  const grand = (base) => {
    const b = adjustedTotals(base);
    const d = deferredOf(base);
    const add = pendingMode === "none" ? 0 : pendingSum;
    return { bank: b.bank, cash: b.cash - d + add, total: b.total - d + add };
  };

  const today = new Date().toLocaleDateString("es-CL");
  const cyclesLine = cycleDetails.map((c) => c.label).join(" · ");

  let bodyHtml;
  if (!showLabor) {
    let prevFaena = null;
    const rowsHtml = subfaenaSummary.rows.map((r, i, arr) => {
      const showFaena = r.faenaName !== prevFaena;
      prevFaena = r.faenaName;
      const row = `<tr><td>${showFaena ? r.faenaName : ""}</td><td>${r.subfaenaName}</td><td style="font-size:11px;color:#444">${cyclesPeriod([...r.cycleIds])}</td><td style="text-align:right">${fmt(r.bank)}</td><td style="text-align:right">${fmt(r.cash)}</td><td style="text-align:right"><b>${fmt(r.total)}</b></td></tr>`;
      const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
      if (!isLastOfFaena) return row;
      const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
      const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
      const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
      const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
      return `${row}<tr class="subtotal-faena"><td colspan="3" style="text-align:right"><b>Sub total por faena</b></td><td style="text-align:right"><b>${fmt(subBank)}</b></td><td style="text-align:right"><b>${fmt(subCash)}</b></td><td style="text-align:right"><b>${fmt(subTotal)}</b></td></tr>`;
    }).join("");
    bodyHtml = `<table class="subfaena-summary">
      <thead><tr><th>Faena</th><th>Subfaena</th><th style="width:130px">Período</th><th style="text-align:right">Transferencia</th><th style="text-align:right">Efectivo</th><th style="text-align:right">TOTAL</th></tr></thead>
      <tbody>${rowsHtml}${pendingRowsHtml(1)}</tbody>
      <tfoot>
        ${buildAdjustmentRowsHtml(3)}${deferRowHtml(3, subfaenaSummary.totals)}
        <tr class="summary-total"><td colspan="3"><b>${pendingMode === "onlyPending" ? "TOTAL A PAGAR" : "TOTAL"}</b></td><td style="text-align:right"><b>${fmt(grand(subfaenaSummary.totals).bank)}</b></td><td style="text-align:right"><b>${fmt(grand(subfaenaSummary.totals).cash)}</b></td><td style="text-align:right"><b>${fmt(grand(subfaenaSummary.totals).total)}</b></td></tr>
      </tfoot>
    </table>`;
  } else {
    let prevSubfaena = null;
    const rowsHtml = laborSummary.rows.map((r, i, arr) => {
      const showSubfaena = r.subfaenaName !== prevSubfaena;
      prevSubfaena = r.subfaenaName;
      const row = `<tr><td>${showSubfaena ? r.faenaName : ""}</td><td>${showSubfaena ? r.subfaenaName : ""}</td><td>${r.laborName}</td><td style="font-size:11px;color:#444">${cyclesPeriod([...r.cycleIds])}</td><td style="text-align:right">${fmt(r.bank)}</td><td style="text-align:right">${fmt(r.cash)}</td><td style="text-align:right"><b>${fmt(r.total)}</b></td></tr>`;
      const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
      if (!isLastOfFaena) return row;
      const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
      const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
      const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
      const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
      return `${row}<tr class="subtotal-faena"><td colspan="4" style="text-align:right"><b>Sub total por faena</b></td><td style="text-align:right"><b>${fmt(subBank)}</b></td><td style="text-align:right"><b>${fmt(subCash)}</b></td><td style="text-align:right"><b>${fmt(subTotal)}</b></td></tr>`;
    }).join("");
    bodyHtml = `<table class="subfaena-summary">
      <thead><tr><th>Faena</th><th>Subfaena</th><th>Labor</th><th style="width:130px">Período</th><th style="text-align:right">Transferencia</th><th style="text-align:right">Efectivo</th><th style="text-align:right">TOTAL</th></tr></thead>
      <tbody>${rowsHtml}${pendingRowsHtml(2)}</tbody>
      <tfoot>
        ${buildAdjustmentRowsHtml(4)}${deferRowHtml(4, laborSummary.totals)}
        <tr class="summary-total"><td colspan="4"><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).bank)}</b></td><td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).cash)}</b></td><td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).total)}</b></td></tr>
      </tfoot>
    </table>`;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${payroll.name} — Resumen</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #222; padding: 22px 28px; }
  .hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 2px solid #555; padding-bottom: 10px; margin-bottom: 12px; }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .sub { color: #666; font-size: 12px; }
  .meta { font-size: 12px; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th { background: #B7DEE8; }
  th, td { border: 1px solid #999; padding: 5px 7px; }
  table.subfaena-summary .summary-total td { background: #FFE699; }
  table.subfaena-summary .subtotal-faena td { background: #F2F2F2; font-style: italic; }
  table.subfaena-summary .adj-row td { background: #EAF3FA; }
  table.subfaena-summary .pending-row td { background: #FFF4E5; }
  @media print { @page { margin: 14mm landscape; } }
</style>
</head><body>
  <div class="hd">
    <div>
      <h1>Resumen ${showLabor ? "por labor" : "por subfaena"}</h1>
      <div class="sub">${payroll.name} · ${cyclesLine}</div>
    </div>
    <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
  </div>
  ${bodyHtml}
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("Permite las ventanas emergentes para imprimir.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

async function printCashReceipts(payroll, cashGroups, titleOverrides = {}, catalogs = {}, payrollData = null, rutOf = undefined) {
  // La hoja que firma el líder deja fuera a quien no cobra nada ni produjo:
  // los días de asistencia de un sueldo mensual, que entran a la nómina solo
  // para quedar etiquetados. El corte es por bruto: quien produjo y quedó en
  // cero por un anticipo sí va en la hoja, como saldado.
  const gruposConPago = cashGroups
    .map((g) => {
      const items = g.items.filter(
        (it) => Math.round(Number(it.amount) || 0) > 0 || Math.round(Number(it.grossAmount) || 0) > 0,
      );
      return { ...g, items, total: items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0) };
    })
    .filter((g) => g.items.length > 0);
  if (gruposConPago.length === 0) return;
  cashGroups = gruposConPago;

  const data = payrollData || (await fetchPayrollWorkdays(payroll));
  const { cyclesById } = data;
  // Los grupos son SOLO los de efectivo: la hoja que firma el líder no puede
  // mostrar la producción de su gente de banco.
  const workdaysByGroup = buildWorkdaysByGroup(cashGroups, data, catalogs);

  const html = buildCashReceiptHtml(payroll, cashGroups, {
    titleOverrides,
    workdaysByGroup,
    cyclesById,
    catalogs,
    rutOf,
  });
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    throw new Error("Permite las ventanas emergentes para imprimir.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// Fila de chips de un filtro múltiple (Grupo, Ciclo) del detalle de la nómina.
function FilterChips({ label, options, active, onToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="w-12 shrink-0 text-[var(--color-muted)]">{label}</span>
      {options.map((o) => {
        const on = active.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            title={o.title}
            aria-pressed={on}
            className={`min-h-7 rounded-full border px-2.5 py-0.5 ${
              on
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]"
            }`}
          >
            {on ? "✓ " : ""}
            {o.label}
            {o.count != null && <span className="ml-1 opacity-60">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Un filtro activo, con ✕ para quitarlo.
function FilterToken({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)] py-0.5 pl-2.5 pr-1 text-[var(--color-accent)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${label}`}
        className="rounded-full px-1 leading-none hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
      >
        ✕
      </button>
    </span>
  );
}

function PayrollDetailModal({ payroll, cycles, faenas, subfaenas, workers, allPayrolls = [], onClose, onRedownload, onDownloadNominaOnly, onDownloadSnapshot, onPublishPortal = null, publishedPayrollId = null, onChanged }) {
  const { catalogs } = useCatalogs();
  const toast = useToast();
  const isMobile = useIsMobile();
  const items = payroll.items || [];
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);
  const { bank, cash } = splitBankAndCash(items);
  const cashGroups = groupCashByLeader(cash);
  const allGroups = groupCashByLeader(items); // todos (banco y efectivo) agrupados por líder

  // Filtros y estado de la UI del detalle.
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("all"); // all | bank | cash
  const [leaderFilter, setLeaderFilter] = useState(() => new Set());
  const [cycleFilter, setCycleFilter] = useState(() => new Set());
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
  // Panel de los filtros de Grupo y Ciclo.
  const [showFilters, setShowFilters] = useState(false);

  const toggleSection = (key) => setCollapsedSections((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const isCollapsed = (key) => collapsedSections.has(key);
  const toggleSetItem = (setter, value) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });

  // Líderes únicos en la nómina (para el filtro de grupo).
  const allLeaders = useMemo(() => {
    const set = new Map(); // líder → cantidad
    for (const it of items) {
      const l = normalizeLeader(it.groupLeader || "") || "SIN GRUPO";
      set.set(l, (set.get(l) || 0) + 1);
    }
    return [...set.entries()]
      .map(([leader, count]) => ({ leader, count }))
      .sort((a, b) => a.leader.localeCompare(b.leader, "es"));
  }, [items]);

  // Filtros vigentes: se ignora el grupo o el ciclo que ya no está en la
  // nómina (un ciclo que se sacó, un grupo cuyo último trabajador salió). Se
  // descarta al leer y no al editar, así cubre sacar ciclos o labores, sacar un
  // trabajador y recalcular.
  const activeLeaderFilter = useMemo(() => {
    const vigentes = new Set(allLeaders.map((g) => g.leader));
    return new Set([...leaderFilter].filter((l) => vigentes.has(l)));
  }, [leaderFilter, allLeaders]);
  const activeCycleFilter = useMemo(() => {
    const vigentes = new Set((payroll.cycleDetails || []).map((c) => c.id));
    return new Set([...cycleFilter].filter((id) => vigentes.has(id)));
  }, [cycleFilter, payroll.cycleDetails]);

  // Filtrado de items aplicando todos los criterios juntos.
  const filteredItems = useMemo(() => {
    const q = search.trim();
    return items.filter((it) => {
      if (q) {
        const hay = `${it.rut || ""} ${rutOf(it.rut, it.workerId)} ${it.name || ""} ${it.groupLeader || ""}`;
        if (!matchesSearchQuery(hay, q)) return false;
      }
      const isCash = isCashBank(it.bankCode);
      if (paymentMethod === "bank" && isCash) return false;
      if (paymentMethod === "cash" && !isCash) return false;
      if (activeLeaderFilter.size > 0) {
        const l = normalizeLeader(it.groupLeader || "") || "SIN GRUPO";
        if (!activeLeaderFilter.has(l)) return false;
      }
      if (activeCycleFilter.size > 0) {
        const hasAny = [...activeCycleFilter].some((cid) => (Number(it.byCycle?.[cid]) || 0) > 0);
        if (!hasAny) return false;
      }
      return true;
    });
  }, [items, search, paymentMethod, activeLeaderFilter, activeCycleFilter]);

  const filteredSplit = useMemo(() => splitBankAndCash(filteredItems), [filteredItems]);
  const filteredBank = filteredSplit.bank;
  const filteredCash = filteredSplit.cash;
  const filteredCashGroups = useMemo(() => groupCashByLeader(filteredCash), [filteredCash]);
  // Banco también agrupado por líder, para imprimir el detalle por grupo (ej.
  // solo CHILENOS) igual que en efectivo. groupCashByLeader sirve para
  // cualquier conjunto de items, no solo los de efectivo.
  const filteredBankGroups = useMemo(() => groupCashByLeader(filteredBank), [filteredBank]);

  // Entrega del efectivo persona por persona. Solo tiene sentido cuando las
  // transferencias ya se pagaron y el efectivo quedó debiéndose: antes de eso
  // no hay deuda que descontar, y después de pagar la nómina ya no importa.
  const cashPaidMode = !!payroll.bankPaidAt && payroll.status !== "paid";
  const [cashPaidSet, setCashPaidSet] = useState(() => new Set(payroll.cashPaidRuts || []));
  // Guardado diferido (700 ms): marcar varias personas seguidas es una sola escritura.
  const cashSaveRef = useRef(null);
  const flushCashPaid = useRef(() => {});
  const toggleCashPaid = (rut) => {
    setCashPaidSet((prev) => {
      const next = new Set(prev);
      if (next.has(rut)) next.delete(rut); else next.add(rut);
      const ruts = [...next];
      flushCashPaid.current = () => setCashPaidRuts(payroll.id, ruts).catch((err) => {
        console.error("[nómina] no se pudo guardar quién cobró:", err);
        toast.error("No se pudo guardar quién cobró el efectivo.");
      });
      if (cashSaveRef.current) clearTimeout(cashSaveRef.current);
      cashSaveRef.current = setTimeout(() => { cashSaveRef.current = null; flushCashPaid.current(); }, 700);
      return next;
    });
  };
  const setGroupCashPaid = (groupItems, paid) => {
    setCashPaidSet((prev) => {
      const next = new Set(prev);
      for (const it of groupItems) {
        if (paid) next.add(it.rut); else next.delete(it.rut);
      }
      const ruts = [...next];
      flushCashPaid.current = () => setCashPaidRuts(payroll.id, ruts).catch((err) => {
        console.error("[nómina] no se pudo guardar quién cobró:", err);
        toast.error("No se pudo guardar quién cobró el efectivo.");
      });
      if (cashSaveRef.current) clearTimeout(cashSaveRef.current);
      cashSaveRef.current = setTimeout(() => { cashSaveRef.current = null; flushCashPaid.current(); }, 700);
      return next;
    });
  };
  // Si el modal se cierra antes de que corra el debounce, igual se guarda.
  useEffect(() => () => {
    if (cashSaveRef.current) { clearTimeout(cashSaveRef.current); flushCashPaid.current(); }
  }, []);
  // Efectivo que todavía se debe, en vivo (sin esperar el refetch del doc).
  const owedCash = cashPaidMode
    ? cash.reduce((s, it) => s + (cashPaidSet.has(it.rut) ? 0 : Number(it.amount) || 0), 0)
    : 0;

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

  const hasActiveFilter = !!(search || paymentMethod !== "all" || activeLeaderFilter.size > 0 || activeCycleFilter.size > 0);
  const moreFilterCount = activeLeaderFilter.size + activeCycleFilter.size;
  const clearFilters = () => {
    setSearch("");
    setPaymentMethod("all");
    setLeaderFilter(new Set());
    setCycleFilter(new Set());
  };

  // Las dos tablas de totales por líder ("Resumen por grupo") de "Detalle de
  // pago", con una fila por líder:
  //   1) "Con cuenta RUT": CHILENOS y EXTRANJEROSCONCUENTARUT.
  //   2) "Otros grupos": el resto de los líderes.
  const detailSummaries = (() => {
    const CRUT_LEADERS = new Set(["CHILENOS", "EXTRANJEROSCONCUENTARUT"]);
    const compact = (s) => normalizeLeader(s).replace(/\s+/g, "");
    const inCrut = (g) => CRUT_LEADERS.has(compact(g.leader));

    // cycleId → faenaName; sin faena guardada, usa el label del ciclo.
    const faenaByCycle = new Map();
    for (const cd of payroll.cycleDetails || []) {
      faenaByCycle.set(cd.id, cd.faenaName || cd.label || "—");
    }
    const groupWithFaenas = (g) => {
      const byFaena = new Map();
      for (const it of g.items) {
        for (const [cid, amt] of Object.entries(it.byCycle || {})) {
          const fName = faenaByCycle.get(cid) || "—";
          byFaena.set(fName, (byFaena.get(fName) || 0) + (Number(amt) || 0));
        }
      }
      const byFaenaList = [...byFaena.entries()]
        .map(([faenaName, total]) => ({ faenaName, total }))
        .filter((f) => f.total > 0)
        .sort((a, b) => a.faenaName.localeCompare(b.faenaName, "es"));
      return { leader: g.leader, total: g.total, byFaena: byFaenaList };
    };

    const crut = allGroups.filter(inCrut).map(groupWithFaenas);
    const others = allGroups.filter((g) => !inCrut(g)).map(groupWithFaenas);
    const sumOf = (arr) => arr.reduce((s, g) => s + (Number(g.total) || 0), 0);
    const out = [];
    if (crut.length) {
      out.push({ title: "Con cuenta RUT", rows: crut, total: sumOf(crut) });
    }
    if (others.length) {
      out.push({ title: "Otros grupos", rows: others, total: sumOf(others) });
    }
    return out;
  })();

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
        aggregateWorkerAmounts(nuevas, laborTypeById).map(resolverRutVigente(workers)),
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
      toast.success(resumenAgregado(`${selectedCycles.length} ciclo(s) agregado(s) a la nómina.`, plan.added));
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
        resumenAgregado(`${dias} día(s) de ${worker.name || "la persona"} agregado(s) a la nómina.`, plan.added) +
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

  // Resumen por subfaena (primera hoja del "Detalle de pago" imprimible):
  // subfaenas con monto > 0, ordenadas por faena y subfaena, con
  // transferencia y efectivo por fila. Sin subfaena guardada, la fila usa el
  // label del ciclo, y "—" sin faena.
  const subfaenaSummary = (() => {
    const bySubfaena = new Map();
    for (const cd of cycleDetails) {
      const sId = cd.subfaenaId || `__${cd.id}__`;
      if (!bySubfaena.has(sId)) {
        bySubfaena.set(sId, {
          subfaenaName: cd.subfaenaName || cd.label || "—",
          faenaName: cd.faenaName || "—",
          cycleIds: new Set(),
        });
      }
      bySubfaena.get(sId).cycleIds.add(cd.id);
    }
    const sumForCycles = (arr, cycleIds) =>
      arr.reduce((s, it) => {
        let row = 0;
        for (const cid of cycleIds) row += Number(it.byCycle?.[cid]) || 0;
        return s + row;
      }, 0);
    const rows = [...bySubfaena.values()]
      .map((r) => ({
        ...r,
        bank: sumForCycles(bank, r.cycleIds),
        cash: sumForCycles(cash, r.cycleIds),
      }))
      .filter((r) => r.bank + r.cash > 0)
      .map((r) => ({ ...r, total: r.bank + r.cash }))
      .sort((a, b) => {
        const fa = a.faenaName.localeCompare(b.faenaName, "es");
        if (fa !== 0) return fa;
        return a.subfaenaName.localeCompare(b.subfaenaName, "es");
      });
    const totals = rows.reduce(
      (acc, r) => ({
        bank: acc.bank + r.bank,
        cash: acc.cash + r.cash,
        total: acc.total + r.total,
      }),
      { bank: 0, cash: 0, total: 0 },
    );
    return { rows, totals };
  })();

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
  const cyclesPeriod = (cycleIdsIn) => {
    const fmtDayShort = (d) => {
      if (!d || typeof d !== "string") return "";
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}` : d;
    };
    let minFirst = null, maxLast = null;
    for (const cid of cycleIdsIn) {
      const cd = cycleDetails.find((c) => c.id === cid);
      const first = cd?.firstDay || "";
      const last = cd?.lastDay || "";
      if (first && (!minFirst || first < minFirst)) minFirst = first;
      if (last && (!maxLast || last > maxLast)) maxLast = last;
    }
    const a = fmtDayShort(minFirst), b = fmtDayShort(maxLast);
    if (a && b && a !== b) return `${a} → ${b}`;
    return a || b || "—";
  };

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

  // Aplana filas y subtotales por faena en una sola lista, así el JSX hace un
  // .map() sin mirar la fila siguiente.
  const summaryDisplayRows = useMemo(() => {
    if (!activeSummary) return [];
    const rows = activeSummary.rows;
    const out = [];
    rows.forEach((r, i, arr) => {
      const prev = arr[i - 1];
      const showLabel = summaryShowLabor ? r.subfaenaName !== prev?.subfaenaName : r.faenaName !== prev?.faenaName;
      out.push({ row: r, showLabel });
      const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
      if (isLastOfFaena) {
        const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
        out.push({
          subtotal: {
            bank: faenaRows.reduce((s, x) => s + x.bank, 0),
            cash: faenaRows.reduce((s, x) => s + x.cash, 0),
            total: faenaRows.reduce((s, x) => s + x.total, 0),
          },
        });
      }
    });
    return out;
  }, [activeSummary, summaryShowLabor]);

  const resumenCaptureRef = useRef(null);
  const [resumenBusy, setResumenBusy] = useState("");
  const handlePrintResumen = () => {
    if (!activeSummary) return;
    try {
      printResumenTable(payroll, {
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
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(summaryShowLabor ? "Resumen por labor" : "Resumen por subfaena");
      ws.getColumn(1).width = 6; // restricción de layout: col A vacía

      const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7DEE8" } };
      const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
      const SUBTOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      const ADJ_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3FA" } };
      const PENDING_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E5" } };
      const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      const moneyFmt = '"$"#,##0';
      const labelCols = summaryShowLabor ? 4 : 3; // Faena, Subfaena, [Labor,] Período
      const totalCols = summaryShowLabor ? 7 : 6;

      let r = 2; // fila 1 vacía
      ws.getCell(r, 2).value = `Resumen ${summaryShowLabor ? "por labor" : "por subfaena"}`
        + (pendingMode === "with" ? " · incluye efectivo pendiente de nóminas anteriores" : "")
        + (pendingMode === "onlyPending" ? " · transferencias + solo el efectivo pendiente de antes" : "");
      ws.getCell(r, 2).font = { bold: true, size: 13 };
      r++;
      ws.getCell(r, 2).value = payroll.name;
      ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
      r += 2;

      const headers = summaryShowLabor
        ? ["Faena", "Subfaena", "Labor", "Período", "Transferencia", "Efectivo", "TOTAL"]
        : ["Faena", "Subfaena", "Período", "Transferencia", "Efectivo", "TOTAL"];
      headers.forEach((h, i) => {
        const c = ws.getCell(r, 2 + i);
        c.value = h;
        c.font = { bold: true };
        c.fill = HEADER_FILL;
        c.border = thinBorder;
      });
      r++;

      for (const entry of summaryDisplayRows) {
        if (entry.subtotal) {
          ws.getCell(r, 2).value = "Sub total por faena";
          ws.mergeCells(r, 2, r, 1 + labelCols);
          ws.getCell(r, 2 + labelCols).value = entry.subtotal.bank;
          ws.getCell(r, 3 + labelCols).value = entry.subtotal.cash;
          ws.getCell(r, 4 + labelCols).value = entry.subtotal.total;
          for (let c = 2; c <= 1 + totalCols; c++) {
            const cell = ws.getCell(r, c);
            if (c > 1 + labelCols) cell.numFmt = moneyFmt;
            cell.fill = SUBTOTAL_FILL;
            cell.font = { italic: true, bold: true };
            cell.border = thinBorder;
          }
          r++;
          continue;
        }
        const row = entry.row;
        let col = 2;
        ws.getCell(r, col++).value = entry.showLabel ? row.faenaName : "";
        if (summaryShowLabor) {
          ws.getCell(r, col++).value = entry.showLabel ? row.subfaenaName : "";
          ws.getCell(r, col++).value = row.laborName;
        } else {
          ws.getCell(r, col++).value = row.subfaenaName;
        }
        ws.getCell(r, col++).value = cyclesPeriod([...row.cycleIds]);
        ws.getCell(r, col).value = row.bank; ws.getCell(r, col++).numFmt = moneyFmt;
        ws.getCell(r, col).value = row.cash; ws.getCell(r, col++).numFmt = moneyFmt;
        ws.getCell(r, col).value = row.total; ws.getCell(r, col++).numFmt = moneyFmt;
        for (let c = 2; c <= 1 + totalCols; c++) ws.getCell(r, c).border = thinBorder;
        r++;
      }

      // Efectivo adeudado de nóminas anteriores: una fila por nómina, con el
      // monto neto. Va en el cuerpo, antes de los ajustes de esta nómina.
      if (pendingMode !== "none") {
        for (const pr of pendingSummaryRows) {
          const label = `💵 Efectivo pendiente — ${pr.name} · ${pr.count} pers.`;
          ws.getCell(r, 2).value = label;
          ws.mergeCells(r, 2, r, labelCols); // deja libre la columna de Período
          ws.getCell(r, 1 + labelCols).value = pr.period
            ? `${fmtDayShortEs(pr.period.first)} → ${fmtDayShortEs(pr.period.last)}`
            : "—";
          ws.getCell(r, 2 + labelCols).value = 0;
          ws.getCell(r, 3 + labelCols).value = pr.cash;
          ws.getCell(r, 4 + labelCols).value = pr.total;
          for (let c = 2; c <= 1 + totalCols; c++) {
            const cell = ws.getCell(r, c);
            if (c > 1 + labelCols) cell.numFmt = moneyFmt;
            cell.fill = PENDING_FILL;
            cell.border = thinBorder;
          }
          r++;
        }
      }

      const writeAdjRow = (label, values) => {
        ws.getCell(r, 2).value = label;
        ws.mergeCells(r, 2, r, 1 + labelCols);
        ws.getCell(r, 2 + labelCols).value = values.bank;
        ws.getCell(r, 3 + labelCols).value = values.cash;
        ws.getCell(r, 4 + labelCols).value = values.total;
        for (let c = 2; c <= 1 + totalCols; c++) {
          const cell = ws.getCell(r, c);
          if (c > 1 + labelCols) cell.numFmt = moneyFmt;
          cell.fill = ADJ_FILL;
          cell.border = thinBorder;
        }
        r++;
      };
      if (bonusAdvanceSummary.bonus.total > 0) writeAdjRow("Bonos", bonusAdvanceSummary.bonus);
      if (bonusAdvanceSummary.advance.total > 0) {
        writeAdjRow("Anticipos", {
          bank: -bonusAdvanceSummary.advance.bank,
          cash: -bonusAdvanceSummary.advance.cash,
          total: -bonusAdvanceSummary.advance.total,
        });
      }
      if (deferredCash > 0) {
        writeAdjRow("Efectivo que queda pendiente", { bank: 0, cash: -deferredCash, total: -deferredCash });
      }
      const at = grandTotals;
      ws.getCell(r, 2).value = pendingMode === "onlyPending" ? "TOTAL A PAGAR" : "TOTAL";
      ws.mergeCells(r, 2, r, 1 + labelCols);
      ws.getCell(r, 2 + labelCols).value = at.bank;
      ws.getCell(r, 3 + labelCols).value = at.cash;
      ws.getCell(r, 4 + labelCols).value = at.total;
      for (let c = 2; c <= 1 + totalCols; c++) {
        const cell = ws.getCell(r, c);
        if (c > 1 + labelCols) cell.numFmt = moneyFmt;
        cell.fill = TOTAL_FILL;
        cell.font = { bold: true };
        cell.border = thinBorder;
      }

      ws.getColumn(2).width = 20; // Faena
      ws.getColumn(3).width = 20; // Subfaena
      if (summaryShowLabor) {
        ws.getColumn(4).width = 22; // Labor
        ws.getColumn(5).width = 14; // Período
      } else {
        ws.getColumn(4).width = 14; // Período
      }
      ws.getColumn(2 + labelCols).width = 14; // Transferencia
      ws.getColumn(3 + labelCols).width = 16; // Efectivo
      ws.getColumn(4 + labelCols).width = 16; // TOTAL

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resumen_${summaryShowLabor ? "por_labor" : "por_subfaena"}_${payroll.name}`.replace(/[/\s]+/g, "_") + ".xlsx";
      a.click();
      URL.revokeObjectURL(url);
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
  const removalSummary = (() => {
    let cyclesOut = 0;
    let laborsOut = 0;
    let amount = 0;
    let unknown = false;
    const lines = [];
    for (const c of cycleBreakdown) {
      const r = activeRemoval.get(c.id);
      if (!r) continue;
      if (r === true) {
        cyclesOut += 1;
        amount += c.amount;
        lines.push(`${c.label} (ciclo entero)`);
        continue;
      }
      const labs = c.labors.filter((l) => r.has(l.id));
      laborsOut += labs.length;
      for (const l of labs) {
        if (l.amount == null) unknown = true;
        else amount += l.amount;
      }
      lines.push(`${c.label}: ${labs.map((l) => l.name).join(", ")}`);
    }
    const allOut = cycleBreakdown.length > 0 && cycleBreakdown.every((c) => activeRemoval.get(c.id) === true);
    return { cyclesOut, laborsOut, amount, unknown, lines, allOut };
  })();
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
function resumenAgregado(inicio, added = []) {
  const partes = [inicio];
  const nuevos = added.filter((x) => x.isNew).length;
  const suman = added.length - nuevos;
  if (nuevos) partes.push(`${nuevos} trabajador(es) nuevo(s).`);
  if (suman) partes.push(`${suman} ya estaba(n) y suma(n) producción.`);
  const anticipos = added.reduce((s, x) => s + (x.anticipos || 0), 0);
  const bonos = added.reduce((s, x) => s + (x.bonos || 0), 0);
  if (anticipos > 0) partes.push(`Se descuentan ${fmtCurrency(anticipos)} de anticipos pendientes.`);
  if (bonos > 0) partes.push(`Se suman ${fmtCurrency(bonos)} de bonos pendientes.`);
  return partes.join(" ");
}

// Selector para agregar ciclos o labores a una nómina pendiente. Agrupa por
// faena y muestra solo ciclos abiertos. Al marcar un ciclo se eligen sus
// labores, igual que al generar. Un ciclo que ya está en la nómina con algunas
// labores aparece con las que le faltan; uno que está entero no aparece.
//
// Se monta solo mientras está abierto, así cada apertura arranca con el estado
// limpio.
function AddCyclesModal({ onClose, cycles, faenas, subfaenas, payrollCycleDetails = [], payrollCycleIds = [], onConfirm, busy }) {
  // cycleId → labores elegidas. Un ciclo marcado puede quedar sin labores, y
  // ese no se agrega.
  const [selected, setSelected] = useState(() => new Map());
  const [query, setQuery] = useState("");

  const subfaenaNameById = useMemo(() => {
    const m = new Map();
    for (const s of subfaenas) m.set(s.id, s.name);
    return m;
  }, [subfaenas]);
  const subfaenaName = (id) => subfaenaNameById.get(id) || "";

  // Por ciclo abierto, las labores que todavía se le pueden sumar a la nómina.
  const groups = useMemo(() => {
    const detalles = new Map(payrollCycleDetails.map((cd) => [cd.id, cd]));
    // Un ciclo en `cycleIds` sin detalle en `cycleDetails` está entero.
    const enteros = new Set(payrollCycleIds.filter((id) => !detalles.has(id)));
    const byFaena = new Map();
    for (const f of faenas) byFaena.set(f.id, { faena: f, entries: [] });
    for (const c of cycles) {
      if (c.status === "closed" || enteros.has(c.id)) continue;
      const enNomina = detalles.get(c.id);
      if (enNomina && !Array.isArray(enNomina.laborIds)) continue;
      const yaTiene = new Set(enNomina?.laborIds || []);
      const labors = (c.labors || []).filter((l) => !yaTiene.has(l.id));
      if (labors.length === 0) continue;
      byFaena.get(c.faenaId)?.entries.push({ cycle: c, labors, partial: !!enNomina });
    }
    return [...byFaena.values()].filter((g) => g.entries.length > 0);
  }, [cycles, faenas, payrollCycleDetails, payrollCycleIds]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter(({ cycle: c }) =>
          (c.label || "").toLowerCase().includes(q) ||
          (g.faena.name || "").toLowerCase().includes(q) ||
          (subfaenaNameById.get(c.subfaenaId) || "").toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [groups, query, subfaenaNameById]);

  const toggleCycle = (entry) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(entry.cycle.id)) next.delete(entry.cycle.id);
    else next.set(entry.cycle.id, new Set(entry.labors.map((l) => l.id)));
    return next;
  });
  const toggleLabor = (cycleId, laborId) => setSelected((prev) => {
    const next = new Map(prev);
    const set = new Set(next.get(cycleId) || []);
    if (set.has(laborId)) set.delete(laborId);
    else set.add(laborId);
    next.set(cycleId, set);
    return next;
  });
  const seleccion = [...selected.entries()]
    .filter(([, set]) => set.size > 0)
    .map(([cycleId, set]) => ({ cycleId, laborIds: [...set] }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar ciclos o labores a la nómina"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(seleccion)}
            disabled={seleccion.length === 0 || busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Agregando..." : `Agregar (${seleccion.length})`}
          </button>
        </>
      }
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Buscar faena, subfaena o ciclo..."
        className="mb-3 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      {filteredGroups.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">
          No hay ciclos abiertos ni labores para agregar (los cerrados no se muestran acá; lo demás ya está en esta nómina).
        </div>
      ) : (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {filteredGroups.map((g) => (
            <div key={g.faena.id}>
              <div className="mb-1 text-xs font-semibold text-[var(--color-muted)]">{g.faena.name}</div>
              <div className="space-y-1">
                {g.entries.map((entry) => {
                  const { cycle: c, labors, partial } = entry;
                  const elegidas = selected.get(c.id);
                  const marcado = !!elegidas;
                  return (
                    <div
                      key={c.id}
                      className={`overflow-hidden rounded-md border border-[var(--color-border)] ${
                        marcado ? "bg-[var(--color-accent-soft)]/40" : "bg-[var(--color-surface-2)]"
                      }`}
                    >
                      <label className="flex min-h-[36px] cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggleCycle(entry)}
                          className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            <span className="font-medium">{c.label || c.id}</span>
                            {c.subfaenaId && (
                              <span className="ml-2 text-xs text-[var(--color-muted)]">{subfaenaName(c.subfaenaId)}</span>
                            )}
                          </span>
                          {partial && (
                            <span className="block text-[11px] text-[var(--color-muted)]">
                              Ya está en la nómina; {labors.length === 1 ? `falta ${labors[0].name}` : `faltan ${labors.length} labores`}
                            </span>
                          )}
                          {marcado && elegidas.size === 0 && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                              ⚠ Sin labores seleccionadas: no se agrega
                            </span>
                          )}
                        </span>
                      </label>
                      {marcado && labors.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] px-2.5 py-2">
                          {labors.map((l) => {
                            const on = elegidas.has(l.id);
                            return (
                              <button
                                type="button"
                                key={l.id}
                                onClick={() => toggleLabor(c.id, l.id)}
                                className={`min-h-[32px] rounded-full border px-2.5 py-1 text-[11px] ${
                                  on
                                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                                    : "border-dashed border-[var(--color-border)] bg-transparent text-[var(--color-muted)] opacity-60"
                                }`}
                                title={on ? "Dejar esta labor afuera" : "Incluir esta labor"}
                              >
                                {on ? "✓" : "○"} {l.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Dígitos (y la K) de un RUT, para buscar sin puntos ni guion.
function rutDigits(s) {
  return String(s || "").replace(/[^0-9kK]/g, "").toLowerCase();
}

// Agregar a una persona puntual: se la busca, se cargan sus días de los
// ciclos abiertos —de cualquier faena, estén o no en la nómina— y se elige
// cuáles se le suman. Los días que ya están en una nómina se muestran sin
// casilla, para ver el cuadro completo de la persona.
//
// Sirve en los dos momentos:
//   - En una nómina pendiente (`payroll`): la cuenta es la misma que al
//     agregar ciclos (`planAddWorkdays`), y el pie muestra antes de confirmar
//     cuánto suma y qué anticipos se le descuentan.
//   - Al generar (sin `payroll`): se eligen los días de una persona suelta.
//     Los que ya entran por los ciclos elegidos (`chosen`) se ven incluidos y
//     sin casilla. Los anticipos se reparten en la vista previa, junto con lo
//     que la persona traiga de los ciclos, así que el pie muestra solo lo
//     elegido. `previous` tiene lo que ya se le eligió a cada persona, para
//     poder corregirlo, e `initialWorker` abre el modal directo en una.
//
// Se monta solo mientras está abierto, igual que `AddCyclesModal`.
function AddWorkerDaysModal({
  onClose,
  payroll = null,
  items = [],
  workers,
  cycles,
  allPayrolls = [],
  profileFor,
  chosen = null,
  previous = null,
  initialWorker = null,
  onConfirm,
  busy,
}) {
  const { catalogs } = useCatalogs();
  const generando = !payroll;
  const payrollId = payroll?.id ?? null;
  const [query, setQuery] = useState("");
  const [worker, setWorker] = useState(initialWorker);
  const [data, setData] = useState(null); // { workdays, advances }
  const [loading, setLoading] = useState(!!initialWorker);
  const [error, setError] = useState("");
  // Claves de las filas elegidas.
  const [selected, setSelected] = useState(() => new Set((initialWorker && previous?.get(initialWorker.id)) || []));
  // Si se elige otra persona antes de que termine la carga de la anterior,
  // esa respuesta se descarta.
  const pedido = useRef(0);

  const clavesEnNomina = useMemo(() => {
    const out = new Set();
    for (const it of items) {
      if (it.workerId) out.add(it.workerId);
      if (it.rut) out.add(it.rut);
    }
    return out;
  }, [items]);
  // Ya en la nómina, o, al generar, ya agregada como persona suelta.
  const yaEsta = (w) => (generando ? !!previous?.has(w.id) : workerKeys(w).some((k) => clavesEnNomina.has(k)));

  const resultados = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const qRut = /\d/.test(q) ? rutDigits(q) : "";
    return workers
      .filter((w) => matchesSearchQuery(w.name || "", q) || (qRut.length >= 2 && rutDigits(w.rut || w.id).includes(qRut)))
      .slice(0, 30);
  }, [workers, query]);

  const cargar = async (w, id) => {
    try {
      const claves = workerKeys(w);
      // Al generar, los anticipos se reparten en la vista previa: acá no se
      // necesitan.
      const [workdays, advances] = await Promise.all([
        workdaysService.list({ wheres: [["workerRut", "in", claves]] }),
        generando ? [] : listPendingForWorkers(claves),
      ]);
      if (pedido.current === id) setData({ workdays, advances });
    } catch (err) {
      if (pedido.current === id) setError(err?.message || String(err));
    } finally {
      if (pedido.current === id) setLoading(false);
    }
  };
  const elegir = (w) => {
    const id = ++pedido.current;
    setWorker(w);
    setData(null);
    setSelected(new Set(previous?.get(w.id) || []));
    setError("");
    setLoading(true);
    cargar(w, id);
  };
  // Abierto directo en una persona: sus días se cargan al montar.
  useEffect(() => {
    if (initialWorker) cargar(initialWorker, ++pedido.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const otraPersona = () => {
    pedido.current += 1;
    setWorker(null);
    setData(null);
    setSelected(new Set());
    setError("");
    setLoading(false);
  };

  const laborById = useMemo(() => new Map(cycles.flatMap((c) => (c.labors || []).map((l) => [l.id, l]))), [cycles]);
  const laborTypeById = useMemo(() => new Map([...laborById].map(([id, l]) => [id, l.type])), [laborById]);
  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  const payrollNameById = useMemo(() => new Map(allPayrolls.map((p) => [p.id, p.name || p.id])), [allPayrolls]);
  // Los ciclos que ya están en la nómina o, al generar, los elegidos con
  // alguna labor.
  const ciclosDeLaNomina = useMemo(() => {
    if (!generando) return new Set([...(payroll.cycleDetails || []).map((c) => c.id), ...(payroll.cycleIds || [])]);
    return new Set(
      [...(chosen || new Map())]
        .filter(([, laborIds]) => !Array.isArray(laborIds) || laborIds.length > 0)
        .map(([cycleId]) => cycleId),
    );
  }, [generando, payroll, chosen]);

  // Al generar, lo que ya entra por los ciclos y labores elegidos: se ve
  // incluido y no se puede elegir otra vez.
  const cubierta = (f) => generando && f.status === "pending" && inChosenCycles(f, chosen || new Map());
  const libre = (f) => f.status === "pending" && !cubierta(f);

  // Por ciclo abierto, sus filas. Solo abiertos, igual que al generar o al
  // agregar ciclos: uno cerrado ya se liquidó o está por liquidarse.
  const secciones = useMemo(() => {
    if (!data) return [];
    const abiertas = data.workdays.filter((wd) => {
      const c = cycleById.get(wd.cycleId);
      return c && c.status !== "closed";
    });
    const porCiclo = new Map();
    for (const fila of workerDayRows(abiertas, { laborTypeById, payrollId })) {
      if (!porCiclo.has(fila.cycleId)) porCiclo.set(fila.cycleId, []);
      porCiclo.get(fila.cycleId).push(fila);
    }
    return [...porCiclo.entries()]
      .map(([cycleId, filas]) => ({ cycle: cycleById.get(cycleId), filas }))
      .sort((a, b) => (a.cycle.label || "").localeCompare(b.cycle.label || "", "es"));
  }, [data, cycleById, laborTypeById, payrollId]);

  const elegidas = secciones.flatMap((s) => s.filas).filter((f) => libre(f) && selected.has(f.key));
  const totalElegido = elegidas.reduce((s, f) => s + f.amount, 0);

  // Lo que pasaría al confirmar, con la misma cuenta que se va a guardar. Solo
  // en una nómina ya armada: al generar, el reparto sale en la vista previa.
  const preview = useMemo(() => {
    if (generando || !worker || !data) return null;
    const marcadas = secciones.flatMap((s) => s.filas).filter((f) => f.status === "pending" && selected.has(f.key));
    if (marcadas.length === 0) return null;
    const persona = asPayrollWorker({
      items,
      keys: workerKeys(worker),
      fallbackKey: worker.id,
      rut: worker.rut || worker.id,
      workdays: marcadas.flatMap((f) => f.workdays),
      advances: data.advances,
    });
    const plan = planAddWorkdays({
      items,
      workdays: persona.workdays,
      laborTypeById,
      pendingAdvances: persona.advances,
      profileFor: () => profileFor(worker),
    });
    return plan.added.find((x) => x.key === persona.key) || null;
  }, [generando, worker, data, secciones, selected, items, laborTypeById, profileFor]);
  const puedeConfirmar = generando ? elegidas.length > 0 : !!preview;

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleSeccion = (seccion) => setSelected((prev) => {
    const pendientes = seccion.filas.filter(libre).map((f) => f.key);
    const todas = pendientes.every((k) => prev.has(k));
    const next = new Set(prev);
    for (const k of pendientes) {
      if (todas) next.delete(k);
      else next.add(k);
    }
    return next;
  });

  // Producción de la fila, con el mismo formato que el detalle por trabajador.
  const prodDe = (fila, labor) => {
    const acc = { labor, kilos: 0, containers: new Set(), tratoQty: 0, tratoUnits: new Set(), jornadas: 0, overtimeHours: 0 };
    for (const wd of fila.workdays) {
      const qty = Number(wd.qty) || 0;
      if (labor?.type === "cosecha") {
        acc.kilos += qty;
        if (wd.containerY != null) acc.containers.add(Number(wd.containerY));
      } else if (labor?.type === "trato") {
        acc.tratoQty += getTratoTierTotals(wd).qty;
        if (labor.tratoUnit != null) acc.tratoUnits.add(Number(labor.tratoUnit));
      } else if (labor?.type === "tratoHE") {
        acc.jornadas += qty;
        acc.overtimeHours += Number(wd.overtimeHours) || 0;
      } else {
        acc.jornadas += 1;
      }
    }
    return formatWorkerDetailProd(acc, catalogs);
  };
  const diaDe = (d) => {
    const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return d || "—";
    const dia = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString("es-CL", { weekday: "short" })
      .replace(".", "");
    return `${dia} ${workerDetailDateLabel(d)}`;
  };
  const estadoDe = (fila) =>
    cubierta(fila)
      ? "entra con el ciclo elegido"
      : fila.status === "here"
        ? "en esta nómina"
        : `en ${payrollNameById.get(fila.payrollId) || "otra nómina"}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={generando ? "Agregar persona a la nómina nueva" : "Agregar persona a la nómina"}
      size="xl"
      footer={
        <>
          {worker && elegidas.length > 0 && (
            <div className="mr-auto min-w-0 text-xs">
              <div className="font-semibold tabular-nums">
                {elegidas.length} día{elegidas.length === 1 ? "" : "s"} · {fmtCurrency(totalElegido)}
              </div>
              {generando ? (
                totalElegido > 0 ? (
                  <div className="text-[var(--color-muted)]">Los anticipos y bonos se descuentan en la vista previa.</div>
                ) : (
                  <div className="text-amber-700 dark:text-amber-400">
                    Lo elegido suma $0: solo entra si tiene otra producción en la nómina.
                  </div>
                )
              ) : preview ? (
                <div className="tabular-nums text-[var(--color-muted)]">
                  {preview.isNew
                    ? "Entra a la nómina"
                    : `Bruto ${fmtCurrency(preview.oldGross)} → ${fmtCurrency(preview.newGross)}`}
                  {preview.anticipos > 0 && (
                    <> · <span style={{ color: "#b45309" }}>anticipos −{fmtCurrency(preview.anticipos)}</span></>
                  )}
                  {preview.bonos > 0 && <> · bonos +{fmtCurrency(preview.bonos)}</>}
                  {" · a pagar "}
                  {preview.isNew ? "" : `${fmtCurrency(preview.oldNet)} → `}
                  <span className="font-semibold text-[var(--color-text)]">{fmtCurrency(preview.newNet)}</span>
                </div>
              ) : (
                <div className="text-amber-700 dark:text-amber-400">
                  Lo elegido suma $0 y no está en la nómina: no hay nada que pagarle.
                </div>
              )}
            </div>
          )}
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() =>
              onConfirm({
                worker,
                workdayIds: elegidas.flatMap((f) => f.workdayIds),
                rowKeys: elegidas.map((f) => f.key),
                filas: elegidas.map((f) => ({ cycleId: f.cycleId, laborId: f.laborId, date: f.date, amount: f.amount })),
              })
            }
            disabled={!puedeConfirmar || busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy
              ? "Agregando..."
              : elegidas.length
                ? `Agregar ${elegidas.length} día${elegidas.length === 1 ? "" : "s"}`
                : "Agregar días"}
          </button>
        </>
      }
    >
      {!worker ? (
        <div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Buscar por nombre o RUT…"
            className="mb-3 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {query.trim().length < 2 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              Escribe al menos 2 letras del nombre o dígitos del RUT.
            </p>
          ) : resultados.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">Nadie coincide con la búsqueda.</p>
          ) : (
            <ul className="space-y-1">
              {resultados.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => elegir(w)}
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{w.name || "(sin nombre)"}</span>
                    {yaEsta(w) && (
                      <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] text-[var(--color-accent)]">
                        {generando ? "ya agregada" : "en esta nómina"}
                      </span>
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted)]">
                      {formatRutForDisplay(w.rut || w.id)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{worker.name || "(sin nombre)"}</div>
              <div className="text-xs tabular-nums text-[var(--color-muted)]">
                {formatRutForDisplay(worker.rut || worker.id)}
                {yaEsta(worker) ? (generando ? " · ya agregada" : " · ya está en esta nómina") : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={otraPersona}
              className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]"
            >
              ← Otra persona
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">
            {generando
              ? "Días de ciclos abiertos. Los que ya están en una nómina, o que ya entran con los ciclos elegidos, se muestran sin casilla."
              : "Días de ciclos abiertos. Los que ya están en una nómina se muestran sin casilla."}
          </p>
          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando días…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-[var(--color-danger)]">No se pudieron cargar los días: {error}</div>
          ) : secciones.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-muted)]">No tiene días en ciclos abiertos.</div>
          ) : (
            <div className="space-y-2">
              {secciones.map((sec) => {
                const c = sec.cycle;
                const libres = sec.filas.filter(libre);
                const cubiertas = sec.filas.filter(cubierta);
                const todas = libres.length > 0 && libres.every((f) => selected.has(f.key));
                const pendienteTotal = libres.reduce((s, f) => s + f.amount, 0);
                const enNomina = ciclosDeLaNomina.has(c.id);
                const detalle = [
                  generando
                    ? enNomina ? "Ciclo elegido" : "Ciclo sin elegir"
                    : enNomina ? "En esta nómina" : "Fuera de esta nómina",
                  libres.length > 0 &&
                    `${libres.length} pendiente${libres.length === 1 ? "" : "s"} · ${fmtCurrency(pendienteTotal)}`,
                  cubiertas.length > 0 && `${cubiertas.length} ya entra${cubiertas.length === 1 ? "" : "n"} con el ciclo`,
                  libres.length === 0 && cubiertas.length === 0 && "sin pendientes",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={c.id} className="overflow-hidden rounded-md border border-[var(--color-border)]">
                    <div className="flex flex-wrap items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.label || c.id}</div>
                        <div className="text-[11px] text-[var(--color-muted)]">{detalle}</div>
                      </div>
                      {libres.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleSeccion(sec)}
                          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs hover:bg-[var(--color-accent-soft)]"
                        >
                          {todas ? "Ninguno" : "Todos"}
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-[var(--color-border)]">
                      {sec.filas.map((f) => {
                        const labor = laborById.get(f.laborId);
                        const esLibre = libre(f);
                        return (
                          <li key={f.key}>
                            <label
                              className={`flex min-h-[40px] items-center gap-2 px-3 py-1.5 text-sm ${
                                esLibre ? "cursor-pointer hover:bg-[var(--color-accent-soft)]" : "opacity-60"
                              }`}
                            >
                              {esLibre ? (
                                <input
                                  type="checkbox"
                                  checked={selected.has(f.key)}
                                  onChange={() => toggle(f.key)}
                                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                                />
                              ) : (
                                <span className="w-4 shrink-0 text-center text-xs">
                                  {f.status === "here" || cubierta(f) ? "✓" : "—"}
                                </span>
                              )}
                              <span className="w-[74px] shrink-0 text-xs tabular-nums">{diaDe(f.date)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{labor?.name || "Labor"}</span>
                                <span className="block truncate text-[11px] text-[var(--color-muted)]">
                                  {esLibre ? prodDe(f, labor) : `${prodDe(f, labor)} · ${estadoDe(f)}`}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums">{fmtCurrency(f.amount)}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const formatProfileValue = (field, value) => {
  if (field === "bankCode") return bankName(value);
  if (field === "accountType") return accountTypeLabel(value);
  const s = String(value ?? "").trim();
  return s || "—";
};

// Modal de revisión del recálculo — muestra montos/trabajadores/datos que
// cambiaron desde que se generó la nómina, antes de escribir nada.
function RecalcModal({ preview, busy, onClose, onConfirm }) {
  if (!preview) return null;
  const { amountChanges, profileChanges, advanceChanges, newWorkers, leavingWorkers = [], removalLines = [], releasedCount = 0, cycleChanges = [] } = preview;
  const fmtRange = ([first, last]) =>
    first ? (last && last !== first ? `${fmtDayShortEs(first)} → ${fmtDayShortEs(last)}` : fmtDayShortEs(first)) : "sin período";
  const fmtCycleValue = (field, value) => (field === "period" ? fmtRange(value) : value || "—");
  return (
    <Modal
      open={!!preview}
      onClose={onClose}
      title={removalLines.length ? "Sacar de la nómina y recalcular" : "Recalcular nómina"}
      size="lg"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm disabled:opacity-60">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Aplicando..." : "Aplicar cambios"}
          </button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto text-sm">
        {removalLines.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Se saca de la nómina</h4>
            <ul className="space-y-0.5 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2.5 py-1.5 text-xs">
              {removalLines.map((line) => (
                <li key={line}>✕ {line}</li>
              ))}
            </ul>
            {releasedCount > 0 && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {releasedCount} jornada(s) vuelven a quedar pendientes para otra nómina.
              </p>
            )}
          </div>
        )}

        {leavingWorkers.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Salen de la nómina ({leavingWorkers.length})
            </h4>
            <p className="mb-1.5 text-xs text-[var(--color-muted)]">
              Se quedan sin producción en esta nómina. Sus anticipos vuelven a quedar pendientes para la próxima.
            </p>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Neto antes</th>
                    <th className="px-2 py-1.5 text-right">Anticipo que vuelve</th>
                  </tr>
                </thead>
                <tbody>
                  {leavingWorkers.map((w) => (
                    <tr key={w.key} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">{w.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(w.oldNet)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{w.liberado > 0 ? fmtCurrency(w.liberado) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {amountChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Montos actualizados ({amountChanges.length})
            </h4>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Bruto antes</th>
                    <th className="px-2 py-1.5 text-right">Bruto ahora</th>
                    <th className="px-2 py-1.5 text-right">Neto antes</th>
                    <th className="px-2 py-1.5 text-right">Neto ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {amountChanges.map((c) => (
                    <tr key={c.key} className="border-t border-[var(--color-border)] align-top">
                      <td className="px-2 py-1.5">
                        {c.name}
                        {c.devuelto > 0 && (
                          <div className="mt-0.5 text-[10px] text-[var(--color-warning)]">
                            ↩ {fmtCurrency(c.devuelto)} del anticipo ya no alcanzan a cubrirse y vuelven a quedar pendientes.
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(c.oldGross)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${c.newGross < c.oldGross ? "text-[var(--color-danger)]" : c.newGross > c.oldGross ? "text-[var(--color-success)]" : ""}`}>
                        {fmtCurrency(c.newGross)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(c.oldNet)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtCurrency(c.newNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {newWorkers.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Trabajadores nuevos ({newWorkers.length})
            </h4>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Bruto</th>
                    <th className="px-2 py-1.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {newWorkers.map((w) => (
                    <tr key={w.key} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">{w.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(w.gross)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtCurrency(w.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {advanceChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Anticipos/bonos nuevos aplicados ({advanceChanges.length})
            </h4>
            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-left">
                  <tr>
                    <th className="px-2 py-1.5">Trabajador</th>
                    <th className="px-2 py-1.5 text-right">Anticipo nuevo</th>
                    <th className="px-2 py-1.5 text-right">Bono nuevo</th>
                    <th className="px-2 py-1.5 text-right">Neto antes</th>
                    <th className="px-2 py-1.5 text-right">Neto ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {advanceChanges.map((c) => (
                    <tr key={c.key} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1.5">{c.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.addedAnticipoTotal > 0 ? `− ${fmtCurrency(c.addedAnticipoTotal)}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.addedBonoTotal > 0 ? `+ ${fmtCurrency(c.addedBonoTotal)}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(c.oldNet)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtCurrency(c.newNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {profileChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Datos actualizados ({profileChanges.length})
            </h4>
            <div className="space-y-1.5">
              {profileChanges.map((p) => (
                <div key={p.key} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{p.name}</div>
                  {p.fields.map((f) => (
                    <div key={f.field} className="text-[var(--color-muted)]">
                      {f.label}: {formatProfileValue(f.field, f.old)} → <span className="text-[var(--color-fg)]">{formatProfileValue(f.field, f.new)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {cycleChanges.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Ciclos actualizados ({cycleChanges.length})
            </h4>
            <p className="mb-1.5 text-xs text-[var(--color-muted)]">
              Los nombres vigentes del ciclo, la faena y la subfaena, y el período: del primer al último día que la nómina paga en cada ciclo.
            </p>
            <div className="space-y-1.5">
              {cycleChanges.map((c) => (
                <div key={c.cycleId} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium break-words">{c.label}</div>
                  {c.fields.map((f) => (
                    <div key={f.field} className="break-words text-[var(--color-muted)]">
                      {f.label}: {fmtCycleValue(f.field, f.old)} pasa a{" "}
                      <span className="font-medium text-[var(--color-text)]">{fmtCycleValue(f.field, f.new)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Modal de estimación de efectivo: cuántos billetes y monedas de cada
// denominación hacen falta, usando solo los que se marcan como disponibles
// (por defecto `DEFAULT_AVAILABLE`). Cada monto se arma con la menor cantidad
// de piezas y, si no calza justo, se redondea hacia arriba (ver
// `estimateCashBreakdown`). El resumen y la lista por trabajador se copian
// como texto o como imagen, y las dos dicen de qué nómina son y cuánto
// efectivo pendiente de otras incluyen.
function CashEstimationModal({ cashItems, payrollName, pendingExtra = [], onClose }) {
  const toast = useToast();
  // El efectivo pendiente de otras nóminas se entrega aparte, pero la plata se
  // saca del banco de una sola vez — así que el desglose de billetes y sencillo
  // tiene que poder cubrir todo junto. Cada persona pendiente lleva el nombre
  // de su nómina en `pendingFrom`.
  const extraItems = useMemo(
    () => pendingExtra.flatMap((x) => x.items.map((it) => ({ ...it, pendingFrom: x.name }))),
    [pendingExtra],
  );
  const extraTotal = useMemo(
    () => extraItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    [extraItems],
  );
  const ownTotal = useMemo(() => cashItems.reduce((s, it) => s + (Number(it.amount) || 0), 0), [cashItems]);
  const [includePending, setIncludePending] = useState(true);
  const usePending = includePending && extraItems.length > 0;
  const allItems = useMemo(
    () => (usePending ? [...cashItems, ...extraItems] : cashItems),
    [cashItems, extraItems, usePending],
  );
  const [available, setAvailable] = useState(() => new Set(DEFAULT_AVAILABLE));
  const toggleAvailable = (value) =>
    setAvailable((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  const est = useMemo(() => estimateCashBreakdown(allItems, [...available]), [allItems, available]);
  const denominations = [...est.counts.keys()];
  const [showDetail, setShowDetail] = useState(false);
  const [busy, setBusy] = useState("");
  const captureRef = useRef(null);
  const listRef = useRef(null);
  const diff = est.totalNeeded - est.totalOriginal;
  const totalPieces = [...est.counts.values()].reduce((s, v) => s + v, 0);

  // Las personas del desglose (`perWorker` va en el orden de `allItems`),
  // agrupadas: primero las de esta nómina por líder y después las de cada
  // nómina con efectivo pendiente.
  const workerGroups = useMemo(() => {
    const groups = new Map();
    est.perWorker.forEach((w, i) => {
      const from = allItems[i]?.pendingFrom || "";
      const key = from ? `pending:${from}` : `own:${w.leader || ""}`;
      if (!groups.has(key)) {
        groups.set(key, { key, label: from ? `Pendiente de ${from}` : w.leader || "Sin grupo", pending: !!from, rows: [] });
      }
      groups.get(key).rows.push(w);
    });
    const list = [...groups.values()];
    for (const g of list) g.rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
    return list.sort((a, b) => Number(a.pending) - Number(b.pending) || a.label.localeCompare(b.label, "es"));
  }, [est, allItems]);

  const pendingNote = usePending
    ? `Incluye ${fmtCurrency(extraTotal)} de efectivo pendiente de otras nóminas (${pendingExtra.map((x) => x.name).join(", ")}), que se entrega aparte.`
    : "";
  // "3 × $10.000 + 1 × $5.000", de mayor a menor.
  const piecesText = (breakdown) =>
    denominations.filter((d) => breakdown[d]).map((d) => `${breakdown[d]} × ${fmtCurrency(d)}`).join(" + ");

  // Desglose principal en texto plano, para pegar en un chat o una nota.
  // padStart alinea las cantidades en monospace.
  const buildSummaryText = () => {
    const lines = [];
    lines.push(`💵 Estimación de efectivo — ${payrollName}`);
    lines.push(`${allItems.length} trabajador(es) · Total: ${fmtCurrency(est.totalNeeded)}`);
    if (usePending) {
      lines.push(`Esta nómina: ${fmtCurrency(ownTotal)} · Pendiente de otras nóminas: ${fmtCurrency(extraTotal)}`);
      lines.push(pendingNote);
    }
    if (diff > 0) {
      lines.push(`(Original ${fmtCurrency(est.totalOriginal)} + redondeo ${fmtCurrency(diff)})`);
    }
    lines.push("");
    lines.push("Billetes y monedas:");
    for (const d of denominations) {
      const n = est.counts.get(d) || 0;
      if (n === 0) continue;
      const denomStr = fmtCurrency(d).padStart(9, " ");
      const qtyStr = String(n).padStart(4, " ");
      const subStr = fmtCurrency(n * d).padStart(11, " ");
      lines.push(`  ${denomStr} ${isBill(d) ? "billete" : " moneda"} × ${qtyStr} = ${subStr}`);
    }
    lines.push("");
    lines.push(`Total: ${totalPieces} billetes/monedas · ${fmtCurrency(est.totalNeeded)}`);
    return lines.join("\n");
  };

  // La lista por trabajador en texto plano: cuánto recibe cada uno y con qué
  // billetes y monedas, por grupo.
  const buildListText = () => {
    const lines = [`💵 Efectivo por trabajador — ${payrollName}`];
    if (usePending) lines.push(pendingNote);
    for (const g of workerGroups) {
      lines.push("", g.label);
      for (const w of g.rows) {
        const amount = w.delta > 0 ? `${fmtCurrency(w.rounded)} (de ${fmtCurrency(w.original)})` : fmtCurrency(w.rounded);
        lines.push(`  ${w.name}: ${amount} → ${piecesText(w.breakdown) || "sin efectivo"}`);
      }
    }
    lines.push("", `Total: ${est.perWorker.length} trabajador(es) · ${fmtCurrency(est.totalNeeded)}`);
    lines.push(`Billetes y monedas: ${piecesText(Object.fromEntries(est.counts))}`);
    return lines.join("\n");
  };

  const copyText = async (kind, text) => {
    setBusy(kind);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  // `prepare` corre antes de capturar (por ejemplo, desplegar la lista).
  const copyImage = async (kind, ref, prepare) => {
    setBusy(kind);
    try {
      if (prepare) await prepare();
      if (!ref.current) throw new Error("No se pudo generar la imagen");
      const blob = await captureFullWidthBlob(ref.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };
  // La lista se despliega antes de capturarla; dos cuadros dan tiempo a que
  // se pinte.
  const showListForCapture = async () => {
    if (showDetail) return;
    setShowDetail(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };

  const copyBtn = "rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50";
  const nothingAvailable = available.size === 0;

  return (
    <Modal open onClose={onClose} title="💵 Estimación de efectivo" size="lg">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-muted)]">
            Cada monto se arma con los billetes y monedas disponibles y, si no calza justo, se redondea hacia arriba.
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => copyText("text", buildSummaryText())}
              disabled={busy === "text" || nothingAvailable}
              className={copyBtn}
              title="Copiar el resumen como texto plano (para pegar en chat o notas)"
            >
              {busy === "text" ? "..." : "📋 Texto"}
            </button>
            <button
              onClick={() => copyImage("image", captureRef)}
              disabled={busy === "image" || nothingAvailable}
              className={copyBtn}
              title="Copiar el resumen como imagen al portapapeles"
            >
              {busy === "image" ? "..." : "📋 Imagen"}
            </button>
          </div>
        </div>
        {extraItems.length > 0 && (
          <label
            className="flex cursor-pointer items-start gap-2 rounded-md border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-soft)]/40 px-3 py-2 text-xs"
            title="Se entrega en sobres aparte, pero la plata se saca del banco de una sola vez."
          >
            <input
              type="checkbox"
              checked={includePending}
              onChange={(e) => setIncludePending(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span>
              <span className="font-medium">
                Incluir efectivo pendiente de nóminas anteriores ({fmtCurrency(extraTotal)})
              </span>
              <span className="mt-0.5 block text-[var(--color-muted)]">
                {extraItems.length} persona(s) en {pendingExtra.length} nómina(s):{" "}
                {pendingExtra.map((x) => x.name).join(" · ")}. Se entrega aparte, con su propio
                sobre — se suma acá solo para que el conteo de billetes y sencillo cuadre.
              </span>
            </span>
          </label>
        )}
        <div className="space-y-1.5 rounded-md border border-[var(--color-border)] px-3 py-2">
          <div className="text-xs font-semibold text-[var(--color-muted)]">Disponibles para pagar</div>
          {[["bill", "Billetes"], ["coin", "Monedas"]].map(([kind, label]) => (
            <div key={kind} className="flex flex-wrap items-center gap-1.5">
              <span className="w-full text-[11px] text-[var(--color-muted)] sm:w-16">{label}</span>
              {CASH_DENOMINATIONS.filter((d) => d.kind === kind).map(({ value }) => {
                const on = available.has(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAvailable(value)}
                    title={on ? "Disponible: click para no usarlo" : "No disponible: click para usarlo"}
                    className={`min-h-8 rounded-full border px-2.5 py-1 text-xs tabular-nums ${
                      on
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] font-medium text-[var(--color-accent-fg)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    {on ? "✓ " : ""}{fmtCurrency(value)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {nothingAvailable ? (
          <p className="rounded-md border border-dashed border-[var(--color-warning)] px-3 py-3 text-center text-xs text-[var(--color-warning)]">
            Marca al menos un billete o una moneda disponible.
          </p>
        ) : (
          <>
            {/* Lo que sale en la imagen del resumen. */}
            <div ref={captureRef} className="space-y-4 p-1" style={{ background: "var(--color-surface)" }}>
              <div>
                <div className="font-semibold">💵 Efectivo — {payrollName}</div>
                <div className="text-[11px] text-[var(--color-muted)]">{allItems.length} trabajador(es) en efectivo</div>
              </div>

              <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3">
                <div className="text-xs text-[var(--color-muted)]">Total efectivo a llevar</div>
                <div className="text-2xl font-bold tabular-nums text-[var(--color-accent)]">
                  {fmtCurrency(est.totalNeeded)}
                </div>
                {usePending && (
                  <div className="mt-1 text-[11px] tabular-nums">
                    Esta nómina: <b>{fmtCurrency(ownTotal)}</b> · Pendiente de otras nóminas: <b>{fmtCurrency(extraTotal)}</b>
                  </div>
                )}
                {diff > 0 && (
                  <div className="mt-1 text-[11px] text-[var(--color-muted)]">
                    Original: {fmtCurrency(est.totalOriginal)} · Redondeo hacia arriba: +{fmtCurrency(diff)}
                  </div>
                )}
              </div>

              {usePending && (
                <div className="rounded-md border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-[11px]">
                  <div className="font-semibold">Incluye efectivo pendiente de otras nóminas, que se entrega aparte:</div>
                  {pendingExtra.map((x) => (
                    <div key={x.payrollId} className="tabular-nums">
                      {x.name}: {fmtCurrency(x.amount)} · {x.items.length} persona(s)
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Billetes y monedas necesarios
                </h4>
                <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                      <tr>
                        <th className="px-3 py-1.5">Denominación</th>
                        <th className="px-3 py-1.5 text-right">Cantidad</th>
                        <th className="px-3 py-1.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {denominations.map((d) => {
                        const n = est.counts.get(d) || 0;
                        return (
                          <tr key={d} className="border-t border-[var(--color-border)]">
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{fmtCurrency(d)}</span>
                              <span className="ml-2 text-[10px] text-[var(--color-muted)]">
                                {isBill(d) ? "billete" : "moneda"}
                              </span>
                            </td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${n === 0 ? "text-[var(--color-muted)]" : "font-semibold"}`}>
                              {n}
                            </td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${n === 0 ? "text-[var(--color-muted)]" : ""}`}>
                              {fmtCurrency(n * d)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)]/60 font-semibold">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{totalPieces}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-accent)]">
                          {fmtCurrency(est.totalNeeded)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Lista por trabajador: plegable y con su propia copia, para que la
                imagen del resumen no se alargue con ella. */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowDetail((v) => !v)}
                  aria-expanded={showDetail}
                  className="flex items-center gap-2 text-left text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                >
                  <span>{showDetail ? "▾" : "▸"}</span>
                  <span>Por trabajador ({est.perWorker.length})</span>
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => copyText("listText", buildListText())}
                    disabled={busy === "listText"}
                    className={copyBtn}
                    title="Copiar la lista por trabajador, con sus billetes y monedas, como texto"
                  >
                    {busy === "listText" ? "..." : "📋 Lista"}
                  </button>
                  <button
                    onClick={() => copyImage("listImage", listRef, showListForCapture)}
                    disabled={busy === "listImage"}
                    className={copyBtn}
                    title="Copiar la lista por trabajador como imagen"
                  >
                    {busy === "listImage" ? "..." : "📋 Imagen de la lista"}
                  </button>
                </div>
              </div>
              {showDetail && (
                <div ref={listRef} className="mt-2 space-y-2 p-1" style={{ background: "var(--color-surface)" }}>
                  <div>
                    <div className="font-semibold">💵 Efectivo por trabajador — {payrollName}</div>
                    {usePending && <div className="text-[11px] text-[var(--color-warning)]">{pendingNote}</div>}
                  </div>
                  <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                        <tr>
                          <th className="px-2 py-1">Nombre</th>
                          <th className="px-2 py-1 text-right">Monto</th>
                          {denominations.map((d) => (
                            <th key={d} className="px-2 py-1 text-right">{fmtCurrency(d)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {workerGroups.map((g) => [
                          <tr key={g.key} className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/60">
                            <td
                              colSpan={2 + denominations.length}
                              className={`px-2 py-1 text-[11px] font-semibold ${g.pending ? "text-[var(--color-warning)]" : ""}`}
                            >
                              {g.label} · {g.rows.length}
                            </td>
                          </tr>,
                          ...g.rows.map((w, i) => (
                            <tr key={`${g.key}|${w.rut}|${i}`} className="border-t border-[var(--color-border)]">
                              <td className="px-2 py-1 font-medium">{w.name}</td>
                              <td className="px-2 py-1 text-right tabular-nums font-semibold">
                                {fmtCurrency(w.rounded)}
                                {w.delta > 0 && (
                                  <div className="text-[9px] font-normal text-[var(--color-muted)]">de {fmtCurrency(w.original)}</div>
                                )}
                              </td>
                              {denominations.map((d) => (
                                <td key={d} className="px-2 py-1 text-right tabular-nums">
                                  {w.breakdown[d] || ""}
                                </td>
                              ))}
                            </tr>
                          )),
                        ])}
                        <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)]/60 font-semibold">
                          <td className="px-2 py-1">Total · {est.perWorker.length}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtCurrency(est.totalNeeded)}</td>
                          {denominations.map((d) => (
                            <td key={d} className="px-2 py-1 text-right tabular-nums">
                              {est.counts.get(d) || ""}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// Fila expandible de banco o efectivo. Al expandirla muestra el detalle de la
// persona en la nómina: tablas por ciclo y tarjetas de bruto, anticipos, bonos
// y neto. "📅 Ver historial completo" abre el WorkerSummaryModal.
function WorkerDetailRow({
  rutOf = (r) => r, item, expanded, onToggle, onShowSummary, cycleDetails, displayCycleLabel,
  editMode, editBusy, onRemoveWorker, cols, snapshot, snapshotLoading, catalogs, isMobile,
  cashPaidMode = false, cashPaid = false, onToggleCashPaid,
}) {
  const isBank = cols === "bank";
  // Columnas base: 7 en banco, 4 en efectivo. Cada modo opcional suma una.
  const colSpan = (isBank ? 7 : 4) + (editMode ? 1 : 0) + (cashPaidMode ? 1 : 0);
  const cashPaidBtnTitle = cashPaid
    ? "Ya cobró su efectivo. Click para desmarcar."
    : "Marcar que esta persona ya cobró su efectivo (se descuenta de la deuda).";

  const expandedDetail = (
    <div className="space-y-3">
      {/* Encabezado con líder y email, y atajo al historial completo */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {item.groupLeader && (
            <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px]">
              👥 <b>{item.groupLeader}</b>
            </span>
          )}
          {item.email && (
            <span className="text-[10px] text-[var(--color-muted)]">✉ {item.email}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onShowSummary}
          className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
          title="Abrir el detalle completo del trabajador con todos sus ciclos"
        >
          📅 Ver historial completo
        </button>
      </div>

      {/* Detalle por ciclo, como en Trabajadores: una tabla por ciclo con
          encabezado faena · subfaena · ciclo y filas labor × día. */}
      <WorkerPaidDetailTables
        displayRut={rutOf(item.rut, item.workerId)}
        item={item}
        snapshot={snapshot}
        snapshotLoading={snapshotLoading}
        cycleDetails={cycleDetails}
        displayCycleLabel={displayCycleLabel}
        catalogs={catalogs}
      />

      <WorkerPaySummaryCards item={item} />
    </div>
  );

  if (isMobile) {
    return (
      <div>
        <div
          className="flex min-h-[44px] cursor-pointer items-center gap-2 px-3 py-2 active:bg-[var(--color-accent-soft)]"
          onClick={onToggle}
        >
          <span className="shrink-0 text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{item.name}</div>
            <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-[var(--color-muted)]">
              <span>{formatRutForDisplay(rutOf(item.rut, item.workerId))}</span>
              {isBank && (
                <span className="truncate">{bankName(item.bankCode)} · {item.accountNumber} · {accountTypeShort(item.accountType)}</span>
              )}
            </div>
          </div>
          <span className={`shrink-0 font-semibold tabular-nums ${cashPaid ? "text-[var(--color-muted)] line-through" : ""}`}>
            {fmtCurrency(item.amount)}
          </span>
          {cashPaidMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCashPaid?.(item.rut); }}
              title={cashPaidBtnTitle}
              className={`min-h-[32px] shrink-0 rounded border px-2 text-[11px] ${
                cashPaid
                  ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
              }`}
            >
              {cashPaid ? "✓ cobró" : "○ debe"}
            </button>
          )}
          {editMode && (
            <button
              type="button"
              disabled={editBusy}
              onClick={(e) => { e.stopPropagation(); onRemoveWorker(item); }}
              className="shrink-0 rounded border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2 py-1.5 text-[10px] text-[var(--color-danger)] hover:opacity-80 disabled:opacity-50"
              title="Sacar trabajador de la nómina"
            >
              ✕
            </button>
          )}
        </div>
        {expanded && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-3">
            {expandedDetail}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <tr
        className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"
        onClick={onToggle}
      >
        {isBank ? (
          <>
            <td className="px-2 py-1 text-center text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</td>
            <td className="px-2 py-1 font-mono text-xs">{formatRutForDisplay(rutOf(item.rut, item.workerId))}</td>
            <td className="px-2 py-1">{item.name}</td>
            <td className="px-2 py-1 text-xs">{bankName(item.bankCode)}</td>
            <td className="px-2 py-1 font-mono text-xs">{item.accountNumber}</td>
            <td className="px-2 py-1 text-xs">{accountTypeShort(item.accountType)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{fmtCurrency(item.amount)}</td>
          </>
        ) : (
          <>
            <td className="px-2 py-1 text-center text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</td>
            <td className="px-2 py-1 font-mono text-xs">{formatRutForDisplay(rutOf(item.rut, item.workerId))}</td>
            <td className="px-2 py-1">{item.name}</td>
            <td className="px-2 py-1 text-right tabular-nums">{fmtCurrency(item.amount)}</td>
          </>
        )}
        {cashPaidMode && (
          <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onToggleCashPaid?.(item.rut)}
              title={cashPaidBtnTitle}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                cashPaid
                  ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
              }`}
            >
              {cashPaid ? "✓ cobró" : "○ debe"}
            </button>
          </td>
        )}
        {editMode && (
          <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => onRemoveWorker(item)}
              className="rounded border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-danger)] hover:opacity-80 disabled:opacity-50"
              title="Sacar trabajador de la nómina"
            >
              ✕
            </button>
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40">
          <td colSpan={colSpan} className="px-3 py-3">
            {expandedDetail}
          </td>
        </tr>
      )}
    </>
  );
}

// Tarjetas bruto/anticipos/bonos/neto de un item de nómina — usado tanto en
// la fila expandible de PayrollDetailModal como en el modal enfocado que se
// abre desde el historial del trabajador (mismo contenido, dos entradas).
function WorkerPaySummaryCards({ item }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Bruto</div>
        <div className="font-bold tabular-nums">{fmtCurrency(item.grossAmount || item.amount || 0)}</div>
      </div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Anticipos</div>
        <div className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {Number(item.advance) > 0 ? `−${fmtCurrency(item.advance)}` : "—"}
        </div>
        {(item.anticipoApplications || []).length > 0 && (
          <div className="mt-0.5 text-[9px] text-[var(--color-muted)]">
            {(item.anticipoApplications || []).length} aplicación{(item.anticipoApplications || []).length === 1 ? "" : "es"}
          </div>
        )}
      </div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Bonos</div>
        <div className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {Number(item.bonus) > 0 ? `+${fmtCurrency(item.bonus)}` : "—"}
        </div>
        {(item.bonoApplications || []).length > 0 && (
          <div className="mt-0.5 text-[9px] text-[var(--color-muted)]">
            {(item.bonoApplications || []).length} aplicación{(item.bonoApplications || []).length === 1 ? "" : "es"}
          </div>
        )}
      </div>
      <div className="rounded border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-1.5">
        <div className="text-[9px] uppercase text-[var(--color-muted)]">Neto</div>
        <div className="font-bold tabular-nums text-[var(--color-accent)]">{fmtCurrency(item.amount || 0)}</div>
      </div>
    </div>
  );
}

// Detalle pagado en la nómina, con el formato del módulo Trabajadores. Vista
// "Por ciclo": una tabla por ciclo (faena · subfaena · ciclo de encabezado,
// filas labor × día); vista "Cronológico": una sola tabla por fecha con los
// ajustes intercalados. Sin snapshot, o sin jornadas de la persona en él,
// muestra solo los montos por ciclo.
function WorkerPaidDetailTables({ displayRut, item, snapshot, snapshotLoading, cycleDetails, displayCycleLabel, catalogs }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  // cronologico (default): una sola tabla ordenada por fecha, con los
  // anticipos y bonos intercalados en su fecha. porCiclo: una tabla por ciclo
  // con subtotales y un bloque final de ajustes.
  const [viewMode, setViewMode] = useState("cronologico");
  const captureRef = useRef(null);

  // Respaldo "Por ciclo": montos sin detalle día × labor.
  const byCycleEntries = Object.entries(item.byCycle || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([cid, amt]) => {
      const c = cycleDetails.find((x) => x.id === cid);
      return { id: cid, label: c ? displayCycleLabel(c) : cid, faena: c?.faenaName, subfaena: c?.subfaenaName, amount: Number(amt) };
    });

  if (snapshotLoading) {
    return <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-muted)]">Cargando detalle…</div>;
  }

  // Sin snapshot o sin jornadas de la persona: solo los montos por ciclo.
  const wds = snapshot ? (snapshot.workdays || []).filter((w) => w.workerRut === item.rut) : [];
  if (!snapshot || wds.length === 0) {
    if (byCycleEntries.length === 0) return null;
    return (
      <div>
        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Por ciclo</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {byCycleEntries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.label}</div>
                {(e.faena || e.subfaena) && (
                  <div className="truncate text-[10px] text-[var(--color-muted)]">
                    {e.faena}{e.subfaena ? ` / ${e.subfaena}` : ""}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{fmtCurrency(e.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Con snapshot: jornadas agrupadas por ciclo y luego por (labor, fecha).
  const cyclesById = new Map((snapshot.cycles || []).map((c) => [c.id, c]));
  const wdsByCycle = new Map();
  for (const wd of wds) {
    if (!wdsByCycle.has(wd.cycleId)) wdsByCycle.set(wd.cycleId, []);
    wdsByCycle.get(wd.cycleId).push(wd);
  }

  // Para cada ciclo, agrupar workdays por (laborId, date) y producir una
  // fila con qty + amount. Lo que se muestra en la columna "Producción"
  // depende del tipo de labor (cosecha → kg/unidad, trato → unidad del
  // catálogo, etc.).
  const cycleSections = [...wdsByCycle.entries()].map(([cycleId, list]) => {
    const cycle = cyclesById.get(cycleId);
    const detail = cycleDetails.find((c) => c.id === cycleId);
    const laborsById = new Map((cycle?.labors || []).map((l) => [l.id, l]));
    const groups = new Map();
    for (const wd of list) {
      const key = `${wd.laborId}__${wd.date}`;
      if (!groups.has(key)) {
        groups.set(key, {
          laborId: wd.laborId,
          labor: laborsById.get(wd.laborId),
          date: wd.date || "",
          kilos: 0,
          jornadas: 0,
          tratoQty: 0,
          tratoUnits: new Set(), // unidades de catálogo recolectadas de los tiers
          overtimeHours: 0,
          amount: 0,
          containers: new Set(),
        });
      }
      const g = groups.get(key);
      const labor = g.labor;
      const wdAmount = Number(wd.amount) || 0;
      const wdQty = Number(wd.qty) || 0;
      g.amount += wdAmount;
      if (labor?.type === "cosecha") {
        g.kilos += wdQty;
        if (wd.containerY != null) g.containers.add(Number(wd.containerY));
      } else if (labor?.type === "trato") {
        // En trato, la unidad del catálogo (Planta, Metro…) no está en
        // wd.tiers sino por día en cycle.dayPrices, que el snapshot siempre
        // trae: se resuelve con getTratoTiers para ese (labor, fecha), de
        // índice a unidad.
        const dayTiers = getTratoTiers(cycle?.dayPrices || {}, wd.laborId, wd.date);
        const unitByIdx = new Map();
        for (const t of dayTiers) {
          if (t.unit != null) unitByIdx.set(t.index, Number(t.unit));
        }
        if (wd.tiers && typeof wd.tiers === "object") {
          for (const k in wd.tiers) {
            const t = wd.tiers[k];
            g.tratoQty += Number(t?.qty) || 0;
            // Clave del tier ("t0", "t1"…) → índice numérico, para buscar la unidad.
            const raw = String(k);
            const idx = raw.startsWith("t") ? Number(raw.slice(1)) : Number(raw);
            if (Number.isFinite(idx) && unitByIdx.has(idx)) {
              g.tratoUnits.add(unitByIdx.get(idx));
            } else if (t?.unit != null) {
              // Si no, la unidad que traiga el propio tier.
              g.tratoUnits.add(Number(t.unit));
            }
          }
        } else {
          g.tratoQty += wdQty;
          // Jornada sin tiers: la unidad del primer tier del día que la tenga.
          if (unitByIdx.size > 0) {
            g.tratoUnits.add([...unitByIdx.values()][0]);
          }
        }
        // Último recurso: labor.tratoUnit, si el snapshot lo trae.
        if (g.tratoUnits.size === 0 && labor?.tratoUnit != null) {
          g.tratoUnits.add(Number(labor.tratoUnit));
        }
      } else if (labor?.type === "tratoHE") {
        g.jornadas += wdQty;
        g.overtimeHours += Number(wd.overtimeHours) || 0;
      } else {
        // main / supervision / extra: 1 jornada por wd
        g.jornadas += 1;
      }
    }
    const rows = [...groups.values()].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.labor?.name || "").localeCompare(b.labor?.name || "", "es");
    });
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const header = [detail?.faenaName, detail?.subfaenaName, cycle?.label || cycleId]
      .filter(Boolean)
      .join(" · ");
    return { cycleId, header, rows, totalAmount };
  })
  .sort((a, b) => a.header.localeCompare(b.header, "es"));

  if (cycleSections.length === 0) return null;

  const totalAllCycles = cycleSections.reduce((s, sec) => s + sec.totalAmount, 0);

  // Anticipos y bonos aplicados en esta nómina, con la fecha sacada de
  // snapshot.advances. Sin fecha, el ajuste va al final en la vista
  // cronológica.
  const advancesById = new Map((snapshot?.advances || []).map((a) => [a.id, a]));
  const anticipoRows = (item.anticipoApplications || [])
    .map((app) => {
      const adv = advancesById.get(app.advanceId);
      return {
        kind: "anticipo",
        date: adv?.date || "",
        amount: Number(app.amount) || 0,
        note: adv?.note || "",
        typeMeta: advanceTypeMeta(adv?.type || "anticipo"),
      };
    })
    .filter((r) => r.amount > 0);
  const bonoRows = (item.bonoApplications || [])
    .map((app) => {
      const adv = advancesById.get(app.advanceId);
      return {
        kind: "bono",
        date: adv?.date || "",
        amount: Number(app.amount) || 0,
        note: adv?.note || "",
        typeMeta: advanceTypeMeta(adv?.type || "bono"),
      };
    })
    .filter((r) => r.amount > 0);

  // Vista cronológica: jornadas y ajustes en una sola tabla ordenada por
  // fecha; los ajustes sin fecha quedan al final.
  const KIND_ORDER = { work: 0, anticipo: 1, bono: 2 };
  const chronoRows = [];
  for (const sec of cycleSections) {
    for (const r of sec.rows) {
      chronoRows.push({ kind: "work", date: r.date, cycleHeader: sec.header, row: r });
    }
  }
  for (const a of anticipoRows) chronoRows.push(a);
  for (const b of bonoRows) chronoRows.push(b);
  chronoRows.sort((a, b) => {
    const da = a.date || "9999-12-31";
    const db = b.date || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  });

  // Resumen para incluir en la imagen — item ya trae los totales calculados.
  const bruto = Number(item.grossAmount || item.amount || 0);
  const anticiposTotal = Number(item.advance) || 0;
  const bonosTotal = Number(item.bonus) || 0;
  const neto = Number(item.amount) || 0;

  // Texto plano — cambia según viewMode.
  const buildPlainText = () => {
    const lines = [];
    lines.push(`📅 ${item.name} (${formatRutForDisplay(displayRut || item.rut)})`);
    lines.push(`Bruto: ${fmtCurrency(bruto)} · Anticipos: -${fmtCurrency(anticiposTotal)} · Bonos: +${fmtCurrency(bonosTotal)} · Neto: ${fmtCurrency(neto)}`);
    lines.push("");
    if (viewMode === "cronologico") {
      lines.push("Fecha   | Detalle                    | Contexto                       | Monto");
      for (const r of chronoRows) {
        const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
        if (r.kind === "work") {
          const det = laborDisplayLabel(r.row.labor, catalogs);
          const prod = formatWorkerDetailProd(r.row, catalogs);
          const monto = fmtCurrency(r.row.amount);
          lines.push(
            `${fecha.padEnd(7, " ")} | ${det.padEnd(27, " ").slice(0, 27)} | ${(r.cycleHeader || "").padEnd(30, " ").slice(0, 30)} | ${monto}`,
          );
        } else {
          const label = r.kind === "anticipo" ? `${r.typeMeta.icon} ${r.typeMeta.label}` : `${r.typeMeta.icon} ${r.typeMeta.label}`;
          const sign = r.kind === "anticipo" ? "-" : "+";
          lines.push(
            `${fecha.padEnd(7, " ")} | ${label.padEnd(27, " ").slice(0, 27)} | ${(r.note || "").padEnd(30, " ").slice(0, 30)} | ${sign}${fmtCurrency(r.amount)}`,
          );
        }
      }
    } else {
      for (const sec of cycleSections) {
        lines.push(sec.header);
        lines.push("─".repeat(Math.min(sec.header.length, 60)));
        lines.push("Detalle Jornada          | Fecha   | Producción            | Monto");
        for (const r of sec.rows) {
          const det = laborDisplayLabel(r.labor, catalogs);
          const fecha = workerDetailDateLabel(r.date);
          const prod = formatWorkerDetailProd(r, catalogs);
          const monto = fmtCurrency(r.amount);
          lines.push(
            `${det.padEnd(24, " ").slice(0, 24)} | ${fecha.padEnd(7, " ")} | ${prod.padEnd(21, " ").slice(0, 21)} | ${monto}`,
          );
        }
        lines.push(`Subtotal ciclo: ${fmtCurrency(sec.totalAmount)}`);
        lines.push("");
      }
      if (anticipoRows.length > 0 || bonoRows.length > 0) {
        lines.push("Ajustes aplicados:");
        for (const r of anticipoRows) {
          const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
          lines.push(`  ${r.typeMeta.icon} ${r.typeMeta.label.padEnd(10, " ")} ${fecha.padEnd(7, " ")} ${(r.note || "").padEnd(25, " ").slice(0, 25)} -${fmtCurrency(r.amount)}`);
        }
        for (const r of bonoRows) {
          const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
          lines.push(`  ${r.typeMeta.icon} ${r.typeMeta.label.padEnd(10, " ")} ${fecha.padEnd(7, " ")} ${(r.note || "").padEnd(25, " ").slice(0, 25)} +${fmtCurrency(r.amount)}`);
        }
        lines.push("");
      }
    }
    lines.push(`NETO A PAGAR: ${fmtCurrency(neto)}`);
    return lines.join("\n");
  };

  const handleCopyText = async () => {
    setBusy("text");
    try {
      await navigator.clipboard.writeText(buildPlainText());
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  const handleCopyImage = async () => {
    if (!captureRef.current) return;
    setBusy("image");
    try {
      const blob = await captureFullWidthBlob(captureRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  const tabBtn = (active) =>
    `rounded-md border px-2 py-0.5 text-[10px] ${
      active
        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
        : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mr-1">Vista:</span>
          <button type="button" onClick={() => setViewMode("porCiclo")} className={tabBtn(viewMode === "porCiclo")}>
            Por ciclo
          </button>
          <button type="button" onClick={() => setViewMode("cronologico")} className={tabBtn(viewMode === "cronologico")}>
            Cronológico
          </button>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleCopyText}
            disabled={busy === "text"}
            title="Copiar como texto plano"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "text" ? "..." : "📋 Texto"}
          </button>
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={busy === "image"}
            title="Copiar como imagen (PNG)"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "image" ? "..." : "📋 Imagen"}
          </button>
        </div>
      </div>
      <div ref={captureRef} style={{ background: "#fff", padding: 8 }} className="space-y-2 rounded-md">
        {/* Encabezado del trabajador */}
        <div style={{ fontSize: 11, color: "#444", borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
          <b style={{ color: "#000" }}>{item.name}</b>
          <span style={{ marginLeft: 6, fontFamily: "ui-monospace, monospace" }}>{formatRutForDisplay(displayRut || item.rut)}</span>
          <span style={{ marginLeft: 8, color: "#666" }}>Producción: <b style={{ color: "#000" }}>{fmtCurrency(totalAllCycles)}</b></span>
        </div>

        {/* Resumen de pago dentro de la imagen: bruto, anticipos, bonos, neto */}
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#f8cbad" }}>
              <th style={WORKER_DETAIL_CELL_H}>Bruto</th>
              <th style={WORKER_DETAIL_CELL_H}>Anticipos</th>
              <th style={WORKER_DETAIL_CELL_H}>Bonos</th>
              <th style={{ ...WORKER_DETAIL_CELL_H, background: "#c6efce" }}>Neto a pagar</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...WORKER_DETAIL_CELL, fontWeight: 600 }}>{fmtCurrency(bruto)}</td>
              <td style={{ ...WORKER_DETAIL_CELL, color: anticiposTotal > 0 ? "#b45309" : "#999" }}>
                {anticiposTotal > 0 ? `− ${fmtCurrency(anticiposTotal)}` : "—"}
              </td>
              <td style={{ ...WORKER_DETAIL_CELL, color: bonosTotal > 0 ? "#166534" : "#999" }}>
                {bonosTotal > 0 ? `+ ${fmtCurrency(bonosTotal)}` : "—"}
              </td>
              <td style={{ ...WORKER_DETAIL_CELL, background: "#c6efce", fontWeight: 700 }}>{fmtCurrency(neto)}</td>
            </tr>
          </tbody>
        </table>

        {viewMode === "cronologico" ? (
          <div className="overflow-x-auto">
            <div style={{ fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 4 }}>Detalle cronológico</div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#9dc3e6" }}>
                  <th style={WORKER_DETAIL_CELL_H}>Fecha</th>
                  <th style={WORKER_DETAIL_CELL_H}>Detalle</th>
                  <th style={WORKER_DETAIL_CELL_H}>Contexto</th>
                  <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Producción</th>
                  <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {chronoRows.map((r, i) => {
                  const fecha = r.date ? workerDetailDateLabel(r.date) : "s/f";
                  if (r.kind === "work") {
                    return (
                      <tr key={i}>
                        <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>{fecha}</td>
                        <td style={WORKER_DETAIL_CELL}>
                          <div>{r.row.labor?.name || r.row.laborId}</div>
                          <div style={{ fontSize: 9, color: "#777", marginTop: 1 }}>{laborSubtypeLabel(r.row.labor, catalogs)}</div>
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, fontSize: 10, color: "#555" }}>{r.cycleHeader}</td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatWorkerDetailProd(r.row, catalogs)}
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmtCurrency(r.row.amount)}
                        </td>
                      </tr>
                    );
                  }
                  const isAnticipo = r.kind === "anticipo";
                  const bg = isAnticipo ? "#fce4d6" : "#dcfce7";
                  const color = isAnticipo ? "#b45309" : "#166534";
                  const sign = isAnticipo ? "−" : "+";
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>{fecha}</td>
                      <td style={WORKER_DETAIL_CELL}>
                        <div style={{ fontWeight: 600 }}>{r.typeMeta.icon} {r.typeMeta.label}</div>
                      </td>
                      <td style={{ ...WORKER_DETAIL_CELL, fontSize: 10, color: "#555" }}>{r.note || "—"}</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", color: "#999" }}>—</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color }}>
                        {sign} {fmtCurrency(r.amount)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#c6efce", fontWeight: 700 }}>
                  <td style={WORKER_DETAIL_CELL} colSpan={4}>NETO A PAGAR</td>
                  <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtCurrency(neto)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {cycleSections.map((sec) => (
              <div key={sec.cycleId} className="overflow-x-auto">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 4 }}>{sec.header}</div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "#9dc3e6" }}>
                      <th style={WORKER_DETAIL_CELL_H}>Detalle Jornada</th>
                      <th style={WORKER_DETAIL_CELL_H}>Fecha</th>
                      <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Producción</th>
                      <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.rows.map((r, i) => (
                      <tr key={i}>
                        <td style={WORKER_DETAIL_CELL}>
                          <div>{r.labor?.name || r.laborId}</div>
                          <div style={{ fontSize: 9, color: "#777", marginTop: 1 }}>
                            {laborSubtypeLabel(r.labor, catalogs)}
                          </div>
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>{workerDetailDateLabel(r.date)}</td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatWorkerDetailProd(r, catalogs)}
                        </td>
                        <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {fmtCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: "#c6efce", fontWeight: 700 }}>
                      <td style={WORKER_DETAIL_CELL} colSpan={3}>Subtotal ciclo</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtCurrency(sec.totalAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            {/* Ajustes aplicados (anticipos y bonos), dentro de la imagen para
                que el detalle se entienda solo: de ahí sale el neto. */}
            {(anticipoRows.length > 0 || bonoRows.length > 0) && (
              <div className="overflow-x-auto">
                <div style={{ fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 4 }}>Ajustes aplicados</div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "#f8cbad" }}>
                      <th style={WORKER_DETAIL_CELL_H}>Tipo</th>
                      <th style={WORKER_DETAIL_CELL_H}>Fecha</th>
                      <th style={WORKER_DETAIL_CELL_H}>Nota</th>
                      <th style={{ ...WORKER_DETAIL_CELL_H, textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...anticipoRows, ...bonoRows].map((r, i) => {
                      const isAnticipo = r.kind === "anticipo";
                      const color = isAnticipo ? "#b45309" : "#166534";
                      const sign = isAnticipo ? "−" : "+";
                      return (
                        <tr key={i}>
                          <td style={{ ...WORKER_DETAIL_CELL, fontWeight: 600 }}>
                            {r.typeMeta.icon} {r.typeMeta.label}
                          </td>
                          <td style={{ ...WORKER_DETAIL_CELL, fontFamily: "ui-monospace, monospace" }}>
                            {r.date ? workerDetailDateLabel(r.date) : "s/f"}
                          </td>
                          <td style={{ ...WORKER_DETAIL_CELL, fontSize: 10, color: "#555" }}>{r.note || "—"}</td>
                          <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color }}>
                            {sign} {fmtCurrency(r.amount)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#c6efce", fontWeight: 700 }}>
                      <td style={WORKER_DETAIL_CELL} colSpan={3}>NETO A PAGAR</td>
                      <td style={{ ...WORKER_DETAIL_CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtCurrency(neto)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const WORKER_DETAIL_CELL_H = { border: "1px solid #555", padding: "5px 7px", fontSize: 11, fontWeight: 700, textAlign: "left", color: "#000" };
const WORKER_DETAIL_CELL = { border: "1px solid #999", padding: "4px 7px", fontSize: 11, color: "#000" };

const WD_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function workerDetailDateLabel(d) {
  if (!d) return "";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}-${WD_MONTHS[Number(m[2]) - 1] || m[2]}`;
}

// Etiqueta secundaria (debajo del nombre) según el tipo de labor:
// trato → tratoTypeLabel (Poda, Amarre…) + la unidad, si tiene
// tratoHE → "Tratos HE / Jornadas"
// cosecha → "Cosecha"
// main / supervision / extra → nombres legibles; otro tipo, el tipo tal cual.
function laborSubtypeLabel(labor, catalogs) {
  if (!labor) return "";
  const t = labor.type;
  if (t === "cosecha") return "Cosecha";
  if (t === "trato") {
    const typeLbl = labor.tratoType != null ? tratoTypeLabel(catalogs, labor.tratoType) : "Trato";
    const unitLbl = labor.tratoUnit != null ? tratoUnitLabel(catalogs, labor.tratoUnit) : null;
    return unitLbl ? `${typeLbl} · ${unitLbl}` : typeLbl;
  }
  if (t === "tratoHE") return "Tratos HE / Jornadas";
  if (t === "main") return "Jornada principal";
  if (t === "supervision") return "Supervisión";
  if (t === "extra") return "Extra";
  return t || "";
}

// Etiqueta corta para el texto plano: nombre y subtipo entre paréntesis.
function laborDisplayLabel(labor, catalogs) {
  const name = labor?.name || "";
  const sub = laborSubtypeLabel(labor, catalogs);
  return sub ? `${name} (${sub})` : name;
}

function formatWorkerDetailProd(r, catalogs) {
  const num = (v) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(Number(v) || 0);
  if (r.labor?.type === "cosecha") {
    const unit = r.containers.size > 0 ? cosechaUnit(catalogs, r.containers).toLowerCase() : "kg";
    return r.kilos > 0 ? `${num(r.kilos)} ${unit}` : "—";
  }
  if (r.labor?.type === "trato") {
    if (r.tratoQty === 0) return "—";
    // Usar la(s) unidad(es) del catálogo si están disponibles. Si hay varias
    // (multi-tier con unidades distintas) las juntamos con "/".
    const unitNames = [...r.tratoUnits]
      .map((u) => tratoUnitLabel(catalogs, u))
      .filter(Boolean);
    const unitStr = unitNames.length > 0 ? " " + unitNames.join("/").toLowerCase() : "";
    return `${num(r.tratoQty)}${unitStr}`;
  }
  const jornadas = (n) => `${num(n)} jornada${Number(n) === 1 ? "" : "s"}`;
  if (r.labor?.type === "tratoHE") {
    const base = r.jornadas > 0 ? jornadas(r.jornadas) : "";
    const ot = r.overtimeHours > 0 ? `${num(r.overtimeHours)}h HE` : "";
    return [base, ot].filter(Boolean).join(" · ") || "—";
  }
  return r.jornadas > 0 ? jornadas(r.jornadas) : "—";
}

// ─────────────────── Pagos anteriores (WorkersHistory) ───────────────────
// Buscador de pagos por trabajador. Carga todas las nóminas (sin tope) y
// filtra en el cliente por rango de fechas, tipo y faena. Por defecto:
// últimos 6 meses, todas las clasificaciones.

const sixMonthsAgoISO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return localIsoDate(d);
};
const todayISO = () => localIsoDate();

const payrollDate = (p) => {
  if (p?.createdAt?.toDate) return p.createdAt.toDate();
  if (p?.createdAt?.seconds) return new Date(p.createdAt.seconds * 1000);
  return new Date(0);
};
const payrollDateISO = (p) => {
  const d = payrollDate(p);
  return isNaN(d.getTime()) ? "" : localIsoDate(d);
};

const normRut = (r) => String(r || "").replace(/[^a-z0-9]/gi, "").toLowerCase();

// Popover del filtro de faena, con buscador. Se cierra con click afuera o
// Escape, igual que ColorPalette (Faenas.jsx).
function FaenaFilterPopover({ faenas, faenaFilter, setFaenaFilter, onClose }) {
  const ref = useRef(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filtered = faenas.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-[min(320px,90vw)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl ring-1 ring-black/5"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Filtrar por faena
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar faena…"
        autoFocus
        className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
      />
      <div className="flex max-h-52 flex-wrap gap-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <span className="text-xs text-[var(--color-muted)]">Sin resultados</span>
        ) : (
          filtered.map((f) => {
            const active = faenaFilter.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFaenaFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(f.id)) next.delete(f.id);
                    else next.add(f.id);
                    return next;
                  });
                }}
                className={`min-h-[28px] rounded-full px-2 py-0.5 text-xs ${
                  active
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                    : "border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {f.name}
              </button>
            );
          })
        )}
      </div>
      {faenaFilter.size > 0 && (
        <button
          type="button"
          onClick={() => setFaenaFilter(new Set())}
          className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-danger)]"
        >
          Limpiar selección ({faenaFilter.size})
        </button>
      )}
    </div>
  );
}

function WorkersHistory({ faenas, workers }) {
  const rutOf = useMemo(() => currentRutResolver(workers), [workers]);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [allPayrolls, setAllPayrolls] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(sixMonthsAgoISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [classification, setClassification] = useState("all"); // all|nomina|diferencia
  const [faenaFilter, setFaenaFilter] = useState(() => new Set());
  const [faenaPickerOpen, setFaenaPickerOpen] = useState(false);
  const [selectedRut, setSelectedRut] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await payrollsService.list({ order: ["createdAt", "desc"] });
        if (!cancelled) setAllPayrolls(list);
      } catch (err) {
        toast.error("No se pudieron cargar las nóminas: " + (err?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);

  // 1) Filtramos payrolls por rango de fechas + clasificación.
  const filteredPayrolls = useMemo(() => {
    return allPayrolls.filter((p) => {
      const iso = payrollDateISO(p);
      if (dateFrom && iso && iso < dateFrom) return false;
      if (dateTo && iso && iso > dateTo) return false;
      if (classification !== "all" && (p.classification || "nomina") !== classification) return false;
      return true;
    });
  }, [allPayrolls, dateFrom, dateTo, classification]);

  // 2) Índice por trabajador con sus pagos. La clave es el workerId (estable
  // aunque el rut se corrija); se muestra el rut vigente de la ficha.
  const workersIndex = useMemo(() => {
    const map = new Map();
    for (const p of filteredPayrolls) {
      for (const it of (p.items || [])) {
        if (!it.rut) continue;
        const key = it.workerId || it.rut;
        if (!map.has(key)) {
          map.set(key, {
            key,
            workerId: key,
            rut: rutOf(it.rut, it.workerId),
            name: it.name || "",
            totalAmount: 0,
            totalGross: 0,
            totalAdvance: 0,
            totalBonus: 0,
            payments: [],
          });
        }
        const w = map.get(key);
        if (it.name && (!w.name || w.name === it.rut)) w.name = it.name;
        const amount = Number(it.amount) || 0;
        const gross = Number(it.grossAmount) || amount;
        const advance = Number(it.advance) || Number(it.anticiposTotal) || 0;
        const bonus = Number(it.bonus) || Number(it.bonosTotal) || 0;
        // Faenas que cubre este pago según byCycle + cycleDetails.
        const payFaenaIds = new Set();
        const payFaenaNames = new Set();
        const cds = p.cycleDetails || [];
        for (const cid of Object.keys(it.byCycle || {})) {
          if ((it.byCycle[cid] || 0) > 0) {
            const cd = cds.find((c) => c.id === cid);
            if (cd?.faenaId) payFaenaIds.add(cd.faenaId);
            if (cd?.faenaName) payFaenaNames.add(cd.faenaName);
          }
        }
        w.totalAmount += amount;
        w.totalGross += gross;
        w.totalAdvance += advance;
        w.totalBonus += bonus;
        w.payments.push({
          payrollId: p.id,
          payrollName: p.name || "(sin nombre)",
          payrollDate: payrollDate(p),
          payrollDateISO: payrollDateISO(p),
          classification: p.classification || "nomina",
          status: p.status || "pending",
          amount, gross, advance, bonus,
          // Líder de grupo congelado al momento de la nómina (item.groupLeader
          // se persiste cuando se genera). Útil para auditoría: a quién
          // estaba asignado el trabajador entonces, no quien lo lidera hoy.
          groupLeader: it.groupLeader || "",
          faenaIds: payFaenaIds,
          faenaNames: [...payFaenaNames],
          payroll: p,
        });
      }
    }
    for (const w of map.values()) {
      w.payments.sort((a, b) => b.payrollDate - a.payrollDate);
    }
    return map;
  }, [filteredPayrolls, rutOf]);

  // 3) Filtro por faena, a nivel de pago: quedan los pagos con alguna faena del filtro.
  const workersAfterFaena = useMemo(() => {
    if (faenaFilter.size === 0) return [...workersIndex.values()];
    const out = [];
    for (const w of workersIndex.values()) {
      const filtered = w.payments.filter((pay) =>
        [...pay.faenaIds].some((fid) => faenaFilter.has(fid)),
      );
      if (filtered.length === 0) continue;
      // Recalcular totales solo con los pagos filtrados por faena.
      const totals = filtered.reduce(
        (acc, pay) => ({
          totalAmount: acc.totalAmount + pay.amount,
          totalGross: acc.totalGross + pay.gross,
          totalAdvance: acc.totalAdvance + pay.advance,
          totalBonus: acc.totalBonus + pay.bonus,
        }),
        { totalAmount: 0, totalGross: 0, totalAdvance: 0, totalBonus: 0 },
      );
      out.push({ ...w, ...totals, payments: filtered });
    }
    return out;
  }, [workersIndex, faenaFilter]);

  // 4) Filtro por búsqueda (rut o nombre) y orden por total descendente. El
  // nombre usa matchesSearchQuery (cada palabra, en cualquier orden): "ana
  // soto" encuentra a "Ana María Soto".
  const filteredWorkers = useMemo(() => {
    const list = [...workersAfterFaena].sort((a, b) => b.totalAmount - a.totalAmount);
    const q = search.trim();
    if (!q) return list;
    const qNorm = normRut(q);
    return list.filter((w) =>
      normRut(w.rut).includes(qNorm) ||
      normRut(w.workerId).includes(qNorm) ||
      matchesSearchQuery(w.name, q),
    );
  }, [workersAfterFaena, search]);

  const selectedWorker = selectedRut ? filteredWorkers.find((w) => w.key === selectedRut) || workersAfterFaena.find((w) => w.key === selectedRut) : null;

  // Faenas del filtro: las que aparecen en filteredPayrolls.
  const faenasInPayrolls = useMemo(() => {
    const ids = new Set();
    for (const p of filteredPayrolls) {
      for (const cd of p.cycleDetails || []) {
        if (cd.faenaId) ids.add(cd.faenaId);
      }
    }
    return faenas.filter((f) => ids.has(f.id));
  }, [filteredPayrolls, faenas]);

  const resetFilters = () => {
    setSearch("");
    setDateFrom(sixMonthsAgoISO());
    setDateTo(todayISO());
    setClassification("all");
    setFaenaFilter(new Set());
  };

  const setRange = (months) => {
    const today = new Date();
    const from = new Date(today);
    from.setMonth(from.getMonth() - months);
    setDateFrom(localIsoDate(from));
    setDateTo(localIsoDate(today));
  };

  const handleExport = async () => {
    if (!selectedWorker) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Pagos");
      ws.addRow(["", ""]); // fila 1 vacía
      ws.getColumn(1).width = 4;
      ws.addRow(["", `Historial de pagos — ${selectedWorker.name} (${selectedWorker.rut})`]);
      ws.getRow(2).font = { bold: true, size: 13 };
      ws.addRow(["", `Rango: ${dateFrom} → ${dateTo} · ${classification === "all" ? "Nóminas + Diferencias" : classification === "nomina" ? "Solo nóminas" : "Solo diferencias"}`]);
      ws.addRow([]);
      const header = ["", "Fecha", "Nómina", "Tipo", "Líder", "Faenas", "Bruto", "Anticipos", "Bonos", "Neto"];
      const hdrRow = ws.addRow(header);
      hdrRow.eachCell((cell, col) => {
        if (col === 1) return;
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7DEE8" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      for (const pay of selectedWorker.payments) {
        const r = ws.addRow([
          "",
          pay.payrollDateISO,
          pay.payrollName,
          pay.classification === "diferencia" ? "Diferencia" : "Nómina",
          pay.groupLeader || "—",
          pay.faenaNames.join(" / ") || "—",
          Math.round(pay.gross),
          Math.round(pay.advance),
          Math.round(pay.bonus),
          Math.round(pay.amount),
        ]);
        for (let c = 7; c <= 10; c++) r.getCell(c).numFmt = '"$"#,##0';
      }
      const totalRow = ws.addRow([
        "", "", "TOTAL", "", "", "",
        Math.round(selectedWorker.totalGross),
        Math.round(selectedWorker.totalAdvance),
        Math.round(selectedWorker.totalBonus),
        Math.round(selectedWorker.totalAmount),
      ]);
      totalRow.font = { bold: true };
      totalRow.eachCell((cell, col) => {
        if (col === 1) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        if (col >= 7) cell.numFmt = '"$"#,##0';
      });
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 30;
      ws.getColumn(4).width = 12;
      ws.getColumn(5).width = 18;
      ws.getColumn(6).width = 28;
      for (let c = 7; c <= 10; c++) ws.getColumn(c).width = 14;
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (selectedWorker.name || selectedWorker.rut).replace(/[^a-z0-9_-]+/gi, "_");
      a.href = url;
      a.download = `historial_${safeName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      toast.error("No se pudo exportar: " + (err?.message || err));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-[var(--color-muted)]">Cargando nóminas…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-3 min-h-0">
      {/* Filtros */}
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Escribir una búsqueda vuelve al listado filtrado, sin pasar
              // por "Volver".
              if (selectedRut) setSelectedRut(null);
            }}
            placeholder="🔍 Buscar por RUT o nombre…"
            className="min-w-[220px] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            />
            <span className="text-[var(--color-muted)]">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
            {[
              { v: 3, l: "3m" }, { v: 6, l: "6m" }, { v: 12, l: "1a" }, { v: 24, l: "2a" },
            ].map((r) => (
              <button
                key={r.v}
                onClick={() => setRange(r.v)}
                className="border-l border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 first:border-l-0 hover:bg-[var(--color-accent-soft)]"
                title={`Últimos ${r.l}`}
              >
                {r.l}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
            {[
              { v: "all", l: "Todos" },
              { v: "nomina", l: "📋 Nóminas" },
              { v: "diferencia", l: "🏷️ Diferencias" },
            ].map((c) => (
              <button
                key={c.v}
                onClick={() => setClassification(c.v)}
                className={`border-l border-[var(--color-border)] px-2 py-1 first:border-l-0 ${
                  classification === c.v ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
          <button
            onClick={resetFilters}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
            title="Volver a los filtros por defecto (6 meses, todas las clasif., sin faena)"
          >
            ⟲ Restablecer
          </button>
          {faenasInPayrolls.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setFaenaPickerOpen((v) => !v)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  faenaFilter.size > 0
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                🏭 Faena{faenaFilter.size > 0 ? ` (${faenaFilter.size})` : ""}
                <span className="text-[9px]">{faenaPickerOpen ? "▴" : "▾"}</span>
              </button>
              {faenaPickerOpen && (
                <FaenaFilterPopover
                  faenas={faenasInPayrolls}
                  faenaFilter={faenaFilter}
                  setFaenaFilter={setFaenaFilter}
                  onClose={() => setFaenaPickerOpen(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selectedWorker ? (
          <WorkersList
            workers={filteredWorkers}
            search={search}
            onSelect={(rut) => setSelectedRut(rut)}
          />
        ) : (
          <WorkerDetail
            worker={selectedWorker}
            onBack={() => setSelectedRut(null)}
            onExport={handleExport}
            exporting={exporting}
          />
        )}
      </div>
    </div>
  );
}

function WorkersList({ workers, search, onSelect }) {
  if (workers.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
        {search.trim()
          ? `Ningún trabajador coincide con "${search}" en el rango seleccionado.`
          : "No hay trabajadores con pagos en este rango/filtros."}
      </div>
    );
  }
  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {workers.map((w) => (
        <button
          key={w.key}
          onClick={() => onSelect(w.key)}
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-sm transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        >
          <div className="min-w-0">
            <div className="truncate font-semibold">{w.name}</div>
            <div className="font-mono text-[11px] text-[var(--color-muted)]">{formatRutForDisplay(w.rut)}</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {w.payments.length} pago{w.payments.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold tabular-nums text-[var(--color-accent)]">
              {fmtCurrency(w.totalAmount)}
            </div>
            {(w.totalAdvance > 0 || w.totalBonus > 0) && (
              <div className="text-[10px] text-[var(--color-muted)] tabular-nums">
                {w.totalAdvance > 0 && <span className="text-amber-600 dark:text-amber-400">−{fmtCurrency(w.totalAdvance)} </span>}
                {w.totalBonus > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{fmtCurrency(w.totalBonus)}</span>}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// Lo que un trabajador cobró en una nómina: el mismo contenido que la fila
// expandible de PayrollDetailModal (WorkerPaidDetailTables +
// WorkerPaySummaryCards), abierto desde su historial. `payment.payroll` ya
// está en memoria, así que solo se lee el snapshot de esa nómina (un doc).
function WorkerPayrollDetailModal({ open, payment, worker, catalogs, onClose, onShowFullHistory }) {
  const payroll = payment?.payroll || null;
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  useEffect(() => {
    if (!open || !payroll?.id) return;
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
      .catch(() => { if (!cancelled) setSnapshot(payroll.snapshot || null); })
      .finally(() => { if (!cancelled) setSnapshotLoading(false); });
    return () => { cancelled = true; };
  }, [open, payroll?.id]);

  if (!payroll) return null;
  const item = (payroll.items || []).find((it) => (it.workerId || it.rut) === worker.workerId) || null;
  const cycleDetails = payroll.cycleDetails || [];
  const displayCycleLabel = (cycle) => payroll.cycleLabelOverrides?.[cycle.id] || cycle.label || cycle.id;

  return (
    <Modal open={open} onClose={onClose} title={`${worker.name} — ${payroll.name || "Nómina"}`} size="lg">
      {!item ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          No se encontró el detalle de este trabajador en esta nómina.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {item.groupLeader && (
                <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px]">
                  👥 <b>{item.groupLeader}</b>
                </span>
              )}
              {item.email && (
                <span className="text-[10px] text-[var(--color-muted)]">✉ {item.email}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onShowFullHistory}
              className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
              title="Abrir el historial completo del trabajador, a través de todas las nóminas"
            >
              📅 Ver historial completo
            </button>
          </div>

          <WorkerPaidDetailTables
            displayRut={worker.rut}
            item={item}
            snapshot={snapshot}
            snapshotLoading={snapshotLoading}
            cycleDetails={cycleDetails}
            displayCycleLabel={displayCycleLabel}
            catalogs={catalogs}
          />

          <WorkerPaySummaryCards item={item} />
        </div>
      )}
    </Modal>
  );
}

function WorkerDetail({ worker, onBack, onExport, exporting }) {
  const { catalogs } = useCatalogs();
  // Gráfico: una barra por pago; X = orden cronológico, Y = monto neto.
  const chartData = useMemo(() => {
    const sorted = [...worker.payments].sort((a, b) => a.payrollDate - b.payrollDate);
    const maxAmt = Math.max(1, ...sorted.map((p) => p.amount));
    return { sorted, maxAmt };
  }, [worker.payments]);

  // Resumen completo del trabajador, el mismo modal de la pantalla
  // Trabajadores: todas sus jornadas, también las que no entraron a ninguna
  // nómina, por ciclo y fecha.
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Pago elegido, para ver su detalle en esa nómina sin abrirla entera (ver
  // WorkerPayrollDetailModal).
  const [payDetailFor, setPayDetailFor] = useState(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div>
          <button
            onClick={onBack}
            className="mb-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          >
            ← Volver al listado
          </button>
          <div className="text-xl font-semibold">{worker.name}</div>
          <div className="font-mono text-sm text-[var(--color-muted)]">{formatRutForDisplay(worker.rut)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSummaryOpen(true)}
            title="Ver todos sus días registrados (incluyendo los que aún no entraron a ninguna nómina)"
            className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
          >
            📅 Ver días sin pagar
          </button>
          <button
            onClick={onExport}
            disabled={exporting}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            {exporting ? "Exportando…" : "📥 Descargar XLSX"}
          </button>
        </div>
      </div>

      <WorkerSummaryModal
        open={summaryOpen}
        worker={{ id: worker.workerId, rut: worker.rut, name: worker.name }}
        onClose={() => setSummaryOpen(false)}
      />

      <WorkerPayrollDetailModal
        open={!!payDetailFor}
        payment={payDetailFor}
        worker={worker}
        catalogs={catalogs}
        onClose={() => setPayDetailFor(null)}
        onShowFullHistory={() => {
          setPayDetailFor(null);
          setSummaryOpen(true);
        }}
      />

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="Total neto pagado" value={fmtCurrency(worker.totalAmount)} accent />
        <MetricCard label="Pagos" value={String(worker.payments.length)} />
        <MetricCard label="Bruto acumulado" value={fmtCurrency(worker.totalGross)} />
        <MetricCard
          label="Anticipos / Bonos"
          value={
            <span>
              <span className="text-amber-600 dark:text-amber-400">−{fmtCurrency(worker.totalAdvance)}</span>
              {" / "}
              <span className="text-emerald-600 dark:text-emerald-400">+{fmtCurrency(worker.totalBonus)}</span>
            </span>
          }
        />
      </div>

      {/* Gráfico: barras por pago en orden cronológico */}
      {chartData.sorted.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 text-xs font-medium text-[var(--color-muted)]">
            Pagos en el tiempo · {chartData.sorted.length} eventos
          </div>
          <PaymentsBarChart data={chartData.sorted} maxAmt={chartData.maxAmt} />
        </div>
      )}

      {/* Listado de pagos */}
      <div className="rounded-lg border border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium">
          Detalle de pagos ({worker.payments.length})
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {worker.payments.map((pay, i) => (
            <button
              key={`${pay.payrollId}_${i}`}
              onClick={() => setPayDetailFor(pay)}
              title="Ver el detalle de lo que fue en esta nómina"
              className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{pay.payrollName}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    pay.classification === "diferencia"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}>
                    {pay.classification === "diferencia" ? "diferencia" : "nómina"}
                  </span>
                  <span className={`text-[10px] ${
                    pay.status === "paid" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"
                  }`}>
                    {pay.status === "paid" ? "pagado" : "pendiente"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                  📅 {pay.payrollDateISO || "—"}
                  {pay.groupLeader && (
                    <> · 👥 Líder: <span className="text-[var(--color-text)] font-medium">{pay.groupLeader}</span></>
                  )}
                  {pay.faenaNames.length > 0 && (
                    <> · 🏞 {pay.faenaNames.join(" / ")}</>
                  )}
                </div>
                {(pay.advance > 0 || pay.bonus > 0) && (
                  <div className="mt-0.5 text-[11px] tabular-nums">
                    Bruto {fmtCurrency(pay.gross)}
                    {pay.advance > 0 && <span className="text-amber-600 dark:text-amber-400"> · −{fmtCurrency(pay.advance)}</span>}
                    {pay.bonus > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · +{fmtCurrency(pay.bonus)}</span>}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">{fmtCurrency(pay.amount)}</div>
                <div className="text-[10px] text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100">→</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent = false }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${accent ? "text-[var(--color-accent)]" : ""}`}>{value}</div>
    </div>
  );
}

function PaymentsBarChart({ data, maxAmt }) {
  // SVG inline: ancho 100% y alto fijo.
  const H = 140;
  const padTop = 8, padBottom = 24, padLeft = 4, padRight = 4;
  const innerH = H - padTop - padBottom;
  const n = data.length;
  // Cada barra ocupa una franja proporcional + 4px de gap entre barras.
  const VW = Math.max(280, n * 36);
  const innerW = VW - padLeft - padRight;
  const barW = Math.max(8, Math.min(40, innerW / Math.max(1, n) - 4));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${VW} ${H}`} width="100%" height={H} style={{ display: "block", minWidth: 280 }}>
        {data.map((p, i) => {
          const h = (p.amount / maxAmt) * innerH;
          const x = padLeft + (i + 0.5) * (innerW / n) - barW / 2;
          const y = padTop + (innerH - h);
          const isDif = p.classification === "diferencia";
          return (
            <g key={`${p.payrollId}_${i}`}>
              <title>{`${p.payrollDateISO} — ${p.payrollName}\n${fmtCurrency(p.amount)}${p.advance > 0 ? `  (anticipo −${fmtCurrency(p.advance)})` : ""}${p.bonus > 0 ? `  (bono +${fmtCurrency(p.bonus)})` : ""}`}</title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                fill={isDif ? "#f59e0b" : "#16a34a"}
                opacity={p.status === "paid" ? 1 : 0.5}
                rx={2}
              />
              {n <= 24 && (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="currentColor"
                  opacity="0.6"
                >
                  {p.payrollDateISO?.slice(5) /* MM-DD */}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-[var(--color-muted)]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#16a34a" }} /> Nómina</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#f59e0b" }} /> Diferencia</span>
        <span className="flex items-center gap-1 opacity-50"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#16a34a" }} /> pendiente</span>
      </div>
    </div>
  );
}
