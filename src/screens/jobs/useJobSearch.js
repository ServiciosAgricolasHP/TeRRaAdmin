import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { listSubjobs } from "../../services/jobLists";
import { attempt } from "../../utils/attempt";
import { jobSearchMatch } from "../../utils/jobSearch";

const NO_SUBJOBS = [];

// El buscador de Faenas: lo escrito y qué faenas calzan (`jobSearchMatch`),
// por la faena o por alguna de sus subfaenas. Las subfaenas salen de la copia
// que comparten las pantallas (`listSubjobs`), que se pide al empezar a buscar
// y de nuevo cuando cambian las de la pantalla (`refreshKey`).
export function useJobSearch({ jobs, refreshKey }) {
  const [query, setQuery] = useState("");
  const [subjobs, setSubjobs] = useState(null);
  const active = query.trim().length > 0;

  const loadSubjobs = useEffectEvent(async () => {
    const { value } = await attempt(() => listSubjobs());
    if (value) setSubjobs(value);
  });
  useEffect(() => {
    if (active) loadSubjobs();
  }, [active, refreshKey]);

  // Map(id de la faena → { via }) con las que calzan.
  const matches = useMemo(() => {
    const map = new Map();
    if (!active) return map;
    const byJob = new Map();
    for (const s of subjobs || NO_SUBJOBS) {
      if (!byJob.has(s.faenaId)) byJob.set(s.faenaId, []);
      byJob.get(s.faenaId).push(s);
    }
    for (const job of jobs) {
      const found = jobSearchMatch(job, byJob.get(job.id), query);
      if (found) map.set(job.id, found);
    }
    return map;
  }, [active, jobs, subjobs, query]);

  return {
    query,
    setQuery,
    active,
    matches,
    // Si la faena se muestra: todas sin buscar, y las que calzan al buscar.
    shows: (job) => !active || matches.has(job.id),
    // La subfaena por la que calzó, o null.
    viaOf: (job) => (active ? matches.get(job.id)?.via || null : null),
  };
}
