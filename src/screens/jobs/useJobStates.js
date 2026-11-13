import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { listCycles } from "../../services/jobLists";
import { attempt } from "../../utils/attempt";
import { readStored, writeStored } from "../../utils/browserStorage";
import { localIsoDate } from "../../utils/dates";
import { jobsByStateGroup } from "../../utils/jobStatus";

const VIEW_KEY = "faenas.viewMode";
const SORT_KEY = "faenas.stateSort";

// La vista de las tarjetas: "Mi orden" (los grupos de cada quien) o "Por
// estado" (las secciones de `JOB_STATE_GROUPS`, según sus ciclos, ordenadas
// por el último movimiento o la última edición). La vista y el orden quedan
// en el dispositivo. Los ciclos salen de la copia que comparten las pantallas
// y se vuelven a pedir cuando cambia `refreshKey` (los ciclos que la pantalla
// tiene cargados).
export function useJobStates({ jobs, refreshKey }) {
  const [viewMode, setViewModeState] = useState(() => (readStored(VIEW_KEY, "mine") === "state" ? "state" : "mine"));
  const setViewMode = (mode) => {
    setViewModeState(mode);
    writeStored(VIEW_KEY, mode);
  };
  const [stateSort, setStateSortState] = useState(() => (readStored(SORT_KEY, "movement") === "edited" ? "edited" : "movement"));
  const setStateSort = (sort) => {
    setStateSortState(sort);
    writeStored(SORT_KEY, sort);
  };

  const [cycles, setCycles] = useState(null);
  const load = useEffectEvent(async (isCancelled) => {
    const { value } = await attempt(() => listCycles());
    if (!isCancelled() && value) setCycles(value);
  });
  useEffect(() => {
    if (viewMode !== "state") return undefined;
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [viewMode, refreshKey]);

  const byState = useMemo(
    () => (viewMode === "state" && cycles ? jobsByStateGroup(jobs, cycles, localIsoDate(), stateSort) : null),
    [viewMode, cycles, jobs, stateSort],
  );
  return {
    setStateSort,
    setViewMode,
    stateDates: byState?.dateOf || null,
    stateJobs: byState?.jobsByGroup || null,
    stateSort,
    viewMode,
  };
}
