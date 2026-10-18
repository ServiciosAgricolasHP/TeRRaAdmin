import { useState, useRef, useEffect, useMemo } from "react";
import { captureFullWidthDataUrl, captureFullWidthBlob } from "../../utils/imageCapture";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import {
  getTratoTiers,
  getTratoTierTotals,
  workdayComboKeyOf,
  workdayMapKey,
  getDaySingle,
  qualityLabel,
  containerLabel,
  tratoUnitLabel,
  getDayCombos,
} from "../../utils/cosechaCombos";
import { isRedDay } from "../../utils/tratoHE";
import { tripsService } from "../../services/transportsService";
import { cycleSummariesService, cyclesService, workdaysService } from "../../services";
import { useCarriers } from "../../contexts/CarriersContext";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  buildDailyRows,
  laborTotals,
  laborQtyUnit,
  buildWorkerLaborGrid,
  medianOf,
  activityLabel,
  dateLabel,
} from "../../utils/cycleSummary";
import { fmtCurrency } from "../../utils/format";
import { CobrarEditor } from "./cycleSummaryModal/CobrarEditor";
import { ColumnsMenu } from "./cycleSummaryModal/ColumnsMenu";
import { EditingWatermark } from "./cycleSummaryModal/EditingWatermark";
import { ImportCyclesModal } from "./cycleSummaryModal/ImportCyclesModal";
import { ImportLaborsModal } from "./cycleSummaryModal/ImportLaborsModal";
import { LaborWorkerGrid } from "./cycleSummaryModal/LaborWorkerGrid";
import { PrintableSummary } from "./cycleSummaryModal/PrintableSummary";
import { TitlesEditor } from "./cycleSummaryModal/TitlesEditor";

// Índice de columna (desde 1) a letra de Excel: 1 → "A", 27 → "AA".
function colLetterX(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Expande wdMap a filas por (día, combo): en cosecha una por calidad × envase
// (`qx_cy`) y en trato una por tier (`tX`), con el piso en una fila propia;
// el resto, una fila por día.
//
// Campos comunes: { date, comboKey, amount, pisoAmount }. Además:
//   - cosecha: { qx, cy, qty, isPiso }
//   - trato: { tierIdx, unit, qty, isPiso }
//   - tratoHE: { base, overtimeHours, extras }
//   - main/sup/extra (y tratoEtapas): qty = n° de jornadas
function buildExpandedRows(labor, wdMap, dayPrices = {}) {
  const type = labor?.type;
  const byKey = new Map();
  const bonusManejoLabor = Number(labor?.bonusManejo) || 0;
  const bonusSupLabor = Number(labor?.bonusSupervision) || 0;

  for (const k in wdMap) {
    const wd = wdMap[k];
    if (!wd?.date) continue;
    const date = wd.date;

    if (type === "cosecha") {
      const qx = Number(wd.qualityX) || 0;
      const cy = Number(wd.containerY) || 0;
      const comboKey = wd.pisoOnly ? `${date}|piso` : `${qx}_${cy}`;
      const mapKey = `${date}|${comboKey}`;
      if (!byKey.has(mapKey)) {
        byKey.set(mapKey, { date, comboKey, qx, cy, qty: 0, amount: 0, pisoAmount: 0, isPiso: !!wd.pisoOnly });
      }
      const r = byKey.get(mapKey);
      if (wd.pisoOnly) {
        r.pisoAmount += Number(wd.amount) || 0;
      } else {
        r.qty += Number(wd.qty) || 0;
        r.amount += Number(wd.amount) || 0;
      }
    } else if (type === "trato") {
      const parts = String(k).split("__");
      const tierKey = wd.pisoOnly ? "piso" : (parts[2] || "t0");
      const mapKey = `${date}|${tierKey}`;
      if (!byKey.has(mapKey)) {
        const tiers = getTratoTiers(dayPrices, labor.id, date);
        const tierIdx = tierKey.startsWith("t") ? Number(tierKey.slice(1)) || 0 : 0;
        byKey.set(mapKey, {
          date,
          comboKey: tierKey,
          tierIdx,
          unit: tiers[tierIdx]?.unit ?? null,
          qty: 0,
          amount: 0,
          pisoAmount: 0,
          isPiso: !!wd.pisoOnly,
        });
      }
      const r = byKey.get(mapKey);
      if (wd.pisoOnly) {
        r.pisoAmount += Number(wd.amount) || 0;
      } else {
        const t = getTratoTierTotals(wd);
        r.qty += t.qty;
        r.amount += t.amount;
      }
    } else if (type === "tratoHE") {
      const mapKey = date;
      if (!byKey.has(mapKey)) {
        byKey.set(mapKey, { date, comboKey: "he", base: 0, overtimeHours: 0, extras: 0, amount: 0, pisoAmount: 0 });
      }
      const r = byKey.get(mapKey);
      if (wd.pisoOnly) {
        r.pisoAmount += Number(wd.amount) || 0;
      } else {
        r.base += Number(wd.qty) || 0;
        r.overtimeHours += Number(wd.overtimeHours) || 0;
        const manejoAmt = wd.hasManejo ? bonusManejoLabor : 0;
        const supAmt = wd.hasSupervision ? bonusSupLabor : 0;
        r.extras += manejoAmt + supAmt + (Number(wd.extras) || 0);
        r.amount += Number(wd.amount) || 0;
      }
    } else {
      // main/supervision/extra: 1 fila por día, qty = n° de jornadas
      const mapKey = date;
      if (!byKey.has(mapKey)) {
        byKey.set(mapKey, { date, comboKey: "j", qty: 0, amount: 0, pisoAmount: 0 });
      }
      const r = byKey.get(mapKey);
      if (wd.pisoOnly) {
        r.pisoAmount += Number(wd.amount) || 0;
      } else {
        r.qty += 1;
        r.amount += Number(wd.amount) || 0;
      }
    }
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.comboKey || "").localeCompare(String(b.comboKey || ""));
  });
}

// ============================================================
// Espejo en localStorage
//
// La fuente de verdad del estado editable del resumen es Firestore
// (`cycleSummariesService`), compartido entre usuarios y navegadores.
// localStorage es un espejo local: respaldo si falla la red y origen de la
// migración cuando el ciclo no tiene doc en Firestore.
// ============================================================

const cobrarStorageKey = (cycleId) => `cobrar_${cycleId}`;

const titlesStorageKey = (cycleId) => `summary_titles_${cycleId}`;

const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};

const saveJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { console.error(err); }
};

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
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState("pagar"); // pagar | cobrar
  // `withIva` (true por defecto) decide si el imprimible y el XLSX de cobrar
  // muestran las filas de IVA 19%. Se guarda por ciclo: hay cobros sin IVA
  // (servicios exentos, boletas, acuerdos netos).
  const [cobrar, setCobrar] = useState({ labors: {}, carriers: {}, withIva: true, discount: 0, discountNote: "", pendingBalance: 0, pendingBalanceNote: "" });
  const [titles, setTitles] = useState({ main: "DETALLE DE JORNADA", subtitle: "", laborNames: {}, carrierNames: {} });
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [showCobrarEditor, setShowCobrarEditor] = useState(true);
  // Candado de edición del modo cobrar. En false oculta los inputs, los
  // botones + y ✕ y los paneles de edición, y deja el resumen listo para
  // copiar, imprimir o exportar. Arranca bloqueado.
  const [editMode, setEditMode] = useState(false);
  // Captura pedida mientras el resumen estaba en edición. `captureAsk` abre el
  // diálogo de confirmación; `pendingCapture` es la acción que corre después
  // de bloquear (ver el efecto más abajo — hay que esperar el repintado).
  const [captureAsk, setCaptureAsk] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  // Metadata de la última edición del resumen compartido (quién y cuándo).
  const [summaryMeta, setSummaryMeta] = useState(null);
  // Los guardados con debounce se habilitan recién al hidratar el estado desde
  // Firestore, para que abrir el modal no reescriba el doc con lo que leyó.
  const hydratedRef = useRef(false);
  // Última versión guardada (serializada), para no reescribir el doc con lo
  // mismo que se leyó ni en cada render.
  const lastSavedRef = useRef({ cobrar: null, titles: null });
  // Últimos totales (pagar/cobrar) escritos en el doc del ciclo. Se compara
  // contra este ref y no contra el prop `cycle`, que no se entera de la
  // escritura propia.
  const lastTotalsRef = useRef(null);
  // Popover de columnas visibles (modo cobrar). El botón ancla va como ref
  // para posicionar el popover por portal, sin que el overflow del Modal
  // padre lo recorte.
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const colsBtnRef = useRef(null);
  // Modal de importar ciclos anteriores (modo cobrar): ciclos disponibles y
  // selección.
  const [importOpen, setImportOpen] = useState(false);
  const [availableCycles, setAvailableCycles] = useState([]);
  const [selectedImportIds, setSelectedImportIds] = useState(new Set());
  // Paso 2 de la importación: labores de los ciclos elegidos, para elegir cuáles
  // traer y su labor destino. null = cerrado.
  const [importPlan, setImportPlan] = useState(null);
  const printRef = useRef(null);
  const cycleId = cycle?.id;

  useEffect(() => {
    if (!open || !cycleId) return;
    hydratedRef.current = false;
    let cancelled = false;
    // Valores por defecto para los campos que un resumen guardado no traiga.
    const cobrarDefaults = { labors: {}, carriers: {}, importedLabors: [], withIva: true, discount: 0, discountNote: "", pendingBalance: 0, pendingBalanceNote: "" };
    const titlesDefaults = {
      main: "DETALLE DE JORNADA",
      subtitle: [faena?.name, subfaena?.name, cycle.label].filter(Boolean).join(" · "),
      laborNames: {},
      carrierNames: {},
    };
    (async () => {
      setLoading(true);
      try {
        const [remote, list] = await Promise.all([
          cycleSummariesService.get(cycleId).catch((err) => {
            console.error("[resumen] carga:", err);
            toast.error("No se pudo leer el resumen guardado; se usa la copia local.");
            return null;
          }),
          tripsService.listByCycle(cycleId),
        ]);
        if (cancelled) return;
        setTrips(list);
        const localCobrar = loadJSON(cobrarStorageKey(cycleId), null);
        const localTitles = loadJSON(titlesStorageKey(cycleId), null);
        const nextCobrar = { ...cobrarDefaults, ...(remote?.cobrar || localCobrar || {}) };
        const nextTitles = { ...titlesDefaults, ...(remote?.titles || localTitles || {}) };
        setCobrar(nextCobrar);
        setTitles(nextTitles);
        lastSavedRef.current = { cobrar: JSON.stringify(nextCobrar), titles: JSON.stringify(nextTitles) };
        lastTotalsRef.current = cycle.summaryTotals
          ? { pagar: Number(cycle.summaryTotals.pagar) || 0, cobrar: Number(cycle.summaryTotals.cobrar) || 0 }
          : null;
        setSummaryMeta(remote?.updatedAt ? { email: remote.updatedByEmail, at: remote.updatedAt.toDate?.() || null } : null);
        // Migración: si el ciclo no tiene doc en Firestore pero sí copia local,
        // la sube tal cual, sin avisar.
        if (!remote && (localCobrar || localTitles)) {
          cycleSummariesService
            .save(cycleId, { cobrar: nextCobrar, titles: nextTitles })
            .catch((err) => console.error("[resumen] migración:", err));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[resumen] carga:", err);
          toast.error("No se pudo cargar el resumen: " + (err.message || err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          hydratedRef.current = true;
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycleId, cycle?.label, faena?.name, subfaena?.name]);

  // Guarda en Firestore con debounce de 600 ms, porque el estado cambia tecla
  // por tecla. localStorage se escribe en cada cambio (ver `saveJSON`).
  useEffect(() => {
    if (!open || !cycleId || !hydratedRef.current) return;
    const serialized = JSON.stringify(cobrar);
    if (serialized === lastSavedRef.current.cobrar) return;
    const t = setTimeout(() => {
      lastSavedRef.current.cobrar = serialized;
      cycleSummariesService
        .save(cycleId, { cobrar })
        .then(() => setSummaryMeta({ email: user?.email || null, at: new Date() }))
        .catch((err) => {
          // Así el próximo cambio, o el guardado al cerrar, reintenta en vez
          // de darlo por guardado.
          lastSavedRef.current.cobrar = null;
          console.error("[resumen] guardar cobrar:", err);
          toast.error("No se pudieron guardar las tarifas del resumen.");
        });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrar, open, cycleId]);

  useEffect(() => {
    if (!open || !cycleId || !hydratedRef.current) return;
    const serialized = JSON.stringify(titles);
    if (serialized === lastSavedRef.current.titles) return;
    const t = setTimeout(() => {
      lastSavedRef.current.titles = serialized;
      cycleSummariesService
        .save(cycleId, { titles })
        .then(() => setSummaryMeta({ email: user?.email || null, at: new Date() }))
        .catch((err) => {
          lastSavedRef.current.titles = null;
          console.error("[resumen] guardar títulos:", err);
          toast.error("No se pudieron guardar los títulos del resumen.");
        });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles, open, cycleId]);

  const updateTitles = (patch) => {
    setTitles((prev) => {
      const next = { ...prev, ...patch };
      saveJSON(titlesStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateLaborName = (laborId, name) => {
    setTitles((prev) => {
      const next = { ...prev, laborNames: { ...prev.laborNames, [laborId]: name } };
      saveJSON(titlesStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateCarrierName = (carrierId, name) => {
    setTitles((prev) => {
      const next = { ...prev, carrierNames: { ...prev.carrierNames, [carrierId]: name } };
      saveJSON(titlesStorageKey(cycle?.id), next);
      return next;
    });
  };

  const setCobrarWithIva = (next) => {
    setCobrar((prev) => {
      const n = { ...prev, withIva: !!next };
      saveJSON(cobrarStorageKey(cycle?.id), n);
      return n;
    });
  };

  // Descuento global sobre el neto del cobro (antes del IVA, si está activo).
  // `patch` puede traer `amount` (number) y/o `note` (string). Se guarda con el
  // resto del estado de cobrar del ciclo.
  const setCobrarDiscount = (patch) => {
    setCobrar((prev) => {
      const n = { ...prev };
      if (patch.amount !== undefined) n.discount = Math.max(0, Number(patch.amount) || 0);
      if (patch.note !== undefined) n.discountNote = String(patch.note || "");
      saveJSON(cobrarStorageKey(cycle?.id), n);
      return n;
    });
  };

  // Saldo pendiente global: se suma al total del cobro después del IVA. Igual
  // que en el descuento, `patch` puede traer `amount` y/o `note`.
  const setCobrarPendingBalance = (patch) => {
    setCobrar((prev) => {
      const n = { ...prev };
      if (patch.amount !== undefined) n.pendingBalance = Math.max(0, Number(patch.amount) || 0);
      if (patch.note !== undefined) n.pendingBalanceNote = String(patch.note || "");
      saveJSON(cobrarStorageKey(cycle?.id), n);
      return n;
    });
  };

  const updateCobrarLabor = (laborId, patch) => {
    setCobrar((prev) => {
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...prev.labors[laborId], ...patch } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateCobrarCarrier = (carrierId, patch) => {
    setCobrar((prev) => {
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...prev.carriers[carrierId], ...patch } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };

  // Overrides por fila (cobrar). Cada labor guarda un mapa { rowKey -> patch }
  // con el rowKey de la fila del día: la fecha, o fecha y tier/etapa en trato
  // y tratoEtapas. El patch puede traer qty, overtimeHours, rate, amount,
  // transport o workerCount, todos opcionales; los que faltan toman el valor
  // base. Las filas extra se editan en `extraRows`.
  const updateCobrarLaborRow = (laborId, rowKey, patch) => {
    setCobrar((prev) => {
      const labor = prev.labors[laborId] || {};
      const rowOverrides = { ...(labor.rowOverrides || {}) };
      const existing = rowOverrides[rowKey] || {};
      const merged = { ...existing, ...patch };
      // Si todos los campos quedan vacíos (undefined, null o ""), se quita el override.
      const allEmpty = Object.values(merged).every((v) => v === "" || v == null);
      if (allEmpty) delete rowOverrides[rowKey];
      else rowOverrides[rowKey] = merged;
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, rowOverrides } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const addCobrarLaborExtraRow = (laborId) => {
    setCobrar((prev) => {
      const labor = prev.labors[laborId] || {};
      const extraRows = [...(labor.extraRows || [])];
      const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `x${Date.now()}${Math.random()}`;
      // Las filas extra arrancan con los campos vacíos para que el monto se
      // calcule (qty × rate) al tipear.
      extraRows.push({ id, date: "", qty: "", overtimeHours: "", rate: "", amount: "" });
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, extraRows } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateCobrarLaborExtraRow = (laborId, id, patch) => {
    setCobrar((prev) => {
      const labor = prev.labors[laborId] || {};
      const extraRows = (labor.extraRows || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, extraRows } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const removeCobrarLaborExtraRow = (laborId, id) => {
    setCobrar((prev) => {
      const labor = prev.labors[laborId] || {};
      const extraRows = (labor.extraRows || []).filter((r) => r.id !== id);
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, extraRows } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  // Mismo modelo para transportistas.
  const updateCobrarCarrierRow = (carrierId, rowKey, patch) => {
    setCobrar((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const rowOverrides = { ...(carrier.rowOverrides || {}) };
      const existing = rowOverrides[rowKey] || {};
      const merged = { ...existing, ...patch };
      const allEmpty = Object.values(merged).every((v) => v === "" || v == null);
      if (allEmpty) delete rowOverrides[rowKey];
      else rowOverrides[rowKey] = merged;
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, rowOverrides } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const addCobrarCarrierExtraRow = (carrierId) => {
    setCobrar((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const extraRows = [...(carrier.extraRows || [])];
      const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `x${Date.now()}${Math.random()}`;
      // Campos vacíos, igual que en addCobrarLaborExtraRow.
      extraRows.push({ id, date: "", count: "", rate: "", amount: "" });
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, extraRows } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateCobrarCarrierExtraRow = (carrierId, id, patch) => {
    setCobrar((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const extraRows = (carrier.extraRows || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, extraRows } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const removeCobrarCarrierExtraRow = (carrierId, id) => {
    setCobrar((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const extraRows = (carrier.extraRows || []).filter((r) => r.id !== id);
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, extraRows } } };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };

  // ============================================================
  // Importar ciclos anteriores (modo cobrar)
  // ============================================================
  // Labores ya importadas (ciclo + labor de origen): las de
  // `cobrar.importedLabors` y las filas extra que traen `sourceCycleId`. Una
  // fila extra con ciclo y sin labor de origen cuenta todas las labores de ese
  // ciclo como importadas, para no duplicarlas. El paso de labores las muestra
  // deshabilitadas.
  const importedSources = useMemo(() => {
    const set = new Set();
    for (const imp of cobrar.importedLabors || []) {
      set.add(`${imp.sourceCycleId}|${imp.sourceLaborId}`);
    }
    for (const laborCfg of Object.values(cobrar.labors || {})) {
      for (const er of laborCfg?.extraRows || []) {
        if (er.sourceCycleId) set.add(`${er.sourceCycleId}|${er.sourceLaborId || "*"}`);
      }
    }
    return set;
  }, [cobrar.labors, cobrar.importedLabors]);
  const isLaborImported = (cycleId, laborId) =>
    importedSources.has(`${cycleId}|${laborId}`) || importedSources.has(`${cycleId}|*`);
  const importedCycleIds = useMemo(
    () => new Set([...importedSources].map((k) => k.split("|")[0])),
    [importedSources],
  );

  // Lista los ciclos de la misma faena y subfaena, salvo el actual, en
  // cualquier estado (también se pueden sumar ciclos abiertos), con caché.
  const openImportModal = async () => {
    setImportOpen(true);
    setSelectedImportIds(new Set());
    if (!cycle?.faenaId || !cycle?.subfaenaId) {
      setAvailableCycles([]);
      return;
    }
    try {
      const list = await cyclesService.list({
        wheres: [
          ["faenaId", "==", cycle.faenaId],
          ["subfaenaId", "==", cycle.subfaenaId],
        ],
        cache: true,
        ttl: 5 * 60 * 1000,
      });
      const filtered = list
        .filter((c) => c.id !== cycle.id)
        .sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
      setAvailableCycles(filtered);
    } catch (err) {
      toast.error("Error cargando ciclos: " + (err.message || err));
      setAvailableCycles([]);
    }
  };

  // Paso 1 → 2: lee las jornadas de cada ciclo elegido y arma la lista de sus
  // labores con días (`importPlan`), para elegir cuáles traer.
  const prepareImport = async () => {
    const ids = [...selectedImportIds];
    if (ids.length === 0) {
      setImportOpen(false);
      return;
    }
    setBusy("import");
    try {
      const sourceCycles = await Promise.all(ids.map((id) => cyclesService.getById(id)));
      const allWds = await Promise.all(
        ids.map((id) => workdaysService.list({ wheres: [["cycleId", "==", id]] })),
      );

      const candidates = [];
      for (let i = 0; i < sourceCycles.length; i++) {
        const sCycle = sourceCycles[i];
        if (!sCycle?.labors) continue;
        const laborById = new Map(sCycle.labors.map((l) => [l.id, l]));

        // Mismas claves que la grilla del ciclo (workdayMapKey), que es lo que
        // buildDailyRows lee para separar los tiers de trato y las etapas.
        const wdsBy = new Map();
        for (const wd of allWds[i] || []) {
          if (!wd?.laborId) continue;
          if (!wdsBy.has(wd.laborId)) wdsBy.set(wd.laborId, {});
          const ck = workdayComboKeyOf(wd, laborById.get(wd.laborId)?.type);
          wdsBy.get(wd.laborId)[workdayMapKey(wd.workerRut, wd.date, ck)] = wd;
        }

        for (const sLabor of sCycle.labors) {
          const sDayPrices = sCycle.dayPrices || {};
          const { rows, containers } = buildDailyRows(sLabor, wdsBy.get(sLabor.id) || {}, sDayPrices);
          if (rows.length === 0) continue;
          // Días en rojo de tratoHE con los feriados del ciclo de origen, que
          // este resumen no tiene cargados.
          const redDates = sLabor.type === "tratoHE"
            ? [...new Set(rows
              .filter((r) => r.date && isRedDay(r.date, getDaySingle(sDayPrices, sLabor.id, r.date, "normal")))
              .map((r) => r.date))]
            : [];
          candidates.push({
            key: `${sCycle.id}|${sLabor.id}`,
            cycleId: sCycle.id,
            cycleLabel: sCycle.label || sCycle.id,
            labor: sLabor,
            already: isLaborImported(sCycle.id, sLabor.id),
            // Sin los Set de trabajadores: la copia se guarda en Firestore.
            rows: rows.map((row) => {
              const r = { ...row };
              delete r.workersSet;
              delete r.pisoWorkersSet;
              return r;
            }),
            containers: [...(containers || [])],
            redDates,
          });
        }
      }

      if (candidates.length === 0) {
        toast.warning("Los ciclos elegidos no tienen jornadas cargadas: no hay nada que importar.");
        return;
      }
      setImportOpen(false);
      setImportPlan({ candidates });
    } catch (err) {
      toast.error("Error importando: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  // Paso 2: cada labor elegida entra al resumen como labor propia
  // (`cobrar.importedLabors`), con su tipo de tabla y sumando al total. Se
  // guarda una copia de la definición —sin trabajadores— y de sus filas
  // diarias. `keys` = claves de los candidatos elegidos.
  const applyImport = (keys) => {
    const picked = new Set(keys);
    const newLabors = [];
    for (const c of importPlan?.candidates || []) {
      if (!picked.has(c.key) || c.already) continue;
      const id = `imp_${(typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}${Math.random()}`}`;
      const { workers: _workers, bonusDefaults: _bonus, ...laborDef } = c.labor;
      // El nombre lleva el ciclo de origen (su último tramo) para distinguirla
      // de una labor del ciclo actual con el mismo nombre. Se cambia en
      // "Personalizar títulos".
      const shortCycle = String(c.cycleLabel).split("/").filter(Boolean).pop() || c.cycleLabel;
      newLabors.push({
        id,
        sourceCycleId: c.cycleId,
        sourceCycleLabel: c.cycleLabel,
        sourceLaborId: c.labor.id,
        labor: { ...laborDef, id, name: `${c.labor.name} (${shortCycle})` },
        rows: c.rows,
        containers: c.containers,
        redDates: c.redDates,
      });
    }
    setImportPlan(null);
    if (newLabors.length === 0) return;
    setCobrar((prev) => {
      const next = { ...prev, importedLabors: [...(prev.importedLabors || []), ...newLabors] };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
    const days = newLabors.reduce((s, l) => s + l.rows.length, 0);
    toast.success(
      `${newLabors.length} labor${newLabors.length === 1 ? "" : "es"} importada${newLabors.length === 1 ? "" : "s"} ` +
      `(${days} día${days === 1 ? "" : "s"}). Se suman al total a facturar.`,
    );
  };

  // Quita una labor importada del resumen, con sus tarifas y ajustes. Las
  // labores que estaban juntas con ella vuelven a su tabla propia.
  const removeImportedLabor = (id) => {
    setCobrar((prev) => {
      const labors = {};
      for (const [k, v] of Object.entries(prev.labors || {})) {
        if (k === id) continue;
        labors[k] = v?.mergeInto === id ? { ...v, mergeInto: null } : v;
      }
      const next = {
        ...prev,
        labors,
        importedLabors: (prev.importedLabors || []).filter((l) => l.id !== id),
      };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };

  const toggleImportCycle = (id) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Muestra u oculta una columna en todas las tablas del resumen del ciclo. Se
  // guarda en `cobrar.hiddenColumns: string[]`, con las claves de columna de
  // LaborTable y TransportTable.
  const toggleColumn = (key) => {
    setCobrar((prev) => {
      const set = new Set(prev.hiddenColumns || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      const next = { ...prev, hiddenColumns: [...set] };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const resetColumns = () => {
    setCobrar((prev) => {
      const next = { ...prev, hiddenColumns: [] };
      saveJSON(cobrarStorageKey(cycle?.id), next);
      return next;
    });
  };
  const hiddenColumns = useMemo(() => new Set(cobrar.hiddenColumns || []), [cobrar.hiddenColumns]);

  // ============================================================
  // Datos por labor
  // ============================================================
  const laborsData = useMemo(() => {
    if (!cycle?.labors) return [];
    return cycle.labors.map((l) => {
      const wdMap = workdaysByLabor[l.id] || {};
      const { rows, containers } = buildDailyRows(l, wdMap, dayPrices);
      const totals = laborTotals(rows);
      // Unidades de trato usadas en la labor: si hay una sola, laborQtyUnit la
      // usa como encabezado de columna en vez del tipo de trato.
      const tratoUnitsSet =
        l.type === "trato"
          ? new Set(rows.map((r) => r.unit).filter((u) => u != null))
          : null;
      return {
        labor: l,
        rows,
        totals,
        unit: laborQtyUnit(l, catalogs, containers, tratoUnitsSet),
        containers,
        tratoUnitsSet,
      };
    });
  }, [cycle?.labors, workdaysByLabor, catalogs, dayPrices]);

  // Labores importadas de otros ciclos (solo cobrar). Cada una es una copia
  // guardada en `cobrar.importedLabors` —definición de la labor y sus filas
  // diarias— que se dibuja con su propio tipo de tabla y suma al total, como
  // cualquier labor del ciclo. Su id es propio, así sus tarifas, ajustes y
  // `mergeInto` viven en `cobrar.labors[id]` igual que los de las demás.
  const importedLaborsData = useMemo(() => (cobrar.importedLabors || []).map((imp) => {
    const rows = imp.rows || [];
    const containers = new Set(imp.containers || []);
    const tratoUnitsSet = imp.labor?.type === "trato"
      ? new Set(rows.map((r) => r.unit).filter((u) => u != null))
      : null;
    return {
      labor: imp.labor,
      rows,
      totals: laborTotals(rows),
      unit: laborQtyUnit(imp.labor, catalogs, containers, tratoUnitsSet),
      containers,
      tratoUnitsSet,
      importedFrom: {
        cycleLabel: imp.sourceCycleLabel || "",
        redDates: imp.redDates || [],
      },
    };
  }), [cobrar.importedLabors, catalogs]);

  // Grilla trabajador × día por labor (segunda sección imprimible). Cada
  // labor tiene sus propios botones de copiar e imprimir.
  const laborWorkerGrids = useMemo(() => {
    if (!cycle?.labors) return [];
    return cycle.labors.map((l) => {
      const wdMap = workdaysByLabor[l.id] || {};
      const grid = buildWorkerLaborGrid(l, wdMap);
      return { labor: l, ...grid };
    });
  }, [cycle?.labors, workdaysByLabor]);

  // Transporte agrupado por transportista y fecha.
  const transportData = useMemo(() => {
    const byCarrier = new Map();
    for (const t of trips) {
      const cid = t.carrierId;
      if (!byCarrier.has(cid)) byCarrier.set(cid, { carrierId: cid, byDate: new Map(), totalCount: 0, totalAmount: 0 });
      const g = byCarrier.get(cid);
      if (!g.byDate.has(t.date)) g.byDate.set(t.date, { date: t.date, count: 0, amount: 0 });
      const d = g.byDate.get(t.date);
      d.count += Number(t.qty) || 1;
      d.amount += Number(t.amount) || 0;
      g.totalCount += Number(t.qty) || 1;
      g.totalAmount += Number(t.amount) || 0;
    }
    return [...byCarrier.values()].map((g) => ({
      ...g,
      rows: [...g.byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    }));
  }, [trips]);

  const carrierById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const grandTotalPagar = useMemo(() => {
    let sum = 0;
    for (const ld of laborsData) sum += ld.totals.amount + (ld.totals.pisoAmount || 0);
    for (const tg of transportData) sum += tg.totalAmount;
    return sum;
  }, [laborsData, transportData]);

  // ============================================================
  // Filas de cobro
  // ============================================================
  //
  // La tarifa sugerida es la mediana del precio por día, para que un día
  // atípico (una jornada mensual, por ejemplo) no la corra. El promedio
  // (`meanRate`) se muestra como referencia en el editor de tarifas cuando
  // difiere más de un 10%.
  const cobrarLabors = useMemo(() => {
    return [...laborsData, ...importedLaborsData].map((ld) => {
      const cfg = cobrar.labors[ld.labor.id] || {};
      const include = cfg.include !== false;
      const meanRate = ld.totals.qty > 0 ? Math.round(ld.totals.amount / ld.totals.qty) : 0;
      const perDayRates = (ld.rows || [])
        .filter((r) => (Number(r.qty) || 0) > 0)
        .map((r) => (Number(r.amount) || 0) / (Number(r.qty) || 1));
      const medianRate = Math.round(medianOf(perDayRates));
      const defaultRate = medianRate || meanRate;
      const rate = cfg.chargeRate != null ? Number(cfg.chargeRate) : defaultRate;

      // En trato con varios tiers se sugiere una mediana por tier, porque
      // cada tier suele tener su propio precio. Si la labor tiene tarifa fija
      // (`cfg.chargeRate`), esa manda.
      const tierRateMedians = new Map();
      if (ld.labor.type === "trato") {
        const ratesByTier = new Map();
        for (const r of ld.rows || []) {
          if (r.tierIdx == null) continue;
          const q = Number(r.qty) || 0;
          if (q <= 0) continue;
          const ratesArr = ratesByTier.get(r.tierIdx) || [];
          ratesArr.push((Number(r.amount) || 0) / q);
          ratesByTier.set(r.tierIdx, ratesArr);
        }
        for (const [idx, arr] of ratesByTier) {
          tierRateMedians.set(idx, Math.round(medianOf(arr)));
        }
      }
      const activity = activityLabel(ld.labor, catalogs, ld.containers, ld.tratoUnitsSet);

      // Filas de cobro: las del día con sus overrides, más las filas extra.
      // Cada una trae los valores finales (chargedQty, chargedRate,
      // chargedAmount…), que leen los inputs, los totales y el XLSX.
      const rowOverrides = cfg.rowOverrides || {};
      const extraRows = cfg.extraRows || [];
      const isHE = ld.labor.type === "tratoHE";
      // tratoHE: total = base $ + HE × tarifa HE. Otros: total = qty × rate.
      const computeAmount = (qty, hours, rowRate) =>
        isHE ? Number(qty) + Number(hours) * Number(rowRate) : Number(qty) * Number(rowRate);

      // En trato las filas extra no traen unidad: heredan la más frecuente de
      // las filas del día, para que la métrica diga "212 saco" y no "212".
      let dominantUnit = null;
      if (ld.labor.type === "trato") {
        const unitCounts = new Map();
        for (const r of ld.rows || []) {
          if (r.unit != null) unitCounts.set(r.unit, (unitCounts.get(r.unit) || 0) + 1);
        }
        let maxC = 0;
        for (const [u, c] of unitCounts) {
          if (c > maxC) { maxC = c; dominantUnit = u; }
        }
      }
      const chargedRows = (ld.rows || []).map((r) => {
        // Override de la fila: por `rowKey` (en trato, `${date}__${tierKey}`)
        // y, si no hay, por la fecha sola.
        const newKey = r.rowKey || r.date;
        const ov = rowOverrides[newKey] || rowOverrides[r.date] || {};
        const qty = ov.qty != null && ov.qty !== "" ? Number(ov.qty) : Number(r.qty) || 0;
        const overtimeHours = ov.overtimeHours != null && ov.overtimeHours !== ""
          ? Number(ov.overtimeHours)
          : Number(r.overtimeHours) || 0;
        // Prioridad de tarifa: override de la fila → tarifa fija de la labor
        // (cfg.chargeRate) → en tratoEtapas, el precio real de la fila
        // (amount/qty) → mediana del tier (trato) → tarifa sugerida de la
        // labor.
        const tierDefault = r.tierIdx != null ? tierRateMedians.get(r.tierIdx) : null;
        const etapaRealRate = ld.labor.type === "tratoEtapas" && Number(r.qty) > 0
          ? (Number(r.amount) || 0) / Number(r.qty)
          : null;
        const baseRate = cfg.chargeRate != null
          ? Number(cfg.chargeRate)
          : etapaRealRate != null
            ? etapaRealRate
            : (tierDefault != null && tierDefault > 0 ? tierDefault : rate);
        const rowRate = ov.rate != null && ov.rate !== "" ? Number(ov.rate) : baseRate;
        const computedAmount = computeAmount(qty, overtimeHours, rowRate);
        const amount = ov.amount != null && ov.amount !== "" ? Number(ov.amount) : computedAmount;
        // Transporte por fila: monto manual que se suma al total de la fila y
        // al total a cobrar; si se usa, conviene excluir la tabla del
        // transportista para no cobrarlo dos veces. 0 por defecto.
        const transport = ov.transport != null && ov.transport !== "" ? Number(ov.transport) : 0;
        // Personas: informativa; se puede editar y no afecta montos. Por
        // defecto, el conteo real de trabajadores del día.
        const workerCount = ov.workerCount != null && ov.workerCount !== ""
          ? Number(ov.workerCount)
          : Number(r.workerCount) || 0;
        const hasOverride = Object.keys(ov).length > 0;
        return {
          ...r,
          chargedQty: qty,
          chargedOvertimeHours: overtimeHours,
          chargedRate: rowRate,
          chargedAmount: amount,
          chargedTransport: transport,
          chargedWorkerCount: workerCount,
          rowKey: newKey,
          isExtra: false,
          hasOverride,
          override: ov,
        };
      });
      for (const ex of extraRows) {
        const qty = Number(ex.qty) || 0;
        const overtimeHours = Number(ex.overtimeHours) || 0;
        const rowRate = ex.rate != null && ex.rate !== "" ? Number(ex.rate) : rate;
        const computedAmount = computeAmount(qty, overtimeHours, rowRate);
        const amount = ex.amount != null && ex.amount !== "" ? Number(ex.amount) : computedAmount;
        chargedRows.push({
          date: ex.date || "",
          qty: Number(ex.qty) || 0,
          overtimeHours: Number(ex.overtimeHours) || 0,
          amount: amount,
          // Unidad más frecuente de la labor (solo trato), para que
          // formatRowMetric muestre "X saco" fuera de edición.
          unit: ex.unit != null ? ex.unit : dominantUnit,
          pisoAmount: 0,
          pisoCount: 0,
          chargedQty: qty,
          chargedOvertimeHours: overtimeHours,
          chargedRate: rowRate,
          chargedAmount: amount,
          chargedTransport: Number(ex.transport) || 0,
          chargedWorkerCount: ex.workerCount != null && ex.workerCount !== "" ? Number(ex.workerCount) : 0,
          rowKey: `extra:${ex.id}`,
          isExtra: true,
          extraId: ex.id,
          // Origen de una fila importada, para el rótulo "(de ciclo · labor)".
          sourceCycleLabel: ex.sourceCycleLabel || null,
          sourceLaborName: ex.sourceLaborName || null,
        });
      }
      // Orden por fecha; las filas extra sin fecha van al final.
      chargedRows.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
      let chargedTotalAmount = 0, chargedTotalQty = 0, chargedTotalOvertimeHours = 0,
        chargedTotalTransport = 0, chargedTotalWorkerCount = 0, chargedCountedQty = 0;
      for (const r of chargedRows) {
        chargedTotalAmount += r.chargedAmount;
        chargedTotalQty += r.chargedQty;
        // Unidades (tratoEtapas): solo etapas que cuentan; el resto suma normal.
        if (r.stageCounts === undefined || r.stageCounts) chargedCountedQty += r.chargedQty;
        chargedTotalOvertimeHours += r.chargedOvertimeHours;
        chargedTotalTransport += r.chargedTransport || 0;
        chargedTotalWorkerCount += r.chargedWorkerCount || 0;
      }
      const chargedTotals = {
        amount: chargedTotalAmount,
        qty: chargedTotalQty,
        countedQty: chargedCountedQty,
        overtimeHours: chargedTotalOvertimeHours,
        // Transporte manual por fila: va aparte de amount, así el subtotal de
        // producción no lo incluye y el Total sí.
        transport: chargedTotalTransport,
        pisoAmount: ld.totals.pisoAmount || 0,
        pisoCount: ld.totals.pisoCount || 0,
        // Personas: suma de los conteos por fila (con overrides aplicados —
        // sin ediciones coincide con el dato real).
        workerDays: chargedTotalWorkerCount,
        heTotal: ld.totals.heTotal || 0,
        bonosTotal: ld.totals.bonosTotal || 0,
      };
      return {
        ...ld,
        include,
        rate,
        defaultRate,
        meanRate,
        medianRate,
        activity,
        chargedRows,
        chargedTotals,
        mergeInto: cfg.mergeInto || null,
      };
    });
  }, [laborsData, importedLaborsData, cobrar.labors, catalogs]);

  const cobrarCarriers = useMemo(() => {
    return transportData.map((tg) => {
      const cfg = cobrar.carriers[tg.carrierId] || {};
      const include = cfg.include !== false;
      const defaultRate = tg.totalCount > 0 ? Math.round(tg.totalAmount / tg.totalCount) : 0;
      const rate = cfg.chargeRate != null ? Number(cfg.chargeRate) : defaultRate;

      const rowOverrides = cfg.rowOverrides || {};
      const extraRows = cfg.extraRows || [];
      const chargedRows = (tg.rows || []).map((r) => {
        const ov = rowOverrides[r.date] || {};
        const count = ov.count != null && ov.count !== "" ? Number(ov.count) : Number(r.count) || 0;
        const rowRate = ov.rate != null && ov.rate !== "" ? Number(ov.rate) : rate;
        const computedAmount = count * rowRate;
        const amount = ov.amount != null && ov.amount !== "" ? Number(ov.amount) : computedAmount;
        const hasOverride = Object.keys(ov).length > 0;
        return {
          ...r,
          chargedCount: count,
          chargedRate: rowRate,
          chargedAmount: amount,
          rowKey: r.date,
          isExtra: false,
          hasOverride,
          override: ov,
        };
      });
      for (const ex of extraRows) {
        const count = Number(ex.count) || 0;
        const rowRate = ex.rate != null && ex.rate !== "" ? Number(ex.rate) : rate;
        const computedAmount = count * rowRate;
        const amount = ex.amount != null && ex.amount !== "" ? Number(ex.amount) : computedAmount;
        chargedRows.push({
          date: ex.date || "",
          count: Number(ex.count) || 0,
          amount,
          chargedCount: count,
          chargedRate: rowRate,
          chargedAmount: amount,
          rowKey: `extra:${ex.id}`,
          isExtra: true,
          extraId: ex.id,
        });
      }
      chargedRows.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
      let chargedTotalAmount = 0, chargedTotalCount = 0;
      for (const r of chargedRows) {
        chargedTotalAmount += r.chargedAmount;
        chargedTotalCount += r.chargedCount;
      }
      return { ...tg, include, rate, defaultRate, chargedRows, chargedTotalAmount, chargedTotalCount };
    });
  }, [transportData, cobrar.carriers]);

  // Observaciones por día: las notas de cycle.dayNotesByLabor[laborId][date]
  // y, para las labores sin nota propia ese día, la compartida de
  // cycle.dayNotes[date] (ver CycleDetail). La compartida se emite una vez por
  // día (`shared`), no una vez por labor.
  //
  // Solo en pagar: son apuntes internos, y el resumen de cobrar es el que se
  // manda al cliente.
  const dayNotesSummary = useMemo(() => {
    if (mode !== "pagar") return [];
    const byLabor = cycle?.dayNotesByLabor || {};
    const legacy = cycle?.dayNotes || {};
    const byDate = new Map();
    const bucket = (date) => {
      if (!byDate.has(date)) byDate.set(date, { date, shared: "", entries: [] });
      return byDate.get(date);
    };
    for (const cl of laborsData) {
      const laborId = cl.labor.id;
      const name = titles.laborNames?.[laborId] || cl.labor.name;
      const own = byLabor[laborId] || {};
      // Fechas con producción más las que solo tienen nota propia: un día sin
      // producción también puede llevar una observación.
      const dates = new Set(Object.keys(own));
      for (const r of cl.rows || []) if (r.date) dates.add(r.date);
      for (const date of dates) {
        const propia = String(own[date] || "").trim();
        if (propia) bucket(date).entries.push({ laborId, name, text: propia });
        else {
          const compartida = String(legacy[date] || "").trim();
          if (compartida) bucket(date).shared = compartida;
        }
      }
    }
    return [...byDate.values()]
      .filter((g) => g.shared || g.entries.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [mode, cycle?.dayNotesByLabor, cycle?.dayNotes, laborsData, titles.laborNames]);

  // Subtotal del cobro: labores y transportistas incluidos, sin descuento. Es
  // la fila "Subtotal" del desglose.
  const subtotalCobrar = useMemo(() => {
    let sum = 0;
    // El transporte manual por fila (chargedTotals.transport) suma al cobro
    // junto con la producción de la labor.
    for (const cl of cobrarLabors) if (cl.include) sum += (cl.chargedTotals?.amount || 0) + (cl.chargedTotals?.transport || 0);
    for (const cc of cobrarCarriers) if (cc.include) sum += cc.chargedTotalAmount || 0;
    return sum;
  }, [cobrarLabors, cobrarCarriers]);
  // Neto del cobro: subtotal − descuento, sin bajar de 0. Sobre él se calculan
  // el IVA (19%) y el total con IVA. El saldo pendiente no entra acá: se suma
  // después del IVA (ver el XLSX y PrintableSummary).
  const grandTotalCobrar = useMemo(
    () => Math.max(0, subtotalCobrar - (Number(cobrar.discount) || 0)),
    [subtotalCobrar, cobrar.discount],
  );

  // LaborTable y TransportTable editan una fila con `onEditRow(id, row, patch)`;
  // estos envoltorios mandan el cambio al override de la fila o a la fila
  // extra. Editar un factor (qty, count, rate, overtimeHours) sin pasar
  // `amount` vacía `amount`, para que vuelva a mandar el cálculo (qty × rate,
  // o qty + horas × rate en tratoHE) y no quede fijo el monto anterior.
  const clearAmountIfFactorEdit = (patch, factorKeys) => {
    const editsFactor = factorKeys.some((k) => k in patch);
    return editsFactor && !("amount" in patch) ? { ...patch, amount: "" } : patch;
  };
  const editCobrarLaborRow = (laborId, row, patch) => {
    const finalPatch = clearAmountIfFactorEdit(patch, ["qty", "rate", "overtimeHours"]);
    if (row?.isExtra) updateCobrarLaborExtraRow(laborId, row.extraId, finalPatch);
    // La clave del override es el rowKey de la fila: la fecha, o fecha y
    // tier/etapa en trato y tratoEtapas, así cada tier tiene su override.
    else updateCobrarLaborRow(laborId, row.rowKey || row.date, finalPatch);
  };
  const editCobrarCarrierRow = (carrierId, row, patch) => {
    const finalPatch = clearAmountIfFactorEdit(patch, ["count", "rate"]);
    if (row?.isExtra) updateCobrarCarrierExtraRow(carrierId, row.extraId, finalPatch);
    else updateCobrarCarrierRow(carrierId, row.date, finalPatch);
  };

  // Guarda los totales de pagar y cobrar en `cycle.summaryTotals`, de donde el
  // Dashboard saca el margen por ciclo sin leer `cycleSummaries` (una lectura
  // por ciclo). Solo escribe si cambiaron.
  //
  // `additive: true` actualiza la caché de `cycles` en vez de invalidarla, así
  // las demás pantallas no vuelven a leer la colección.
  const saveCycleTotals = () => {
    const pagar = Math.round(grandTotalPagar);
    const cobrar = Math.round(grandTotalCobrar);
    if (pagar <= 0 && cobrar <= 0) return; // modal cerrado antes de cargar
    const prev = lastTotalsRef.current;
    if (prev && prev.pagar === pagar && prev.cobrar === cobrar) return;
    lastTotalsRef.current = { pagar, cobrar };
    cyclesService
      .update(cycleId, { summaryTotals: { pagar, cobrar, at: new Date().toISOString() } }, { additive: true })
      .catch((err) => {
        lastTotalsRef.current = prev;
        console.error("[resumen] totales del ciclo:", err);
      });
  };

  // Al cerrar o desmontar, guarda lo que quedó pendiente: cerrar cancela el
  // timer del guardado con debounce.
  const flushRef = useRef(null);
  useEffect(() => {
    flushRef.current = () => {
      if (!cycleId || !hydratedRef.current) return;
      const c = JSON.stringify(cobrar);
      const t = JSON.stringify(titles);
      const patch = {};
      if (c !== lastSavedRef.current.cobrar) { patch.cobrar = cobrar; lastSavedRef.current.cobrar = c; }
      if (t !== lastSavedRef.current.titles) { patch.titles = titles; lastSavedRef.current.titles = t; }
      if (Object.keys(patch).length) {
        cycleSummariesService.save(cycleId, patch).catch((err) => {
          lastSavedRef.current = { cobrar: null, titles: null };
          console.error("[resumen] guardar al cerrar:", err);
        });
      }
      saveCycleTotals();
    };
  });
  useEffect(() => {
    if (open) return;
    flushRef.current?.();
  }, [open]);
  useEffect(() => () => flushRef.current?.(), []);

  // ============================================================
  // Imagen e impresión
  // ============================================================
  const filename = `resumen_${mode}_${(cycle?.label || "ciclo").replace(/[/\s]+/g, "_")}.png`;
  // Captura con `scrollWidth`/`scrollHeight`: con tablas anchas, el
  // `offsetWidth` que usaría html-to-image queda cortado al ancho visible del
  // contenedor con scroll.
  const fullCaptureOpts = () => ({
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    width: printRef.current?.scrollWidth || undefined,
    height: printRef.current?.scrollHeight || undefined,
  });
  const runDownload = async () => {
    if (!printRef.current) return;
    setBusy("download");
    try {
      const dataUrl = await captureFullWidthDataUrl(printRef.current, fullCaptureOpts());
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } finally { setBusy(""); }
  };
  const runCopy = async () => {
    if (!printRef.current) return;
    setBusy("copy");
    try {
      const blob = await captureFullWidthBlob(printRef.current, fullCaptureOpts());
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error: " + (err.message || err));
    } finally { setBusy(""); }
  };
  // ============================================================
  // XLSX del resumen consolidado: una hoja por labor, una por transportista y
  // la hoja Total. Cada hoja deja la columna A vacía (mitad de ancho) y la
  // fila 1 vacía; los datos arrancan en B2. Cosecha y trato se desglosan por
  // (día, combo/tier) con precios editables; tratoHE tiene tarifa HE editable
  // y fórmulas Base + HE × tarifa + Extras. Subtotales y total con SUM() para
  // recalcular al editar precios.
  // ============================================================
  const handleXlsxSummary = async () => {
    setBusy("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const colLetter = (n) => {
        let s = "";
        while (n > 0) {
          const m = (n - 1) % 26;
          s = String.fromCharCode(65 + m) + s;
          n = Math.floor((n - 1) / 26);
        }
        return s;
      };
      const usedNames = new Set();
      const safeName = (s) => {
        let base = String(s || "Hoja").substring(0, 28).replace(/[\\/?*[\]]/g, "_");
        let name = base, i = 2;
        while (usedNames.has(name)) {
          name = `${base} ${i}`.substring(0, 31);
          i++;
        }
        usedNames.add(name);
        return name;
      };
      const moneyFmt = '"$"#,##0;[Red]-"$"#,##0';
      const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9DC3E6" } };
      const subtotalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      const editableFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      const transportFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE5D6" } };
      const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA9D08E" } };

      const laborsForMode = mode === "cobrar" ? cobrarLabors : laborsData;
      const carriersForMode = mode === "cobrar" ? cobrarCarriers : transportData;

      // Para la hoja Total: { displayName, sheetName, totalRef, fallback } por hoja.
      const sheetTotals = [];

      // ============ HOJAS DE LABORES ============
      for (const ld of laborsForMode) {
        if (mode === "cobrar" && !ld.include) continue;
        // Las labores importadas de otro ciclo no van al Excel: su desglose
        // por combo o tier se arma releyendo las jornadas de este ciclo.
        if (ld.importedFrom) continue;
        const labor = ld.labor;
        if (!ld.rows || ld.rows.length === 0) continue;
        const displayName = titles.laborNames?.[labor.id] || labor.name;
        const sheetName = safeName(displayName);
        const ws = wb.addWorksheet(sheetName);
        ws.getColumn(1).width = 6;

        // Título en B2
        ws.getCell("B2").value = displayName;
        ws.getCell("B2").font = { bold: true, size: 14 };

        const isCosecha = labor.type === "cosecha";
        const isTrato = labor.type === "trato";
        const isHE = labor.type === "tratoHE";

        // Días en rojo en la columna Fecha (solo tratoHE): fines de semana y
        // feriados.
        const redDates = new Set();
        if (isHE) {
          for (const r of ld.rows) {
            const cfg = getDaySingle(dayPrices, labor.id, r.date, "normal");
            if (isRedDay(r.date, cfg)) redDates.add(r.date);
          }
        }

        if (isCosecha || isTrato) {
          // Estructura: B Fecha | C Combo/Tier | D Cantidad | E Precio | F Total
          // En cobrar, una sola tarifa editable en C3 que todas las filas referencian.
          let chargeRef = null;
          if (mode === "cobrar") {
            ws.getCell("B3").value = "Tarifa cobro:";
            ws.getCell("B3").font = { bold: true };
            const c3 = ws.getCell("C3");
            c3.value = Number(ld.rate) || 0;
            c3.numFmt = moneyFmt;
            c3.fill = editableFill;
            chargeRef = "$C$3";
          }

          const HEADER_ROW = mode === "cobrar" ? 5 : 4;
          const headerCells = ["B", "C", "D", "E", "F"];
          const headers = ["Fecha", isCosecha ? "Combo (Calidad / Envase)" : "Tipo de precio", "Cantidad", "Precio", "Total"];
          headerCells.forEach((col, i) => {
            const c = ws.getCell(`${col}${HEADER_ROW}`);
            c.value = headers[i];
            c.font = { bold: true };
            c.fill = headerFill;
            c.alignment = { horizontal: i === 0 || i === 1 ? "left" : "right" };
          });

          // Construir filas desglosadas por (fecha, combo/tier).
          const wdMap = workdaysByLabor[labor.id] || {};
          const dayMap = new Map();
          for (const k in wdMap) {
            const wd = wdMap[k];
            if (wd?.pisoOnly) continue;
            let key, label, qty;
            if (isCosecha) {
              const qx = Number(wd.qualityX) || 0;
              const cy = Number(wd.containerY) || 0;
              key = `${qx}_${cy}`;
              label = `${qualityLabel(catalogs, qx)} / ${containerLabel(catalogs, cy)}`;
              qty = Number(wd.qty) || 0;
            } else {
              const parts = String(k).split("__");
              key = parts[2] || "t0";
              const t = getTratoTierTotals(wd);
              const tiers = getTratoTiers(dayPrices, labor.id, wd.date);
              const tier = tiers.find((x) => x.key === key);
              const unitLabel = tier?.unit != null ? tratoUnitLabel(catalogs, tier.unit) : null;
              label = unitLabel || `Precio ${Number(key.replace(/^t/, "")) + 1}`;
              qty = t.qty;
            }
            if (qty <= 0) continue;
            if (!dayMap.has(wd.date)) dayMap.set(wd.date, new Map());
            const m = dayMap.get(wd.date);
            if (!m.has(key)) m.set(key, { key, label, qty: 0 });
            m.get(key).qty += qty;
          }

          const sortedDates = [...dayMap.keys()].sort();
          let curRow = HEADER_ROW + 1;
          const dataStartRow = curRow;
          for (const date of sortedDates) {
            const items = [...dayMap.get(date).values()].sort((a, b) => a.label.localeCompare(b.label));
            for (const it of items) {
              const dateCell = ws.getCell(`B${curRow}`);
              dateCell.value = dateLabel(date);
              ws.getCell(`C${curRow}`).value = it.label;
              const qCell = ws.getCell(`D${curRow}`);
              qCell.value = it.qty;
              qCell.numFmt = "#,##0.##";
              qCell.alignment = { horizontal: "right" };
              const pCell = ws.getCell(`E${curRow}`);
              if (mode === "cobrar") {
                pCell.value = { formula: chargeRef, result: Number(ld.rate) || 0 };
              } else {
                let price = 0;
                if (isCosecha) {
                  const list = getDayCombos(dayPrices, labor.id, date, "unit");
                  const hit = list.find((c) => c.key === it.key);
                  price = Number(hit?.price) || 0;
                } else {
                  const list = getTratoTiers(dayPrices, labor.id, date, "unit");
                  const hit = list.find((c) => c.key === it.key);
                  price = Number(hit?.price) || 0;
                }
                pCell.value = price;
                pCell.fill = editableFill;
              }
              pCell.numFmt = moneyFmt;
              const tCell = ws.getCell(`F${curRow}`);
              const priceResult = mode === "cobrar"
                ? Number(ld.rate) || 0
                : Number(pCell.value) || 0;
              tCell.value = { formula: `D${curRow}*E${curRow}`, result: it.qty * priceResult };
              tCell.numFmt = moneyFmt;
              curRow++;
            }
          }
          const dataEndRow = curRow - 1;

          // Subtotal
          const subRow = curRow;
          for (const col of headerCells) {
            ws.getCell(`${col}${subRow}`).fill = subtotalFill;
            ws.getCell(`${col}${subRow}`).font = { bold: true };
          }
          ws.getCell(`B${subRow}`).value = "Subtotal";
          if (dataEndRow >= dataStartRow) {
            ws.getCell(`D${subRow}`).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})`, result: 0 };
            ws.getCell(`D${subRow}`).numFmt = "#,##0.##";
            ws.getCell(`F${subRow}`).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})`, result: ld.totals.amount };
            ws.getCell(`F${subRow}`).numFmt = moneyFmt;
          }
          const fallbackCos = mode === "cobrar" ? (ld.chargedTotals?.amount ?? ld.totals.amount) : ld.totals.amount;
          sheetTotals.push({ displayName, sheetName, totalRef: `'${sheetName}'!$F$${subRow}`, fallback: fallbackCos });

          ws.getColumn(2).width = 14;
          ws.getColumn(3).width = 30;
          ws.getColumn(4).width = 12;
          ws.getColumn(5).width = 12;
          ws.getColumn(6).width = 14;
          ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
        }
        else if (isHE) {
          // tratoHE: B Fecha | C Base $ | D HE (hrs) | E Tarifa HE (ref) | F Extras $ | G Total
          // Tarifa HE editable en C3.
          ws.getCell("B3").value = "Tarifa HE:";
          ws.getCell("B3").font = { bold: true };
          const c3 = ws.getCell("C3");
          // Tarifa HE inicial: (monto − base) / horas HE, o 0 si no hay horas.
          const totalHE = ld.totals.overtimeHours || 0;
          const implicitRate = totalHE > 0 ? Math.round(ld.totals.amount - ld.totals.qty) / Math.max(totalHE, 1) : 0;
          c3.value = totalHE > 0 ? Math.max(0, Math.round(implicitRate)) : 0;
          c3.numFmt = moneyFmt;
          c3.fill = editableFill;
          const heRateRef = "$C$3";

          const HEADER_ROW = 5;
          const cols = ["B", "C", "D", "E", "F", "G"];
          const headers = ["Fecha", "Base $", "HE (hrs)", "Tarifa HE", "Extras $", "Total $"];
          cols.forEach((col, i) => {
            const c = ws.getCell(`${col}${HEADER_ROW}`);
            c.value = headers[i];
            c.font = { bold: true };
            c.fill = headerFill;
            c.alignment = { horizontal: i === 0 ? "left" : "right" };
          });

          let curRow = HEADER_ROW + 1;
          const dataStartRow = curRow;
          // En cobrar, chargedRows (con overrides y filas extra).
          const heRows = mode === "cobrar" ? (ld.chargedRows || ld.rows) : ld.rows;
          for (const r of heRows) {
            const isRed = redDates.has(r.date);
            const dCell = ws.getCell(`B${curRow}`);
            dCell.value = r.date ? dateLabel(r.date) : (r.isExtra ? "(ajuste)" : "");
            if (isRed) dCell.font = { bold: true, color: { argb: "FFCC0000" } };

            const baseV = mode === "cobrar" ? Number(r.chargedQty) || 0 : Number(r.qty) || 0;
            const heHrs = mode === "cobrar" ? Number(r.chargedOvertimeHours) || 0 : Number(r.overtimeHours) || 0;
            const heAmt = heHrs * (Number(c3.value) || 0);
            const amountForExtras = mode === "cobrar" ? Number(r.chargedAmount) || 0 : Number(r.amount) || 0;
            const extras = Math.max(0, amountForExtras - baseV - heAmt);

            const base = ws.getCell(`C${curRow}`);
            base.value = baseV;
            base.numFmt = moneyFmt;
            const he = ws.getCell(`D${curRow}`);
            he.value = heHrs;
            he.numFmt = "#,##0.##";
            const rate = ws.getCell(`E${curRow}`);
            rate.value = { formula: heRateRef, result: Number(c3.value) || 0 };
            rate.numFmt = moneyFmt;
            const ex = ws.getCell(`F${curRow}`);
            ex.value = extras;
            ex.numFmt = moneyFmt;
            ex.fill = editableFill;
            const tot = ws.getCell(`G${curRow}`);
            tot.value = {
              formula: `C${curRow}+D${curRow}*${heRateRef}+F${curRow}`,
              result: baseV + heAmt + extras,
            };
            tot.numFmt = moneyFmt;
            curRow++;
          }
          const dataEndRow = curRow - 1;

          const subRow = curRow;
          for (const col of cols) {
            ws.getCell(`${col}${subRow}`).fill = subtotalFill;
            ws.getCell(`${col}${subRow}`).font = { bold: true };
          }
          ws.getCell(`B${subRow}`).value = "Subtotal";
          if (dataEndRow >= dataStartRow) {
            ws.getCell(`C${subRow}`).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})`, result: 0 };
            ws.getCell(`C${subRow}`).numFmt = moneyFmt;
            ws.getCell(`D${subRow}`).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})`, result: 0 };
            ws.getCell(`D${subRow}`).numFmt = "#,##0.##";
            ws.getCell(`F${subRow}`).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})`, result: 0 };
            ws.getCell(`F${subRow}`).numFmt = moneyFmt;
            ws.getCell(`G${subRow}`).value = { formula: `SUM(G${dataStartRow}:G${dataEndRow})`, result: ld.totals.amount };
            ws.getCell(`G${subRow}`).numFmt = moneyFmt;
          }
          const fallbackHE = mode === "cobrar" ? (ld.chargedTotals?.amount ?? ld.totals.amount) : ld.totals.amount;
          sheetTotals.push({ displayName, sheetName, totalRef: `'${sheetName}'!$G$${subRow}`, fallback: fallbackHE });

          ws.getColumn(2).width = 14;
          ws.getColumn(3).width = 14;
          ws.getColumn(4).width = 12;
          ws.getColumn(5).width = 12;
          ws.getColumn(6).width = 14;
          ws.getColumn(7).width = 14;
          ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
        }
        else {
          // main / supervision / extra (y tratoEtapas): B Fecha | C Jornadas | D $ jornada | E Total
          // En cobrar, C3 muestra la tarifa de la labor y cada fila lleva la suya.
          let chargeRef = null;
          if (mode === "cobrar") {
            ws.getCell("B3").value = "Tarifa cobro:";
            ws.getCell("B3").font = { bold: true };
            const c3 = ws.getCell("C3");
            c3.value = Number(ld.rate) || 0;
            c3.numFmt = moneyFmt;
            c3.fill = editableFill;
            chargeRef = "$C$3";
          }

          const HEADER_ROW = mode === "cobrar" ? 5 : 4;
          const cols = ["B", "C", "D", "E"];
          const headers = ["Fecha", "Jornadas", "$ por jornada", "Total"];
          cols.forEach((col, i) => {
            const c = ws.getCell(`${col}${HEADER_ROW}`);
            c.value = headers[i];
            c.font = { bold: true };
            c.fill = headerFill;
            c.alignment = { horizontal: i === 0 ? "left" : "right" };
          });

          let curRow = HEADER_ROW + 1;
          const dataStartRow = curRow;
          // En cobrar, chargedRows (con overrides y filas extra).
          const simpleRows = mode === "cobrar" ? (ld.chargedRows || ld.rows) : ld.rows;
          for (const r of simpleRows) {
            ws.getCell(`B${curRow}`).value = r.date ? dateLabel(r.date) : (r.isExtra ? "(ajuste)" : "");
            const qCell = ws.getCell(`C${curRow}`);
            const qtyV = mode === "cobrar" ? Number(r.chargedQty) || 0 : Number(r.qty) || 0;
            qCell.value = qtyV;
            qCell.numFmt = "#,##0";
            const pCell = ws.getCell(`D${curRow}`);
            if (mode === "cobrar") {
              // En cobrar la tarifa puede tener override por fila: va el valor
              // literal, sin referenciar $C$3.
              pCell.value = Number(r.chargedRate) || 0;
              pCell.fill = editableFill;
            } else {
              const rate = r.qty > 0 ? Math.round(r.amount / r.qty) : 0;
              pCell.value = rate;
              pCell.fill = editableFill;
            }
            pCell.numFmt = moneyFmt;
            const tCell = ws.getCell(`E${curRow}`);
            const amountResult = mode === "cobrar" ? Number(r.chargedAmount) || 0 : Number(r.amount) || 0;
            tCell.value = { formula: `C${curRow}*D${curRow}`, result: amountResult };
            tCell.numFmt = moneyFmt;
            curRow++;
          }
          const dataEndRow = curRow - 1;

          const subRow = curRow;
          for (const col of cols) {
            ws.getCell(`${col}${subRow}`).fill = subtotalFill;
            ws.getCell(`${col}${subRow}`).font = { bold: true };
          }
          ws.getCell(`B${subRow}`).value = "Subtotal";
          if (dataEndRow >= dataStartRow) {
            ws.getCell(`C${subRow}`).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})`, result: 0 };
            ws.getCell(`C${subRow}`).numFmt = "#,##0";
            ws.getCell(`E${subRow}`).value = { formula: `SUM(E${dataStartRow}:E${dataEndRow})`, result: ld.totals.amount };
            ws.getCell(`E${subRow}`).numFmt = moneyFmt;
          }
          const fallbackSimple = mode === "cobrar" ? (ld.chargedTotals?.amount ?? ld.totals.amount) : ld.totals.amount;
          sheetTotals.push({ displayName, sheetName, totalRef: `'${sheetName}'!$E$${subRow}`, fallback: fallbackSimple });

          ws.getColumn(2).width = 14;
          ws.getColumn(3).width = 12;
          ws.getColumn(4).width = 14;
          ws.getColumn(5).width = 14;
          ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
        }
      }

      // ============ HOJAS DE TRANSPORTE ============
      for (const tg of carriersForMode) {
        if (mode === "cobrar" && !tg.include) continue;
        if (!tg.rows || tg.rows.length === 0) continue;
        const fallbackName = carrierById.get(tg.carrierId)?.alias || carrierById.get(tg.carrierId)?.name || "(transportista)";
        const displayName = titles.carrierNames?.[tg.carrierId] || fallbackName;
        const sheetName = safeName(`🚐 ${displayName}`);
        const ws = wb.addWorksheet(sheetName);
        ws.getColumn(1).width = 6;

        ws.getCell("B2").value = `🚐 ${displayName}`;
        ws.getCell("B2").font = { bold: true, size: 14 };

        let chargeRef = null;
        if (mode === "cobrar") {
          ws.getCell("B3").value = "Tarifa cobro:";
          ws.getCell("B3").font = { bold: true };
          const c3 = ws.getCell("C3");
          c3.value = Number(tg.rate) || 0;
          c3.numFmt = moneyFmt;
          c3.fill = editableFill;
          chargeRef = "$C$3";
        }

        const HEADER_ROW = mode === "cobrar" ? 5 : 4;
        const cols = ["B", "C", "D", "E"];
        const headers = ["Fecha", "Vueltas", "Precio", "Total"];
        cols.forEach((col, i) => {
          const c = ws.getCell(`${col}${HEADER_ROW}`);
          c.value = headers[i];
          c.font = { bold: true };
          c.fill = transportFill;
          c.alignment = { horizontal: i === 0 ? "left" : "right" };
        });

        let curRow = HEADER_ROW + 1;
        const dataStartRow = curRow;
        const carrierRows = mode === "cobrar" ? (tg.chargedRows || tg.rows) : tg.rows;
        for (const r of carrierRows) {
          ws.getCell(`B${curRow}`).value = r.date ? dateLabel(r.date) : (r.isExtra ? "(ajuste)" : "");
          const qCell = ws.getCell(`C${curRow}`);
          const countV = mode === "cobrar" ? Number(r.chargedCount) || 0 : Number(r.count) || 0;
          qCell.value = countV;
          qCell.numFmt = "#,##0";
          const pCell = ws.getCell(`D${curRow}`);
          if (mode === "cobrar") {
            pCell.value = Number(r.chargedRate) || 0;
            pCell.fill = editableFill;
          } else {
            const rate = r.count > 0 ? Math.round(r.amount / r.count) : 0;
            pCell.value = rate;
            pCell.fill = editableFill;
          }
          pCell.numFmt = moneyFmt;
          const tCell = ws.getCell(`E${curRow}`);
          const amountV = mode === "cobrar" ? Number(r.chargedAmount) || 0 : Number(r.amount) || 0;
          tCell.value = { formula: `C${curRow}*D${curRow}`, result: amountV };
          tCell.numFmt = moneyFmt;
          curRow++;
        }
        const dataEndRow = curRow - 1;

        const subRow = curRow;
        for (const col of cols) {
          ws.getCell(`${col}${subRow}`).fill = subtotalFill;
          ws.getCell(`${col}${subRow}`).font = { bold: true };
        }
        ws.getCell(`B${subRow}`).value = "Subtotal";
        const totalAmountForSheet = mode === "cobrar" ? (tg.chargedTotalAmount || 0) : tg.totalAmount;
        if (dataEndRow >= dataStartRow) {
          ws.getCell(`C${subRow}`).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})`, result: 0 };
          ws.getCell(`C${subRow}`).numFmt = "#,##0";
          ws.getCell(`E${subRow}`).value = { formula: `SUM(E${dataStartRow}:E${dataEndRow})`, result: totalAmountForSheet };
          ws.getCell(`E${subRow}`).numFmt = moneyFmt;
        }
        const fallbackTotal = mode === "cobrar" ? (tg.chargedTotalAmount || 0) : tg.totalAmount;
        sheetTotals.push({ displayName: `🚐 ${displayName}`, sheetName, totalRef: `'${sheetName}'!$E$${subRow}`, fallback: fallbackTotal });

        ws.getColumn(2).width = 14;
        ws.getColumn(3).width = 12;
        ws.getColumn(4).width = 12;
        ws.getColumn(5).width = 14;
        ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
      }

      // ============ HOJA TOTAL GENERAL ============
      // Transporte manual por fila (cobrar): las hojas por labor no tienen esa
      // columna, así que va como línea propia en el Total, igual que en
      // subtotalCobrar.
      if (mode === "cobrar") {
        let laborTransportSum = 0;
        for (const ld of laborsForMode) {
          if (!ld.include) continue;
          laborTransportSum += Number(ld.chargedTotals?.transport) || 0;
        }
        if (laborTransportSum > 0) {
          sheetTotals.push({ displayName: "Transporte (ajustes en labores)", totalRef: null, fallback: laborTransportSum });
        }
      }
      const wsTotal = wb.addWorksheet(safeName("Total"));
      wsTotal.getColumn(1).width = 6;
      wsTotal.getCell("B2").value = mode === "cobrar"
        ? (cobrar.withIva !== false ? "TOTAL A FACTURAR" : "TOTAL A COBRAR (sin IVA)")
        : "TOTAL GENERAL";
      wsTotal.getCell("B2").font = { bold: true, size: 14 };

      const HR = 4;
      const headerCols = ["B", "C"];
      ["Concepto", "Subtotal"].forEach((h, i) => {
        const c = wsTotal.getCell(`${headerCols[i]}${HR}`);
        c.value = h;
        c.font = { bold: true };
        c.fill = headerFill;
        c.alignment = { horizontal: i === 0 ? "left" : "right" };
      });

      let totalRow = HR + 1;
      const totalStart = totalRow;
      for (const st of sheetTotals) {
        wsTotal.getCell(`B${totalRow}`).value = st.displayName;
        const ref = wsTotal.getCell(`C${totalRow}`);
        // Entradas sin hoja propia (ej. transporte manual) van como literal.
        ref.value = st.totalRef ? { formula: st.totalRef, result: st.fallback } : st.fallback;
        ref.numFmt = moneyFmt;
        totalRow++;
      }
      const totalEnd = totalRow - 1;

      // Con descuento (cobrar) van las filas Subtotal y Descuento antes del
      // total, que queda en subtotal − descuento. El IVA, si está activo, se
      // calcula sobre ese total.
      const discountValue = mode === "cobrar" ? Math.max(0, Number(cobrar.discount) || 0) : 0;
      const discountNoteValue = mode === "cobrar" ? (cobrar.discountNote || "") : "";
      const pendingValue = mode === "cobrar" ? Math.max(0, Number(cobrar.pendingBalance) || 0) : 0;
      const pendingNoteValue = mode === "cobrar" ? (cobrar.pendingBalanceNote || "") : "";
      let subtotalRow = null;
      let discountRow = null;
      // Antes del total solo entra el descuento; el saldo pendiente se suma
      // después del IVA, al final.
      if (discountValue > 0) {
        subtotalRow = totalRow;
        wsTotal.getCell(`B${subtotalRow}`).value = "Subtotal";
        wsTotal.getCell(`B${subtotalRow}`).font = { bold: true };
        const sub = wsTotal.getCell(`C${subtotalRow}`);
        if (totalEnd >= totalStart) {
          sub.value = { formula: `SUM(C${totalStart}:C${totalEnd})`, result: subtotalCobrar };
        } else {
          sub.value = 0;
        }
        sub.numFmt = moneyFmt;
        sub.font = { bold: true };
        totalRow++;

        discountRow = totalRow;
        wsTotal.getCell(`B${discountRow}`).value = discountNoteValue
          ? `Descuento · ${discountNoteValue}`
          : "Descuento";
        wsTotal.getCell(`B${discountRow}`).font = { bold: true, color: { argb: "FFBB0000" } };
        const disc = wsTotal.getCell(`C${discountRow}`);
        disc.value = -discountValue;
        disc.numFmt = moneyFmt;
        disc.font = { bold: true, color: { argb: "FFBB0000" } };
        totalRow++;
      }

      const grandRow = totalRow;
      wsTotal.getCell(`B${grandRow}`).value = mode === "cobrar"
        ? (cobrar.withIva !== false ? "TOTAL A FACTURAR" : "TOTAL A COBRAR (sin IVA)")
        : "TOTAL GENERAL";
      wsTotal.getCell(`B${grandRow}`).font = { bold: true };
      wsTotal.getCell(`B${grandRow}`).fill = titleFill;
      const grand = wsTotal.getCell(`C${grandRow}`);
      const grandFallback = mode === "cobrar" ? grandTotalCobrar : grandTotalPagar;
      if (subtotalRow != null && discountRow != null) {
        grand.value = { formula: `C${subtotalRow}+C${discountRow}`, result: grandFallback };
      } else if (totalEnd >= totalStart) {
        grand.value = { formula: `SUM(C${totalStart}:C${totalEnd})`, result: grandFallback };
      } else {
        grand.value = 0;
      }
      grand.numFmt = moneyFmt;
      grand.font = { bold: true, size: 12 };
      grand.fill = titleFill;

      // En cobrar con IVA van debajo las filas Valor IVA (19%) e IVA incluido.
      let postIvaRow = grandRow; // fila a la que se suma el saldo pendiente
      const postIvaFallback = (cobrar.withIva !== false)
        ? Math.round((Number(grandFallback) || 0) * 1.19)
        : Number(grandFallback) || 0;
      if (mode === "cobrar" && cobrar.withIva !== false) {
        const ivaRow = grandRow + 1;
        wsTotal.getCell(`B${ivaRow}`).value = "Valor IVA (19%)";
        wsTotal.getCell(`B${ivaRow}`).font = { bold: true };
        const iva = wsTotal.getCell(`C${ivaRow}`);
        iva.value = { formula: `ROUND(C${grandRow}*0.19,0)`, result: Math.round((Number(grandFallback) || 0) * 0.19) };
        iva.numFmt = moneyFmt;
        iva.font = { bold: true };

        const totIvaRow = grandRow + 2;
        wsTotal.getCell(`B${totIvaRow}`).value = "IVA incluido";
        wsTotal.getCell(`B${totIvaRow}`).font = { bold: true, size: 12 };
        wsTotal.getCell(`B${totIvaRow}`).fill = titleFill;
        const totIva = wsTotal.getCell(`C${totIvaRow}`);
        totIva.value = { formula: `C${grandRow}+C${ivaRow}`, result: postIvaFallback };
        totIva.numFmt = moneyFmt;
        totIva.font = { bold: true, size: 12 };
        totIva.fill = titleFill;
        postIvaRow = totIvaRow;
        totalRow = totIvaRow + 1;
      } else {
        totalRow = grandRow + 1;
      }

      // Saldo pendiente, después del IVA: con saldo > 0 van la fila del saldo y
      // TOTAL FINAL = total con IVA (o neto, sin IVA) + saldo.
      if (mode === "cobrar" && pendingValue > 0) {
        const pendingRow = totalRow;
        wsTotal.getCell(`B${pendingRow}`).value = pendingNoteValue
          ? `Saldo pendiente · ${pendingNoteValue}`
          : "Saldo pendiente";
        wsTotal.getCell(`B${pendingRow}`).font = { bold: true, color: { argb: "FF0A7D3B" } };
        const pend = wsTotal.getCell(`C${pendingRow}`);
        pend.value = pendingValue;
        pend.numFmt = moneyFmt;
        pend.font = { bold: true, color: { argb: "FF0A7D3B" } };
        totalRow++;

        const finalRow = totalRow;
        wsTotal.getCell(`B${finalRow}`).value = "TOTAL FINAL";
        wsTotal.getCell(`B${finalRow}`).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        wsTotal.getCell(`B${finalRow}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF6AA84F" },
        };
        const fin = wsTotal.getCell(`C${finalRow}`);
        fin.value = { formula: `C${postIvaRow}+C${pendingRow}`, result: postIvaFallback + pendingValue };
        fin.numFmt = moneyFmt;
        fin.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        fin.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF6AA84F" },
        };
      }

      wsTotal.getColumn(2).width = 32;
      wsTotal.getColumn(3).width = 16;

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resumen_${mode}_${(cycle?.label || "ciclo").replace(/[/\s]+/g, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Error al exportar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const runPrint = () => {
    if (!printRef.current) return;
    const html = printRef.current.outerHTML;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${titles.main} — ${cycle?.label || ""}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #888; padding: 6px 8px; font-size: 12px; }
        /* Repetir el encabezado de la tabla en cada hoja nueva cuando la
           tabla excede la página (Chrome/Firefox). */
        thead { display: table-header-group; }
        tfoot { display: table-row-group; }
        tr { page-break-inside: avoid; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 350);
  };

  // Copiar / PNG / Imprimir rasterizan o imprimen el nodo `printRef` tal como
  // está, así que en modo edición saldrían con los inputs, los botones +/✕ y
  // la marca de agua. El Excel no pasa por acá: se arma desde los datos, sale
  // limpio esté como esté la pantalla.
  const CAPTURE_LABELS = {
    copy: { verb: "copiar la imagen", confirm: "Bloquear y copiar" },
    download: { verb: "descargar el PNG", confirm: "Bloquear y descargar" },
    print: { verb: "imprimir", confirm: "Bloquear e imprimir" },
  };
  const runCapture = (kind) => {
    if (kind === "copy") return runCopy();
    if (kind === "download") return runDownload();
    return runPrint();
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

  const captureLocked = mode === "cobrar" && editMode;
  const lockedHint = "El resumen está en modo edición — se va a pedir bloquearlo antes de generar la imagen.";
  const requestCapture = (kind) => {
    if (captureLocked) {
      setCaptureAsk(kind);
      return;
    }
    runCapture(kind);
  };

  // Tras "Bloquear y …", espera dos requestAnimationFrame antes de capturar:
  // el DOM tiene que reflejar el modo bloqueado.
  useEffect(() => {
    if (!pendingCapture || editMode) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        if (cancelled) return;
        try {
          await runCapture(pendingCapture);
        } finally {
          setPendingCapture(null);
        }
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCapture, editMode]);

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
          <button onClick={() => requestCapture("copy")} disabled={busy === "copy"} title={captureLocked ? lockedHint : undefined} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {busy === "copy" ? "Copiando..." : "📋 Copiar imagen"}
          </button>
          <button onClick={() => requestCapture("download")} disabled={busy === "download"} title={captureLocked ? lockedHint : undefined} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {busy === "download" ? "Descargando..." : "📥 Descargar PNG"}
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
            onClick={() => setMode("pagar")}
            className={`px-3 py-1.5 ${mode === "pagar" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
          >
            Para pagar
          </button>
          <button
            onClick={() => setMode("cobrar")}
            className={`px-3 py-1.5 ${mode === "cobrar" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
          >
            Para cobrar
          </button>
        </div>
        {mode === "cobrar" && (
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
        {(mode !== "cobrar" || editMode) && (
          <button
            onClick={() => setShowTitleEditor((v) => !v)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            {showTitleEditor ? "▾" : "▸"} Personalizar títulos
          </button>
        )}
        {mode === "cobrar" && editMode && (
          <button
            onClick={() => setShowCobrarEditor((v) => !v)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            {showCobrarEditor ? "▾" : "▸"} Editar tarifas cobro
          </button>
        )}
        {mode === "cobrar" && editMode && (
          <button
            onClick={openImportModal}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            title="Agregar días de otros ciclos de la misma faena/subfaena"
          >
            📥 Importar ciclos anteriores
          </button>
        )}
        {mode === "cobrar" && (
          <button
            onClick={() => setCobrarWithIva(!cobrar.withIva)}
            className={`rounded-md border px-2 py-1 text-xs ${cobrar.withIva ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"}`}
            title={cobrar.withIva
              ? "El total se cobra con IVA (19% calculado abajo). Click para cambiar a sin IVA."
              : "El total se cobra sin IVA (servicios exentos / acuerdos netos). Click para activar IVA."}
          >
            {cobrar.withIva ? "💰 Con IVA" : "🚫 Sin IVA"}
          </button>
        )}
        {mode === "cobrar" && (
          <>
            <button
              ref={colsBtnRef}
              onClick={() => setColsMenuOpen((v) => !v)}
              className={`rounded-md border px-2 py-1 text-xs ${hiddenColumns.size > 0 ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"}`}
              title="Mostrar / ocultar columnas"
            >
              👁 Columnas{hiddenColumns.size > 0 ? ` (${hiddenColumns.size} ocultas)` : ""}
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
              {fmtCurrency(mode === "cobrar" ? grandTotalCobrar : grandTotalPagar)}
            </span>
          </span>
        </span>
      </div>

      {(mode !== "cobrar" || editMode) && showTitleEditor && (
        <TitlesEditor
          titles={titles}
          labors={[...(cycle?.labors || []), ...(cobrar.importedLabors || []).map((imp) => imp.labor)]}
          carriers={transportData.map((t) => ({ id: t.carrierId, label: carrierById.get(t.carrierId)?.alias || t.carrierId }))}
          onChange={updateTitles}
          onLaborNameChange={updateLaborName}
          onCarrierNameChange={updateCarrierName}
        />
      )}

      {mode === "cobrar" && editMode && showCobrarEditor && (
        <CobrarEditor
          labors={cobrarLabors}
          carriers={cobrarCarriers}
          carrierById={carrierById}
          onLaborChange={updateCobrarLabor}
          onCarrierChange={updateCobrarCarrier}
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
          withIva={cobrar.withIva !== false}
          hiddenColumns={hiddenColumns}
          titles={titles}
          labors={mode === "cobrar" ? cobrarLabors : laborsData}
          carriers={mode === "cobrar" ? cobrarCarriers : transportData}
          carrierById={carrierById}
          grandTotal={mode === "cobrar" ? grandTotalCobrar : grandTotalPagar}
          subtotal={mode === "cobrar" ? subtotalCobrar : null}
          discount={mode === "cobrar" ? (Number(cobrar.discount) || 0) : 0}
          discountNote={mode === "cobrar" ? (cobrar.discountNote || "") : ""}
          onChangeDiscount={mode === "cobrar" ? setCobrarDiscount : undefined}
          pendingBalance={mode === "cobrar" ? (Number(cobrar.pendingBalance) || 0) : 0}
          pendingBalanceNote={mode === "cobrar" ? (cobrar.pendingBalanceNote || "") : ""}
          onChangePendingBalance={mode === "cobrar" ? setCobrarPendingBalance : undefined}
          catalogs={catalogs}
          dayPrices={dayPrices}
          dayNotes={dayNotesSummary}
          editLaborRow={editCobrarLaborRow}
          addLaborRow={addCobrarLaborExtraRow}
          removeLaborRow={removeCobrarLaborExtraRow}
          editCarrierRow={editCobrarCarrierRow}
          addCarrierRow={addCobrarCarrierExtraRow}
          removeCarrierRow={removeCobrarCarrierExtraRow}
        />
        {/* Resumen por trabajador (trabajador × día), una infografía por
            labor. Solo en pagar: el cobro es por tarifa pactada, no por
            trabajador. */}
        {mode === "pagar" && laborWorkerGrids.map((g) => (
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
        message={`Así como está, la imagen saldría con los cuadros de edición y la marca de agua "EDITANDO — NO ENVIAR".\n\n¿Bloqueás el resumen y seguimos con ${CAPTURE_LABELS[captureAsk]?.verb || "la copia"}?`}
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
