import { useEffect, useMemo, useState } from "react";
import { fetchRecordHistory } from "../../services/auditService";
import { ENTITY_META, searchableEntityTypes } from "../../utils/auditLabels";

// El buscador por registro: el tipo elegido y su catálogo (caché de 10 min),
// lo que calza con lo escrito, y el historial del registro elegido.
export function useRecordSearch() {
  "use no memo";
  const types = useMemo(() => searchableEntityTypes(), []);
  const [entityType, setEntityType] = useState(types[0]?.value || "worker");
  const [query, setQuery] = useState("");
  const [allRecords, setAllRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selected, setSelected] = useState(null); // { id, label }
  const [recordLogs, setRecordLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const meta = ENTITY_META[entityType];

  // Trae el catálogo completo del tipo elegido (caché de 10 min) para
  // filtrarlo en el cliente a medida que se escribe.
  useEffect(() => {
    setSelected(null);
    setRecordLogs(null);
    setQuery("");
    if (!meta?.service) {
      setAllRecords([]);
      return;
    }
    let cancelled = false;
    setLoadingRecords(true);
    meta.service
      .list({ cache: true, ttl: 600_000 })
      .then((rows) => {
        if (!cancelled) setAllRecords(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecords(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  const matches = useMemo(() => {
    if (!meta) return [];
    const q = query.trim().toLowerCase();
    const fields = meta.searchFields || ["name"];
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
    try {
      setRecordLogs(await fetchRecordHistory(entityType, doc.id));
    } catch (err) {
      setRecordLogs([]);
      console.error("No se pudo cargar el historial:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const clearSelection = () => {
    setSelected(null);
    setRecordLogs(null);
  };

  return {
    clearSelection,
    entityType,
    loadingLogs,
    loadingRecords,
    matches,
    meta,
    pickRecord,
    query,
    recordLogs,
    selected,
    setEntityType,
    setQuery,
    types,
  };
}
