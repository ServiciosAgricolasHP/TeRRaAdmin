import { useMemo, useState } from "react";
import { useCycleDetail } from "./CycleDetailContext";
import { useToast } from "../../contexts/ToastContext";
import { clearLabor } from "../../services/laborClearService";
import { attempt } from "../../utils/attempt";
import { planLaborClear, workdaysOfGrid } from "../../utils/laborClear";
import { normalizeCycle } from "./rows";

// Lo que se ve en la barra de avance en cada etapa de `clearLabor`.
const STAGE_LABELS = {
  read: "Leyendo las jornadas del ciclo…",
  delete: "Borrando jornadas",
  cycle: "Poniendo al día el ciclo…",
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Limpiar la labor activa: lo que se va a borrar, calculado con lo que muestra
// la grilla (sus jornadas y las vueltas del ciclo), y la limpieza, que vuelve
// a leer todo antes de borrar. Al terminar pone al día la grilla sin releer.
export function useLaborClear({ onDone }) {
  const { activeLabor, cycle, cycleTrips, guardedWrite, setCycle, setWorkdaysByLabor, workdaysByLabor } = useCycleDetail();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const plan = useMemo(
    () => (activeLabor ? planLaborClear({ cycle, laborId: activeLabor.id, workdays: workdaysOfGrid(workdaysByLabor), trips: cycleTrips }) : null),
    [activeLabor, cycle, workdaysByLabor, cycleTrips],
  );

  const run = async () => {
    if (!activeLabor || busy) return;
    setBusy(true);
    const laborId = activeLabor.id;
    const onProgress = ({ stage, done, total }) => setProgress({ label: STAGE_LABELS[stage], done, total });
    const { value: res, error } = await attempt(() => guardedWrite(() => clearLabor({ cycleId: cycle.id, laborId, onProgress })));
    setBusy(false);
    setProgress(null);
    if (error) {
      toast.error("No se pudo limpiar la labor: " + (error.message || error));
      return;
    }
    // En la labor quedan solo las jornadas que están en una nómina.
    setWorkdaysByLabor((prev) => ({
      ...prev,
      [laborId]: Object.fromEntries(Object.entries(prev[laborId] || {}).filter(([, wd]) => wd?.payrollId)),
    }));
    setCycle((prev) => normalizeCycle({ ...prev, days: res.days, labors: res.labors }));
    const p = res.plan;
    const done = [
      plural(p.deletes.length, "jornada borrada", "jornadas borradas"),
      p.workersRemoved > 0 && plural(p.workersRemoved, "persona fuera de la labor", "personas fuera de la labor"),
      p.daysRemoved.length > 0 && plural(p.daysRemoved.length, "día quitado", "días quitados"),
    ].filter(Boolean);
    toast.success(`Labor limpia: ${done.join(", ")}.`);
    onDone();
  };

  return { busy, plan, progress, run };
}
