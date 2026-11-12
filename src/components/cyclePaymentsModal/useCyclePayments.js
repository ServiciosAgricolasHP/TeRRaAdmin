import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { listPayrolls } from "../../services/payrollsList";
import { listCycleWorkdays } from "../../services/workdayCycles";
import { listWorkers } from "../../services/workersService";
import { attempt } from "../../utils/attempt";
import { cyclePaymentsOf } from "../../utils/cyclePayments";
import { errorText } from "../../utils/errorText";
import { millisOf } from "../../utils/syncedList";
import { workerIdResolver } from "../../utils/workerRut";
import { payStateOf } from "../../utils/payState";

// Los pagos de un ciclo en todas sus nóminas. Lo que la pantalla ya tiene se
// pasa (las jornadas del ciclo, las nóminas, los trabajadores) y lo que falta
// se pide a las copias que comparten las pantallas: las jornadas, a la del
// ciclo que mantiene Nómina. `payroll` es la nómina del detalle abierto, en
// su versión vigente; `includeUnpaid` suma lo que no está en ninguna nómina.
export function useCyclePayments({ allPayrolls = null, cycleId, includeUnpaid = false, labors, payroll = null, workdays: givenWorkdays = null, workers: givenWorkers = null }) {
  const [loaded, setLoaded] = useState({ cycleId: null, workdays: null, payrolls: null, workers: null });
  const [error, setError] = useState("");
  const own = loaded.cycleId === cycleId ? loaded : null;
  const workdays = givenWorkdays || own?.workdays || null;
  const listedPayrolls = allPayrolls || own?.payrolls || null;
  const workers = givenWorkers || own?.workers || null;

  const load = useEffectEvent(async (isCancelled) => {
    setError("");
    const { value, error: err } = await attempt(async () => ({
      cycleId,
      workdays: givenWorkdays ? null : await listCycleWorkdays([cycleId]),
      payrolls: allPayrolls ? null : await listPayrolls(),
      workers: givenWorkers ? null : await listWorkers(),
    }));
    if (isCancelled()) return;
    if (err) setError(errorText(err));
    else setLoaded(value);
  });
  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [cycleId]);

  const data = useMemo(() => {
    if (!workdays || !listedPayrolls || !workers) return null;
    const workersById = new Map(workers.map((w) => [w.id, w]));
    const payrolls = (payroll ? [payroll, ...listedPayrolls.filter((p) => p.id !== payroll.id)] : listedPayrolls).map((p) => ({
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
      currentPayrollId: payroll?.id || null,
      includeUnpaid,
    });
  }, [workdays, cycleId, labors, listedPayrolls, payroll, workers, includeUnpaid]);

  return { data, error, loading: !data && !error, payrolls: listedPayrolls };
}
