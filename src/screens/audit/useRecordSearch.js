import { useEffect, useMemo, useState } from "react";
import { fetchRecordHistory } from "../../services/auditService";
import { ENTITY_META, searchableEntityTypes } from "../../utils/auditLabels";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// El buscador por registro: el tipo elegido y su catálogo (caché de 10 min),
// lo que calza con lo escrito, y el historial del registro elegido.
export function useRecordSearch() {
  const types = useMemo(() => searchableEntityTypes(), []);
  const [entityType, setEntityType] = useState(types[0]?.value || "worker");
  const [query, setQuery] = useState("");
  const [allRecords, setAllRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selected, setSelected] = useState(null); // { id, label }
  const [recordLogs, setRecordLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const meta = ENTITY_META[entityType];

  // Al cambiar de tipo se limpian la búsqueda y el registro elegido.
  if (useValuesChanged([entityType], { onMount: true })) {
    setSelected(null);
    setRecordLogs(null);
    setQuery("");
    if (meta?.service) setLoadingRecords(true);
    else setAllRecords([]);
  }

  // Trae el catálogo completo del tipo elegido (caché de 10 min) para
  // filtrarlo en el cliente a medida que se escribe.
  useEffect(() => {
    if (!meta?.service) return;
    let cancelled = false;
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
  }, [meta]);

  const matches = useMemo(() => {
    if (!meta) return [];
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
