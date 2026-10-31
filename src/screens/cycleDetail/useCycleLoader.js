import { useState, useEffect } from "react";
import { cyclesService, jobsService, subjobsService, laborGroupsService, workdaysService } from "../../services";
import { normalizeCycle } from "./rows";
import { normalizeTratoDayPrices, normalizeDayPricesEntry, workdayComboKeyOf, PISO_COMBO_KEY, normalizeTratoWorkday, workdayMapKey } from "../../utils/cosechaCombos";

// Carga del ciclo: el ciclo con sus labores y precios por día (normalizados,
// y guardados si venían en un formato anterior), su faena y subfaena, las
// agrupaciones de labor y las jornadas de cada labor.
export function useCycleLoader({ id }) {
  const [cycle, setCycle] = useState(null);
  const [job, setJob] = useState(null);
  const [subjob, setSubjob] = useState(null);
  // Agrupaciones de labor de esta subfaena (Poda, Riego, etc.), para hilar
  // labores del mismo tipo a través de ciclos. Ver laborGroupsService.
  const [laborGroups, setLaborGroups] = useState([]);
  const [workdaysByLabor, setWorkdaysByLabor] = useState({});

  const [loading, setLoading] = useState(true);
  const [activeLaborId, setActiveLaborId] = useState(null);

  const [dayPrices, setDayPrices] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const c = await cyclesService.getById(id);
      if (!c) { setLoading(false); return; }
      const normalized = normalizeCycle(c);
      const needsPersist =
        !c.labors || !c.labors.length || !Array.isArray(c.days) || (c.labors || []).some((l) => Array.isArray(l.days));
      if (needsPersist) {
        await cyclesService.update(id, { days: normalized.days, labors: normalized.labors });
      }
      setCycle(normalized);
      setActiveLaborId(normalized.labors[0]?.id || null);

      const rawDP = c.dayPrices || {};
      const normalizedDP = {};
      let dpChanged = false;
      for (const lid of Object.keys(rawDP)) {
        normalizedDP[lid] = {};
        const labor = (c.labors || []).find((l) => l.id === lid);
        const laborDefaultMode = labor?.tratoMode || "unit";
        for (const date of Object.keys(rawDP[lid])) {
          const before = rawDP[lid][date];
          const isPieceworkType = labor?.type === "trato";
          const after = isPieceworkType
            ? normalizeTratoDayPrices(before, laborDefaultMode)
            : normalizeDayPricesEntry(before);
          normalizedDP[lid][date] = after;
          if (JSON.stringify(before) !== JSON.stringify(after)) dpChanged = true;
        }
      }
      setDayPrices(normalizedDP);
      if (dpChanged) await cyclesService.update(id, { dayPrices: normalizedDP });

      if (normalized.faenaId) setJob(await jobsService.getById(normalized.faenaId));
      if (normalized.subfaenaId) {
        setSubjob(await subjobsService.getById(normalized.subfaenaId));
        // Sin `order`: where(subfaenaId) + orderBy(name) pediría un índice
        // compuesto en Firestore. La lista es chica y se ordena en el cliente.
        const groups = await laborGroupsService.list({ wheres: [["subfaenaId", "==", normalized.subfaenaId]] });
        setLaborGroups([...groups].sort((a, b) => a.name.localeCompare(b.name)));
      }

      const wds = await workdaysService.list({ wheres: [["cycleId", "==", id]] });
      const byLabor = {};
      const labors = normalized.labors || [];
      for (const w of wds) {
        const lid = w.laborId || labors[0]?.id;
        // Clave de combo/tier (ck) del mapa en memoria (workdayComboKeyOf).
        // Las filas de trato buscan sus jornadas por tier ("t0", "t1"…).
        const laborForDoc = labors.find((l) => l.id === lid);
        const ck = workdayComboKeyOf(w, laborForDoc?.type);
        if (!byLabor[lid]) byLabor[lid] = {};
        // Los workdays de piso no se normalizan como trato: no tienen tiers.
        const normalizedWd = w.pisoOnly || ck === PISO_COMBO_KEY ? w : normalizeTratoWorkday(w);
        byLabor[lid][workdayMapKey(w.workerRut, w.date, ck)] = normalizedWd;
      }
      setWorkdaysByLabor(byLabor);
      setLoading(false);
    })();
  }, [id]);
  return {
    activeLaborId,
    cycle,
    dayPrices,
    job,
    laborGroups,
    loading,
    setActiveLaborId,
    setCycle,
    setDayPrices,
    setLaborGroups,
    setWorkdaysByLabor,
    subjob,
    workdaysByLabor,
  };
}
