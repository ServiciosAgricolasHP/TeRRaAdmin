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
} from "../../utils/cosechaCombos";
import { isRedDay } from "../../utils/tratoHE";
import { tripsService } from "../../services/transportsService";
import { cycleSummariesService, cyclesService, workdaysService } from "../../services";
import { useCarriers } from "../../contexts/CarriersContext";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  buildDailyRows,
  laborsDataOf,
  laborWorkerGridsOf,
  transportByCarrier,
  payTotal,
  dayNotesSummaryOf,
} from "../../utils/cycleSummary";
import { importedLaborsDataOf, chargeLaborsOf, chargeCarriersOf, chargeSubtotal } from "../../utils/cycleCharge";
import { fmtCurrency } from "../../utils/format";
import { ChargeEditor } from "./cycleSummaryModal/ChargeEditor";
import { ColumnsMenu } from "./cycleSummaryModal/ColumnsMenu";
import { EditingWatermark } from "./cycleSummaryModal/EditingWatermark";
import { ImportCyclesModal } from "./cycleSummaryModal/ImportCyclesModal";
import { ImportLaborsModal } from "./cycleSummaryModal/ImportLaborsModal";
import { LaborWorkerGrid } from "./cycleSummaryModal/LaborWorkerGrid";
import { PrintableSummary } from "./cycleSummaryModal/PrintableSummary";
import { TitlesEditor } from "./cycleSummaryModal/TitlesEditor";
import { writeCycleSummaryXlsx } from "./cycleSummaryModal/writeCycleSummaryXlsx";

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

