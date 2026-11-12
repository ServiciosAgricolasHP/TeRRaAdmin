import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { listCycles } from "../../services/jobLists";
import { attempt } from "../../utils/attempt";
import { readStored, writeStored } from "../../utils/browserStorage";
import { localIsoDate } from "../../utils/dates";
import { jobsByState } from "../../utils/jobStatus";

const VIEW_KEY = "faenas.viewMode";

// La vista de las tarjetas: "Mi orden" (los grupos de cada quien) o "Por
// estado" (activas, pausadas y cerradas, según sus ciclos). La elección queda
// en el dispositivo. Los ciclos salen de la copia que comparten las pantallas
// y se vuelven a pedir cuando cambia `refreshKey` (los ciclos que la pantalla
// tiene cargados).
export function useJobStates({ jobs, refreshKey }) {
  const [viewMode, setViewModeState] = useState(() => (readStored(VIEW_KEY, "mine") === "state" ? "state" : "mine"));
  const setViewMode = (mode) => {
    setViewModeState(mode);
    writeStored(VIEW_KEY, mode);
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

  const stateJobs = useMemo(
    () => (viewMode === "state" && cycles ? jobsByState(jobs, cycles, localIsoDate()) : null),
    [viewMode, cycles, jobs],
  );
  return { setViewMode, stateJobs, viewMode };
}
