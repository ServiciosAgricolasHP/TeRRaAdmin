import { useEffect, useEffectEvent, useState } from "react";
import { listCycles } from "../../services/jobLists";
import { listWorkers } from "../../services/workersService";
import { attempt } from "../../utils/attempt";
import { workdayLabelContext } from "../../utils/auditRecord";

// Los ciclos y trabajadores con que se nombran las jornadas de una tabla de
// logs (`workdayLabel`). Salen de las copias que comparten las pantallas y se
// piden solo si la tabla tiene jornadas. `null` mientras no están.
export function useWorkdayNames(logs) {
  const hasWorkdays = logs.some((l) => l.entity === "workday");
  const [context, setContext] = useState(null);

  const load = useEffectEvent(async (isCancelled) => {
    const { value, error } = await attempt(() => Promise.all([listCycles(), listWorkers()]));
    if (isCancelled()) return;
    if (error) {
      console.error("No se pudieron leer los ciclos y trabajadores para nombrar las jornadas:", error);
      return;
    }
    setContext(workdayLabelContext(value[0], value[1]));
  });

  useEffect(() => {
    if (!hasWorkdays) return undefined;
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [hasWorkdays]);

  return hasWorkdays ? context : null;
}
