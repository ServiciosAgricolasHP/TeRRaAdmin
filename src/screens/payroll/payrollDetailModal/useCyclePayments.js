import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { listCycleWorkdays } from "../../../services/workdayCycles";
import { attempt } from "../../../utils/attempt";
import { cyclePaymentsOf } from "../../../utils/cyclePayments";
import { errorText } from "../../../utils/errorText";
import { millisOf } from "../../../utils/syncedList";
import { workerIdResolver } from "../../../utils/workerRut";
import { payStateOf } from "../payState";

const NO_LABORS = [];

// Los pagos de un ciclo en todas sus nóminas. Las jornadas salen de la copia
// del ciclo que mantiene Nómina; las nóminas, de la lista ya cargada, con la
// del detalle abierto en su versión vigente.
export function useCyclePayments({ allPayrolls, cycleId, cycles, payroll, workers }) {
  const [loaded, setLoaded] = useState({ cycleId: null, workdays: null });
  const [error, setError] = useState("");
  const workdays = loaded.cycleId === cycleId ? loaded.workdays : null;

  const load = useEffectEvent(async (isCancelled) => {
    setError("");
    const { value, error: err } = await attempt(() => listCycleWorkdays([cycleId]));
    if (isCancelled()) return;
    if (err) setError(errorText(err));
    else setLoaded({ cycleId, workdays: value });
  });
  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [cycleId]);

  const labors = cycles.find((c) => c.id === cycleId)?.labors || NO_LABORS;
  const data = useMemo(() => {
    if (!workdays) return null;
    const workersById = new Map(workers.map((w) => [w.id, w]));
    const payrolls = [payroll, ...allPayrolls.filter((p) => p.id !== payroll.id)].map((p) => ({
      id: p.id,
      name: p.name,
      state: payStateOf(p),
      createdMs: millisOf(p.createdAt),
      items: p.items || [],
    }));
    return cyclePaymentsOf({
      workdays: workdays.filter((wd) => wd.cycleId === cycleId),
      labors,
      payrolls,
      workerIdOf: workerIdResolver(workers),
      workerOf: (id) => workersById.get(id) || null,
      currentPayrollId: payroll.id,
    });
  }, [workdays, cycleId, labors, allPayrolls, payroll, workers]);

  return { data, error, loading: !data && !error };
}
