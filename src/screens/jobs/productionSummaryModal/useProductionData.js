import { useState, useEffect, useEffectEvent } from "react";
import { listWorkdaysByCycle, laborGroupsService } from "../../../services";
import { tripsService } from "../../../services/transportsService";
import { attempt } from "../../../utils/attempt";

// Lo que lee el resumen de producción mientras está abierto: las jornadas de
// los ciclos prendidos (salvo las que pase el llamador), las vueltas de
// transporte de cada ciclo y las agrupaciones de labor de sus subfaenas.
export function useProductionData({ cycles, enabledCycles, open, workdaysByCycleProp }) {
  const [wdByCycle, setWdByCycle] = useState(workdaysByCycleProp || {});
  const [tripsByCycle, setTripsByCycle] = useState({});
  const [laborGroupsBySubjob, setLaborGroupsBySubjob] = useState({});
  const [loading, setLoading] = useState(false);

  // Los efectos se rehacen cuando cambian los ciclos o los prendidos; lo que
  // ya se leyó lo dicen los mapas al momento de correr.
  const cycleIdsKey = cycles.map((c) => c.id).join(",");
  const enabledKey = [...enabledCycles].sort().join(",");
  const missingWorkdayCycles = useEffectEvent(() => cycles.filter((c) => enabledCycles.has(c.id) && !wdByCycle[c.id]));
  const missingTripCycles = useEffectEvent(() => cycles.filter((c) => !tripsByCycle[c.id]));
  const missingLaborGroupSubjobs = useEffectEvent(() => {
    const subIds = [...new Set(cycles.map((c) => c.subfaenaId).filter(Boolean))];
    return subIds.filter((sid) => !laborGroupsBySubjob[sid]);
  });

  // Lee las jornadas de los ciclos prendidos que no están en `wdByCycle` (el
  // llamador puede pasarlas en `workdaysByCycle`). La consulta filtra por
  // ciclo en el servidor y los ciclos apagados no se leen: al prender un chip,
  // el efecto trae el que falte.
  useEffect(() => {
    if (!open) return;
    const missing = missingWorkdayCycles();
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { error: err } = await attempt(async () => {
        // Una consulta por ciclo: la clave de caché queda estable y prender o
        // apagar un chip no vuelve a pagar. Usa el helper compartido con
        // Nómina, que pide lo mismo con las mismas opciones (misma clave y TTL).
        const fetched = await Promise.all(
          missing.map(async (c) => [c.id, await listWorkdaysByCycle(c.id)]),
        );
        if (cancelled) return;
        setWdByCycle((prev) => {
          const next = { ...prev };
          for (const [cid, list] of fetched) next[cid] = list;
          return next;
        });
      });
      if (!cancelled) setLoading(false);
      if (err) throw err;
    })();
    return () => { cancelled = true; };
  }, [open, cycleIdsKey, enabledKey]);

  // Carga las vueltas de transporte de cada ciclo — usadas por la fila
  // TRANSPORTE de la tabla general (costo de transporte por ciclo).
  useEffect(() => {
    if (!open) return;
    const missing = missingTripCycles();
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      await attempt(async () => {
        const fetched = await Promise.all(
          missing.map(async (c) => [c.id, await tripsService.listByCycle(c.id)]),
        );
        if (cancelled) return;
        setTripsByCycle((prev) => {
          const next = { ...prev };
          for (const [cid, list] of fetched) next[cid] = list;
          return next;
        });
      });
    })();
    return () => { cancelled = true; };
  }, [open, cycleIdsKey]);

  // Agrupaciones de labor (laborGroups) de las subfaenas involucradas, para
  // nombrar los grupos al totalizar por laborGroupId. Se leen por subfaena y
  // no por ciclo: varios ciclos comparten subfaena.
  useEffect(() => {
    if (!open) return;
    const missing = missingLaborGroupSubjobs();
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      await attempt(async () => {
        const fetched = await Promise.all(
          missing.map(async (sid) => [sid, await laborGroupsService.list({ wheres: [["subfaenaId", "==", sid]] })]),
        );
        if (cancelled) return;
        setLaborGroupsBySubjob((prev) => {
          const next = { ...prev };
          for (const [sid, list] of fetched) next[sid] = list;
          return next;
        });
      });
    })();
    return () => { cancelled = true; };
  }, [open, cycleIdsKey]);
  return { laborGroupsBySubjob, loading, tripsByCycle, wdByCycle };
}