const chargeStorageKey = (cycleId) => `cobrar_${cycleId}`;

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
  const [mode, setMode] = useState("pay"); // pay | charge
  // `withIva` (true por defecto) decide si el imprimible y el XLSX de cobrar
  // muestran las filas de IVA 19%. Se guarda por ciclo: hay cobros sin IVA
  // (servicios exentos, boletas, acuerdos netos).
  const [charge, setCharge] = useState({ labors: {}, carriers: {}, withIva: true, discount: 0, discountNote: "", pendingBalance: 0, pendingBalanceNote: "" });
  const [titles, setTitles] = useState({ main: "DETALLE DE JORNADA", subtitle: "", laborNames: {}, carrierNames: {} });
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [showChargeEditor, setShowChargeEditor] = useState(true);
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
    const chargeDefaults = { labors: {}, carriers: {}, importedLabors: [], withIva: true, discount: 0, discountNote: "", pendingBalance: 0, pendingBalanceNote: "" };
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
        const localCharge = loadJSON(chargeStorageKey(cycleId), null);
        const localTitles = loadJSON(titlesStorageKey(cycleId), null);
        const nextCharge = { ...chargeDefaults, ...(remote?.cobrar || localCharge || {}) };
        const nextTitles = { ...titlesDefaults, ...(remote?.titles || localTitles || {}) };
        setCharge(nextCharge);
        setTitles(nextTitles);
        lastSavedRef.current = { cobrar: JSON.stringify(nextCharge), titles: JSON.stringify(nextTitles) };
        lastTotalsRef.current = cycle.summaryTotals
          ? { pagar: Number(cycle.summaryTotals.pagar) || 0, cobrar: Number(cycle.summaryTotals.cobrar) || 0 }
          : null;
        setSummaryMeta(remote?.updatedAt ? { email: remote.updatedByEmail, at: remote.updatedAt.toDate?.() || null } : null);
        // Migración: si el ciclo no tiene doc en Firestore pero sí copia local,
        // la sube tal cual, sin avisar.
        if (!remote && (localCharge || localTitles)) {
          cycleSummariesService
            .save(cycleId, { cobrar: nextCharge, titles: nextTitles })
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
    const serialized = JSON.stringify(charge);
    if (serialized === lastSavedRef.current.cobrar) return;
    const t = setTimeout(() => {
      lastSavedRef.current.cobrar = serialized;
      cycleSummariesService
        .save(cycleId, { cobrar: charge })
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
  }, [charge, open, cycleId]);

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

  const setChargeWithVat = (next) => {
    setCharge((prev) => {
      const n = { ...prev, withIva: !!next };
      saveJSON(chargeStorageKey(cycle?.id), n);
      return n;
    });
  };

  // Descuento global sobre el neto del cobro (antes del IVA, si está activo).
  // `patch` puede traer `amount` (number) y/o `note` (string). Se guarda con el
  // resto del estado de cobrar del ciclo.
  const setChargeDiscount = (patch) => {
    setCharge((prev) => {
      const n = { ...prev };
      if (patch.amount !== undefined) n.discount = Math.max(0, Number(patch.amount) || 0);
      if (patch.note !== undefined) n.discountNote = String(patch.note || "");
      saveJSON(chargeStorageKey(cycle?.id), n);
      return n;
    });
  };

  // Saldo pendiente global: se suma al total del cobro después del IVA. Igual
  // que en el descuento, `patch` puede traer `amount` y/o `note`.
  const setChargePendingBalance = (patch) => {
    setCharge((prev) => {
      const n = { ...prev };
      if (patch.amount !== undefined) n.pendingBalance = Math.max(0, Number(patch.amount) || 0);
      if (patch.note !== undefined) n.pendingBalanceNote = String(patch.note || "");
      saveJSON(chargeStorageKey(cycle?.id), n);
      return n;
    });
  };

  const updateChargeLabor = (laborId, patch) => {
    setCharge((prev) => {
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...prev.labors[laborId], ...patch } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateChargeCarrier = (carrierId, patch) => {
    setCharge((prev) => {
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...prev.carriers[carrierId], ...patch } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };

  // Overrides por fila (cobrar). Cada labor guarda un mapa { rowKey -> patch }
  // con el rowKey de la fila del día: la fecha, o fecha y tier/etapa en trato
  // y tratoEtapas. El patch puede traer qty, overtimeHours, rate, amount,
  // transport o workerCount, todos opcionales; los que faltan toman el valor
  // base. Las filas extra se editan en `extraRows`.
  const updateChargeLaborRow = (laborId, rowKey, patch) => {
    setCharge((prev) => {
      const labor = prev.labors[laborId] || {};
      const rowOverrides = { ...(labor.rowOverrides || {}) };
      const existing = rowOverrides[rowKey] || {};
      const merged = { ...existing, ...patch };
      // Si todos los campos quedan vacíos (undefined, null o ""), se quita el override.
      const allEmpty = Object.values(merged).every((v) => v === "" || v == null);
      if (allEmpty) delete rowOverrides[rowKey];
      else rowOverrides[rowKey] = merged;
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, rowOverrides } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const addChargeLaborExtraRow = (laborId) => {
    setCharge((prev) => {
      const labor = prev.labors[laborId] || {};
      const extraRows = [...(labor.extraRows || [])];
      const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `x${Date.now()}${Math.random()}`;
      // Las filas extra arrancan con los campos vacíos para que el monto se
      // calcule (qty × rate) al tipear.
      extraRows.push({ id, date: "", qty: "", overtimeHours: "", rate: "", amount: "" });
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, extraRows } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateChargeLaborExtraRow = (laborId, id, patch) => {
    setCharge((prev) => {
      const labor = prev.labors[laborId] || {};
      const extraRows = (labor.extraRows || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, extraRows } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const removeChargeLaborExtraRow = (laborId, id) => {
    setCharge((prev) => {
      const labor = prev.labors[laborId] || {};
      const extraRows = (labor.extraRows || []).filter((r) => r.id !== id);
      const next = { ...prev, labors: { ...prev.labors, [laborId]: { ...labor, extraRows } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  // Mismo modelo para transportistas.
  const updateChargeCarrierRow = (carrierId, rowKey, patch) => {
    setCharge((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const rowOverrides = { ...(carrier.rowOverrides || {}) };
      const existing = rowOverrides[rowKey] || {};
      const merged = { ...existing, ...patch };
      const allEmpty = Object.values(merged).every((v) => v === "" || v == null);
      if (allEmpty) delete rowOverrides[rowKey];
      else rowOverrides[rowKey] = merged;
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, rowOverrides } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const addChargeCarrierExtraRow = (carrierId) => {
    setCharge((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const extraRows = [...(carrier.extraRows || [])];
      const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `x${Date.now()}${Math.random()}`;
      // Campos vacíos, igual que en addCobrarLaborExtraRow.
      extraRows.push({ id, date: "", count: "", rate: "", amount: "" });
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, extraRows } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const updateChargeCarrierExtraRow = (carrierId, id, patch) => {
    setCharge((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const extraRows = (carrier.extraRows || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, extraRows } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const removeChargeCarrierExtraRow = (carrierId, id) => {
    setCharge((prev) => {
      const carrier = prev.carriers[carrierId] || {};
      const extraRows = (carrier.extraRows || []).filter((r) => r.id !== id);
      const next = { ...prev, carriers: { ...prev.carriers, [carrierId]: { ...carrier, extraRows } } };
      saveJSON(chargeStorageKey(cycle?.id), next);
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
    for (const imp of charge.importedLabors || []) {
      set.add(`${imp.sourceCycleId}|${imp.sourceLaborId}`);
    }
    for (const laborCfg of Object.values(charge.labors || {})) {
      for (const er of laborCfg?.extraRows || []) {
        if (er.sourceCycleId) set.add(`${er.sourceCycleId}|${er.sourceLaborId || "*"}`);
      }
    }
    return set;
  }, [charge.labors, charge.importedLabors]);
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
    setCharge((prev) => {
      const next = { ...prev, importedLabors: [...(prev.importedLabors || []), ...newLabors] };
      saveJSON(chargeStorageKey(cycle?.id), next);
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
    setCharge((prev) => {
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
      saveJSON(chargeStorageKey(cycle?.id), next);
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
    setCharge((prev) => {
      const set = new Set(prev.hiddenColumns || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      const next = { ...prev, hiddenColumns: [...set] };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const resetColumns = () => {
    setCharge((prev) => {
      const next = { ...prev, hiddenColumns: [] };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const hiddenColumns = useMemo(() => new Set(charge.hiddenColumns || []), [charge.hiddenColumns]);

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

  // LaborTable y TransportTable editan una fila con `onEditRow(id, row, patch)`;
  // estos envoltorios mandan el cambio al override de la fila o a la fila
  // extra. Editar un factor (qty, count, rate, overtimeHours) sin pasar
  // `amount` vacía `amount`, para que vuelva a mandar el cálculo (qty × rate,
  // o qty + horas × rate en tratoHE) y no quede fijo el monto anterior.
  const clearAmountIfFactorEdit = (patch, factorKeys) => {
    const editsFactor = factorKeys.some((k) => k in patch);
    return editsFactor && !("amount" in patch) ? { ...patch, amount: "" } : patch;
  };
  const editChargeLaborRow = (laborId, row, patch) => {
    const finalPatch = clearAmountIfFactorEdit(patch, ["qty", "rate", "overtimeHours"]);
    if (row?.isExtra) updateChargeLaborExtraRow(laborId, row.extraId, finalPatch);
    // La clave del override es el rowKey de la fila: la fecha, o fecha y
    // tier/etapa en trato y tratoEtapas, así cada tier tiene su override.
    else updateChargeLaborRow(laborId, row.rowKey || row.date, finalPatch);
  };
  const editChargeCarrierRow = (carrierId, row, patch) => {
    const finalPatch = clearAmountIfFactorEdit(patch, ["count", "rate"]);
    if (row?.isExtra) updateChargeCarrierExtraRow(carrierId, row.extraId, finalPatch);
    else updateChargeCarrierRow(carrierId, row.date, finalPatch);
  };

  // Guarda los totales de pagar y cobrar en `cycle.summaryTotals`, de donde el
  // Dashboard saca el margen por ciclo sin leer `cycleSummaries` (una lectura
  // por ciclo). Solo escribe si cambiaron.
  //
  // `additive: true` actualiza la caché de `cycles` en vez de invalidarla, así
  // las demás pantallas no vuelven a leer la colección.
  const saveCycleTotals = () => {
    const pay = Math.round(grandTotalPay);
    const charge = Math.round(grandTotalCharge);
    if (pay <= 0 && charge <= 0) return; // modal cerrado antes de cargar
    const prev = lastTotalsRef.current;
    if (prev && prev.pagar === pay && prev.cobrar === charge) return;
    lastTotalsRef.current = { pagar: pay, cobrar: charge };
    cyclesService
      .update(cycleId, { summaryTotals: { pagar: pay, cobrar: charge, at: new Date().toISOString() } }, { additive: true })
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
      const c = JSON.stringify(charge);
      const t = JSON.stringify(titles);
      const patch = {};
      if (c !== lastSavedRef.current.cobrar) { patch.cobrar = charge; lastSavedRef.current.cobrar = c; }
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
  const handleXlsxSummary = async () => {
    setBusy("xlsx");
    try {
      await writeCycleSummaryXlsx({
        carrierById,
        catalogs,
        charge,
        chargeCarriers,
        chargeLabors,
        cycle,
        dayPrices,
        grandTotalCharge,
        grandTotalPay,
        laborsData,
        mode,
        subtotalCharge,
        titles,
        transportData,
        workdaysByLabor,
      });
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

  const captureLocked = mode === "charge" && editMode;
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
