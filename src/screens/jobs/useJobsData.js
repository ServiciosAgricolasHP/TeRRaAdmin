import { useState, useMemo, useEffect, useEffectEvent } from "react";
import { listCycles, listJobs, listSubjobs } from "../../services/jobLists";
import { newestFirst } from "../../utils/syncedList";
import { attempt } from "../../utils/attempt";
import { readStoredJson, writeStoredJson } from "../../utils/browserStorage";

const orderKey = (uid) => `af.faenaOrder.${uid || "anon"}`;

function applyOrder(items, order) {
  if (!order?.length) return items;
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = idx.has(a.id) ? idx.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = idx.has(b.id) ? idx.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

// Las faenas con el orden de sus tarjetas (guardado en el dispositivo), y las
// subfaenas y ciclos de cada faena, que se cargan al elegirla.
export function useJobsData({ selectedId, user }) {
  const storageKey = orderKey(user?.uid);

  const [rawJobs, setRawJobs] = useState([]);
  const [order, setOrder] = useState(() => readStoredJson(storageKey, []));
  const [subjobsByJob, setSubjobsByJob] = useState({});
  const [cyclesByJob, setCyclesByJob] = useState({});
  const [loading, setLoading] = useState(true);

  const jobs = useMemo(() => applyOrder(rawJobs, order), [rawJobs, order]);

  const persistOrder = (next) => {
    setOrder(next);
    writeStoredJson(storageKey, next);
  };

  const loadJobs = async () => {
    setLoading(true);
    const { error: err } = await attempt(async () => {
      const list = await listJobs();
      setRawJobs(list);
      const ids = list.map((f) => f.id);
      const cleaned = order.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !cleaned.includes(id));
      const next = [...cleaned, ...missing];
      if (JSON.stringify(next) !== JSON.stringify(order)) persistOrder(next);
    });
    setLoading(false);
    if (err) throw err;
  };

  const loadSubjobs = async (jobId) => {
    const list = (await listSubjobs()).filter((s) => s.faenaId === jobId);
    setSubjobsByJob((prev) => ({ ...prev, [jobId]: list }));
  };

  const loadCycles = async (jobId) => {
    const list = newestFirst((await listCycles()).filter((c) => c.faenaId === jobId));
    setCyclesByJob((prev) => ({ ...prev, [jobId]: list }));
  };

  const loadOnMount = useEffectEvent(() => loadJobs());
  useEffect(() => {
    loadOnMount();
  }, []);

  // Al elegir una faena se cargan sus subfaenas y ciclos, si no están.
  const loadJobIfMissing = useEffectEvent((jobId) => {
    if (!subjobsByJob[jobId]) loadSubjobs(jobId);
    if (!cyclesByJob[jobId]) loadCycles(jobId);
  });
  useEffect(() => {
    if (selectedId) loadJobIfMissing(selectedId);
  }, [selectedId]);
  return {
    cyclesByJob,
    jobs,
    loadCycles,
    loading,
    loadJobs,
    loadSubjobs,
    order,
    persistOrder,
    subjobsByJob,
  };
}
