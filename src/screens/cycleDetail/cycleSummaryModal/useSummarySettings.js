import { useState, useRef, useEffect } from "react";
import { cycleSummariesService } from "../../../services";
import { tripsService } from "../../../services/transportsService";
import { loadJSON, chargeStorageKey, titlesStorageKey, saveJSON } from "./summaryStorage";
import { DEFAULT_HIDDEN_COLUMNS, toggledColumns } from "../../../utils/summaryTables";

// Lo que el resumen guarda, compartido entre usuarios: las tarifas y ajustes
// del cobro y los títulos, en Firestore con un espejo en localStorage. Carga
// eso y las vueltas del ciclo al abrir, sube la copia local si el ciclo todavía
// no tiene resumen guardado y guarda cada cambio con debounce.
export function useSummarySettings({ cycle, cycleId, faena, open, subfaena, toast, user }) {
  "use no memo";
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  // `withIva` (true por defecto) decide si el imprimible y el XLSX de cobrar
  // muestran las filas de IVA 19%. Se guarda por ciclo: hay cobros sin IVA
  // (servicios exentos, boletas, acuerdos netos).
  const [charge, setCharge] = useState({ labors: {}, carriers: {}, withIva: true, discount: 0, discountNote: "", pendingBalance: 0, pendingBalanceNote: "" });
  const [titles, setTitles] = useState({ main: "DETALLE DE JORNADA", subtitle: "", laborNames: {}, carrierNames: {} });

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

  // Muestra u oculta una columna en todas las tablas del resumen del ciclo. Se
  // guarda en `cobrar.hiddenColumns: string[]` y, las que empiezan ocultas
  // (`DEFAULT_HIDDEN_COLUMNS`), en `cobrar.shownColumns: string[]`, con las
  // claves de columna de LaborTable y TransportTable.
  const toggleColumn = (key) => {
    setCharge((prev) => {
      const next = { ...prev, ...toggledColumns(prev.hiddenColumns, prev.shownColumns, key) };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };
  const resetColumns = () => {
    setCharge((prev) => {
      const next = { ...prev, hiddenColumns: [], shownColumns: [...DEFAULT_HIDDEN_COLUMNS] };
      saveJSON(chargeStorageKey(cycle?.id), next);
      return next;
    });
  };

  // LaborTable y TransportTable editan una fila con `onEditRow(id, row, patch)`;
  // estos envoltorios mandan el cambio al override de la fila o a la fila
  // extra. Editar un factor (qty, count, rate, overtimeHours, y en tratoHE las
  // jornadas y su valor) sin pasar `amount` vacía `amount`, para que vuelva a
  // mandar el cálculo (qty × rate, o jornadas × valor + horas × rate en
  // tratoHE) y no quede fijo el monto anterior.
  const clearAmountIfFactorEdit = (patch, factorKeys) => {
    const editsFactor = factorKeys.some((k) => k in patch);
    return editsFactor && !("amount" in patch) ? { ...patch, amount: "" } : patch;
  };
  const editChargeLaborRow = (laborId, row, patch) => {
    const finalPatch = clearAmountIfFactorEdit(patch, ["qty", "rate", "overtimeHours", "workdayCount", "workdayRate"]);
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
  return {
    addChargeCarrierExtraRow,
    addChargeLaborExtraRow,
    charge,
    editChargeCarrierRow,
    editChargeLaborRow,
    hydratedRef,
    lastSavedRef,
    lastTotalsRef,
    loading,
    removeChargeCarrierExtraRow,
    removeChargeLaborExtraRow,
    resetColumns,
    setCharge,
    setChargeDiscount,
    setChargePendingBalance,
    setChargeWithVat,
    summaryMeta,
    titles,
    toggleColumn,
    trips,
    updateCarrierName,
    updateChargeCarrier,
    updateChargeLabor,
    updateLaborName,
    updateTitles,
  };
}
