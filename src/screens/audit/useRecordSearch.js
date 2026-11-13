import { useMemo, useRef, useState } from "react";
import { fetchRecordLogs } from "../../services/auditService";
import { listWorkers } from "../../services/workersService";
import { listCycles, listJobs, listSubjobs } from "../../services/jobLists";
import { ENTITY_META, searchableEntityTypes } from "../../utils/auditLabels";
import { customRangeError, hasOpenFilter, isOpenRecord, rangeBounds, recordScope } from "../../utils/auditRecord";
import { localIsoDate } from "../../utils/dates";
import { attempt } from "../../utils/attempt";
import { errorText } from "../../utils/errorText";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// El catálogo de un tipo de registro. Los trabajadores, las faenas, las
// subfaenas y los ciclos salen de la copia que comparten las pantallas; los
// demás, de su servicio, con caché de 10 min.
const SYNCED_LISTS = { worker: listWorkers, faena: listJobs, subfaena: listSubjobs, cycle: listCycles };

// Las faenas y subfaenas necesitan sus ciclos, para saber si siguen abiertas y
// para traer lo que pasó en ellos; una faena, también sus subfaenas.
const NEEDS_CYCLES = ["faena", "subfaena"];

async function listRecords(entityType, meta) {
  const synced = SYNCED_LISTS[entityType];
  const rows = await (synced ? synced() : meta.service.list({ cache: true, ttl: 600_000 }));
  const cycles = NEEDS_CYCLES.includes(entityType) ? await listCycles() : [];
  const subjobs = entityType === "faena" ? await listSubjobs() : [];
  return { rows, cycles, subjobs };
}

// Los nombres que ya se saben de lo que abarca una faena o subfaena (sus
// ciclos y subfaenas), para que sus filas no los busquen.
function scopeLabels(scope, loaded) {
  const labels = {};
  const cycleIds = new Set(scope.cycleIds);
  for (const c of loaded.cycles || []) if (cycleIds.has(c.id)) labels[`cycle:${c.id}`] = c.label;
  const subjobIds = new Set(scope.subjobIds);
  for (const sj of loaded.subjobs || []) if (subjobIds.has(sj.id)) labels[`subfaena:${sj.id}`] = sj.name;
  return labels;
}

// El buscador por registro: parte sin tipo elegido y no lee nada hasta que se
// pide la lista del tipo (`loadRecords`). La lista muestra solo lo abierto,
// salvo con `showClosed`. Elegir un registro trae su historial del rango
// elegido (hoy, por defecto), y cambiar el rango lo vuelve a traer. El
// personalizado (hasta `MAX_CUSTOM_DAYS` días) se trae al apretar Ver.
export function useRecordSearch() {
  const types = useMemo(() => searchableEntityTypes(), []);
  const [entityType, setEntityType] = useState("");
  const [query, setQuery] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  // { type, rows, cycles, subjobs }: la lista cargada y de qué tipo es.
  const [records, setRecords] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  // { id, label, doc, scope, scopeLabels }; `scope`, lo que abarca (ver `recordScope`).
  const [selected, setSelected] = useState(null);
  const [range, setRange] = useState("today");
  // El rango personalizado que se está eligiendo; parte en los últimos 7 días.
  const [custom, setCustom] = useState(() => {
    const now = new Date();
    return { from: localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: localIsoDate(now) };
  });
  const customError = customRangeError(custom.from, custom.to);
  // { logs, missingIndexes, from, to } del registro elegido; `from` y `to`, el
  // rango personalizado con que se pidió.
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);
  // La última consulta pedida: una respuesta vieja no pisa a la nueva.
  const requestRef = useRef(0);

  const meta = ENTITY_META[entityType];
  const loaded = records?.type === entityType ? records : null;
  const canFilterOpen = hasOpenFilter(entityType);

  // Al cambiar de tipo se limpian la búsqueda y el registro elegido.
  if (useValuesChanged([entityType])) {
    setSelected(null);
    setHistory(null);
    setHistoryError("");
    setQuery("");
    setRecordsError("");
  }

  const loadRecords = async () => {
    if (!meta?.service) return;
    const type = entityType;
    setLoadingRecords(true);
    setRecordsError("");
    const { value, error: err } = await attempt(() => listRecords(type, meta));
    if (err) setRecordsError(errorText(err));
    else setRecords({ type, ...value });
    setLoadingRecords(false);
  };

  const openRows = useMemo(() => {
    if (!loaded) return null;
    if (!canFilterOpen || showClosed) return loaded.rows;
    return loaded.rows.filter((d) => isOpenRecord(entityType, d, loaded.cycles));
  }, [loaded, canFilterOpen, showClosed, entityType]);
  const closedCount = loaded && openRows ? loaded.rows.length - openRows.length : 0;

  const matches = useMemo(() => {
    if (!meta || !openRows) return [];
    const q = query.trim().toLowerCase();
    const fields = meta?.searchFields || ["name"];
    const pool = !q ? openRows : openRows.filter((d) => fields.some((f) => String(d[f] || "").toLowerCase().includes(q)));
    return pool.slice(0, 25);
  }, [openRows, query, meta]);

  // Trae el historial del rango; un personalizado que no sirve no lee nada.
  const loadHistory = async (type, record, rangeId, customRange) => {
    const bounds = rangeBounds(rangeId, new Date(), customRange);
    requestRef.current += 1;
    if (!bounds) {
      setHistory(null);
      setLoadingLogs(false);
      return;
    }
    const request = requestRef.current;
    setLoadingLogs(true);
    setHistoryError("");
    const { value, error: err } = await attempt(() =>
      fetchRecordLogs(type, record.id, { ...bounds, scope: record.scope }),
    );
    if (request !== requestRef.current) return;
    if (err) {
      setHistory(null);
      setHistoryError(errorText(err));
    } else setHistory({ ...value, from: customRange?.from || "", to: customRange?.to || "" });
    setLoadingLogs(false);
  };

  const pickRecord = (doc) => {
    const label = meta.labelOf ? meta.labelOf(doc) : doc.name || doc.id;
    const scope = recordScope(entityType, doc.id, loaded || {});
    const record = { id: doc.id, label, doc, scope, scopeLabels: scopeLabels(scope, loaded || {}) };
    setSelected(record);
    setHistory(null);
    loadHistory(entityType, record, range, custom);
  };

  const changeRange = (rangeId) => {
    setRange(rangeId);
    if (selected) loadHistory(entityType, selected, rangeId, custom);
  };

  const applyCustom = () => {
    if (selected) loadHistory(entityType, selected, "custom", custom);
  };

  const clearSelection = () => {
    requestRef.current += 1;
    setSelected(null);
    setHistory(null);
    setHistoryError("");
    setLoadingLogs(false);
  };

  return {
    canFilterOpen,
    applyCustom,
    changeRange,
    custom,
    customError,
    clearSelection,
    closedCount,
    entityType,
    history,
    historyError,
    loadedRecords: loaded?.rows || null,
    loadingLogs,
    loadingRecords,
    loadRecords,
    matches,
    meta,
    pickRecord,
    query,
    range,
    recordsError,
    selected,
    setEntityType,
    setCustom,
    setQuery,
    setShowClosed,
    showClosed,
    types,
  };
}
