import { useState, useMemo, useRef, useEffect } from "react";
import {
  jobsService,
  subjobsService,
  cyclesService,
  workersService,
  listWorkdaysByCycles,
  workdaysService,
  payrollSnapshotsService,
} from "../services";
import {
  payrollsService,
  pendingCashItemsOf,
  workdaysForNewPayroll,
  tagWorkdaysWithPayroll,
  markPaid as markPayrollPaid,
  markPending as markPayrollPending,
  markBankPaid,
  revertBankPaid,
  untagWorkdaysFromPayroll,
} from "../services/payrollsService";
import {
  listPendingForWorkers,
  applyAdvancesToPayroll,
  restoreAdvancesFromPayroll,
} from "../services/advancesService";
import {
  snapshotCycleOf,
  snapshotWorkdayOf,
  snapshotAdvanceOf,
  saveSnapshot,
  deleteSnapshot,
  readSnapshot,
} from "../services/payrollSnapshots";
import { workerKeys } from "../services/workersService";
import { isCashBank } from "../utils/banks";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { getPublishedPortal, publishPayrollToPortal } from "../services/portalService";
import {
  aggregateWorkerAmounts,
  validateAccountNumber,
  payrollSuggestedName,
  groupCashByLeader,
  downloadPayrollXlsx,
  downloadBankFileXlsx,
} from "../utils/payroll";
import { newPayrollCycleDetails } from "../utils/payrollItem";
import { activeCyclesByJob, chosenCyclesOf, cycleStatsOf, exportCyclesOf } from "../utils/payrollCycles";
import {
  installmentCandidatesOf,
  payrollItemOf,
  payrollTotalsOf,
  previewItemsOf,
  withPreviewEdit,
  withoutInstallments,
} from "../utils/payrollPreview";
import ConfirmDialog from "../components/ConfirmDialog";
import CloseCyclesModal from "./payroll/CloseCyclesModal";
import { settledOpenCycles, payrollStatusMap, splitTaken } from "../utils/cycleClosing";
import { currentRutResolver } from "../utils/workerRut";
import { AddWorkerDaysModal } from "./payroll/AddWorkerDaysModal";
import { CycleSelector } from "./payroll/CycleSelector";
import { resolveCurrentRut } from "./payroll/helpers";
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

// Copia de los items con el rut vigente, para exportar. Solo para archivos que
// se leen afuera: dentro de la app los items conservan el rut guardado, que es
// la clave con que se cruzan con jornadas y anticipos.
const withCurrentRuts = (items, rutOf) =>
  (items || []).map((it) => ({ ...it, rut: rutOf(it.rut, it.workerId) }));

export default function Payroll() {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const { config: payrollConfig, bankFormat, currentBankFormat, save: savePayrollConfig } = usePayrollConfig();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    const candidates = installmentCandidatesOf(items, previewAdvancesRef.current);
    if (candidates.length === 0) return items;

    const excludedIds = await new Promise((resolve) => setInstallmentConfirmState({ candidates, resolve }));
    setInstallmentConfirmState(null);
    if (excludedIds === null) return null;
    if (excludedIds.length === 0) return items;

    return withoutInstallments(items, excludedIds);
  };
  const [detailPayroll, setDetailPayroll] = useState(null);
  // Nómina que se está renombrando, o null. El nombre es solo una etiqueta y se
  // cambia en cualquier estado; renombrar actualiza el doc y el snapshot
  // embebido, así la re-descarga del JSON trae el nombre nuevo.
  const [renaming, setRenaming] = useState(null);

  // Totales por ciclo activo (ver `cycleStatsOf`).
  const [cycleStats, setCycleStats] = useState({});
  // Separado de `loading`: al refrescar, el spinner va en el botón y no tapa
  // la pantalla con "Cargando…".
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [f, s, c, w, p] = await Promise.all([
        jobsService.list({ order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        subjobsService.list({ order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
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
      const activeIds = c.filter((x) => x.status !== "closed").map((x) => x.id);
      // Por ciclo y cacheado: `buildPreview` vuelve a pedir estos mismos
      // documentos al elegir los ciclos y los toma de la misma clave de caché.
      const wds = await listWorkdaysByCycles(activeIds);
      const stats = cycleStatsOf(c, w, wds);
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
      jobsService.invalidate();
      subjobsService.invalidate();
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

  // Los ciclos elegidos y qué labores de cada uno (ver `chosenCyclesOf`).
  const chosenCycles = chosenCyclesOf(cycles, selectedCycleIds, selectedLaborsByCycle);

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
      const claveDe = resolveCurrentRut(workers);
      const candidateIds = aggregates.filter((a) => a.total > 0).map(claveDe);
      const pendingAdvances = await listPendingForWorkers(candidateIds);
      previewWorkdaysRef.current = allWorkdays;
      previewAdvancesRef.current = pendingAdvances;
      const items = previewItemsOf({ aggregates, workers, payrollCycles: ciclosNomina, pendingAdvances });

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
    setPreviewItems((prev) => prev.map((p) => (p.rut !== rut ? p : withPreviewEdit(p, patch))));
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

      const cleanItems = items.map((p) => payrollItemOf(p, enLaNomina));

      const allWorkdayIds = cleanItems.flatMap((p) => p.workdayIds);
      const allAdvanceIds = cleanItems.flatMap((p) => p.advanceIds || []);
      const allApplications = cleanItems.flatMap((p) => p.advanceApplications || []);
      const totals = payrollTotalsOf(cleanItems);
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
          format: bankFormat.id,
          classification: payrollClassification || "nomina",
          status: "pending",
          total: totals.total, bankTotal: totals.bankTotal, cashTotal: totals.cashTotal,
          workerCount: totals.workerCount,
          bankCount: totals.bankCount,
          cashCount: totals.cashCount,
          advanceTotal: totals.advanceTotal,
          bonusTotal: totals.bonusTotal,
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
        format: bankFormat.id,
        classification: payrollClassification || "nomina",
        status: "pending",
        cycleIds,
        cycleLabels,
        cycleDetails,
        items: cleanItems,
        total: totals.total,
        bankTotal: totals.bankTotal,
        cashTotal: totals.cashTotal,
        workerCount: totals.workerCount,
        bankCount: totals.bankCount,
        cashCount: totals.cashCount,
        workdayIds: allWorkdayIds,
        advanceIds: allAdvanceIds,
        advanceTotal: totals.advanceTotal,
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
  // El formato del archivo del banco se relee en cada descarga: sin leerlo no
  // se descarga.
  const bankFormatForDownload = async () => {
    try {
      return await currentBankFormat();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo leer el formato del archivo del banco. Revisa la conexión e intenta de nuevo.");
      return null;
    }
  };
  const onRedownload = async (p) => {
    const format = await bankFormatForDownload();
    if (!format) return;
    const cyclesForExport = exportCyclesOf(p, cycles);
    await downloadPayrollXlsx(withCurrentRuts(p.items, rutOf), p.name || "Nomina", cyclesForExport, format);
  };
  const onDownloadNominaOnly = async (p) => {
    const format = await bankFormatForDownload();
    if (!format) return;
    const filename = `${p.name || "Nomina"}_${format.fileSuffix}`;
    await downloadBankFileXlsx(withCurrentRuts(p.items, rutOf), filename, format);
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
