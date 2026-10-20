import { useState, useMemo, useEffect } from "react";
import { jobsService, subjobsService, cyclesService } from "../../services";

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
  "use no memo";
  const storageKey = orderKey(user?.uid);

  const [rawJobs, setRawJobs] = useState([]);
  const [order, setOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [subjobsByJob, setSubjobsByJob] = useState({});
  const [cyclesByJob, setCyclesByJob] = useState({});
  const [loading, setLoading] = useState(true);

  const jobs = useMemo(() => applyOrder(rawJobs, order), [rawJobs, order]);

  const persistOrder = (next) => {
    setOrder(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (e) { void e; }
  };

  const loadJobs = async () => {
    setLoading(true);
    try {
      const list = await jobsService.list({
        order: ["name", "asc"],
        cache: true,
        persist: true,
        ttl: 10 * 60 * 1000,
      });
      setRawJobs(list);
      const ids = list.map((f) => f.id);
      const cleaned = order.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !cleaned.includes(id));
      const next = [...cleaned, ...missing];
      if (JSON.stringify(next) !== JSON.stringify(order)) persistOrder(next);
    } finally {
      setLoading(false);
    }
  };

  const loadSubjobs = async (jobId) => {
    const list = await subjobsService.list({
      wheres: [["faenaId", "==", jobId]],
      order: ["name", "asc"],
      cache: true,
      persist: true,
      ttl: 10 * 60 * 1000,
    });
    setSubjobsByJob((prev) => ({ ...prev, [jobId]: list }));
  };

  const loadCycles = async (jobId) => {
    const list = await cyclesService.list({
      wheres: [["faenaId", "==", jobId]],
      order: ["createdAt", "desc"],
      cache: true,
      ttl: 2 * 60 * 1000,
    });
    setCyclesByJob((prev) => ({ ...prev, [jobId]: list }));
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (!subjobsByJob[selectedId]) loadSubjobs(selectedId);
    if (!cyclesByJob[selectedId]) loadCycles(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
