import { useMemo, useState } from "react";
import { fetchRecordHistory } from "../../services/auditService";
import { listWorkers } from "../../services/workersService";
import { ENTITY_META, searchableEntityTypes } from "../../utils/auditLabels";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// El catálogo de un tipo de registro. Los trabajadores salen de la copia que
// se pone al día (`listWorkers`); los demás, de su servicio, con caché de
// 10 min.
function listRecords(entityType, meta) {
  if (entityType === "worker") return listWorkers();
  return meta.service.list({ cache: true, ttl: 600_000 });
}

// El buscador por registro: parte sin tipo elegido y no lee nada hasta que se
// pide la lista del tipo (`loadRecords`). Después filtra en el cliente lo que
// se escribe y trae el historial del registro elegido.
export function useRecordSearch() {
  const types = useMemo(() => searchableEntityTypes(), []);
  const [entityType, setEntityType] = useState("");
  const [query, setQuery] = useState("");
  // { type, rows }: la lista cargada y de qué tipo es.
  const [records, setRecords] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [selected, setSelected] = useState(null); // { id, label }
  const [recordLogs, setRecordLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const meta = ENTITY_META[entityType];
  const allRecords = records?.type === entityType ? records.rows : null;

  // Al cambiar de tipo se limpian la búsqueda y el registro elegido.
  if (useValuesChanged([entityType])) {
    setSelected(null);
    setRecordLogs(null);
    setQuery("");
    setRecordsError("");
  }

  const loadRecords = async () => {
    if (!meta?.service) return;
    const type = entityType;
    setLoadingRecords(true);
    setRecordsError("");
    const { value, error: err } = await attempt(() => listRecords(type, meta));
    if (err) setRecordsError(err.message || String(err));
    else setRecords({ type, rows: value });
    setLoadingRecords(false);
  };

  const matches = useMemo(() => {
    if (!meta || !allRecords) return [];
    const q = query.trim().toLowerCase();
    const fields = meta?.searchFields || ["name"];
    const pool = !q
      ? allRecords
      : allRecords.filter((d) => fields.some((f) => String(d[f] || "").toLowerCase().includes(q)));
    return pool.slice(0, 25);
  }, [allRecords, query, meta]);

  const pickRecord = async (doc) => {
    const label = meta.labelOf ? meta.labelOf(doc) : doc.name || doc.id;
    setSelected({ id: doc.id, label, doc });
    setRecordLogs(null);
    setLoadingLogs(true);
    const { error: err } = await attempt(async () => {
      setRecordLogs(await fetchRecordHistory(entityType, doc.id));
    });
    if (err) {
      setRecordLogs([]);
      console.error("No se pudo cargar el historial:", err);
    }
    setLoadingLogs(false);
  };

  const clearSelection = () => {
    setSelected(null);
    setRecordLogs(null);
  };

  return {
    clearSelection,
    entityType,
    loadedRecords: allRecords,
    loadingLogs,
    loadingRecords,
    loadRecords,
    matches,
    meta,
    pickRecord,
    query,
    recordLogs,
    recordsError,
    selected,
    setEntityType,
    setQuery,
    types,
  };
}
