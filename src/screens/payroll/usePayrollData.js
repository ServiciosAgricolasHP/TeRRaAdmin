import { useState, useEffect, useEffectEvent } from "react";
import { listPayrolls } from "../../services/payrollsList";
import { listCycleWorkdays } from "../../services/workdayCycles";
import { cycleStatsOf } from "../../utils/payrollCycles";
import { listWorkers } from "../../services/workersService";
import { listCycles, listJobs, listSubjobs } from "../../services/jobLists";
import { newestFirst } from "../../utils/syncedList";
import { attempt } from "../../utils/attempt";

// Lo que usa la pantalla Nómina: faenas, subfaenas, ciclos, trabajadores, las
// nóminas y lo pendiente de cada ciclo activo. `load` lo relee (con las copias
// del navegador) y `refresh` las pone al día al tiro.
export function usePayrollData({ toast }) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [subjobs, setSubjobs] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [workers, setWorkers] = useState([]);

  const [payrolls, setPayrolls] = useState([]);

  // Totales por ciclo activo (ver `cycleStatsOf`).
  const [cycleStats, setCycleStats] = useState({});
  // Separado de `loading`: al refrescar, el spinner va en el botón y no tapa
  // la pantalla con "Cargando…".
  const [refreshing, setRefreshing] = useState(false);

  // Con `fresh`, las listas y las jornadas se ponen al día sin esperar el
  // minuto.
  const load = async (opts) => {
    const fresh = !!opts?.fresh;
    setLoading(true);
    const { value, error: err } = await attempt(async () => {
      const [f, s, c, w, p] = await Promise.all([
        listJobs({ fresh }),
        listSubjobs({ fresh }),
        listCycles({ fresh }).then(newestFirst),
        listWorkers({ fresh }),
        // Al día cada vez: la pantalla vuelve a cargar después de cada acción,
        // y lo que cambió otra persona (o la hora de una nómina recién
        // generada) llega con la puesta al día.
        listPayrolls({ fresh: true }),
      ]);
      setJobs(f);
      setSubjobs(s);
      setCycles(c);
      setWorkers(w);
      setPayrolls(p);

      // Pendiente, lo que ya entró a nómina y rango de fechas de los ciclos activos.
      const activeIds = c.filter((x) => x.status !== "closed").map((x) => x.id);
      // De las copias por ciclo (`syncWorkdayCycles`), las mismas con que
      // `buildPreview` arma la nómina. Después de generar, pagar o cualquier
      // escritura de jornadas en este equipo, se ponen al día sin esperar el
      // minuto.
      const wds = await listCycleWorkdays(activeIds, { fresh });
      const stats = cycleStatsOf(c, w, wds);
      setCycleStats(stats);
      return { cycles: c, stats, payrolls: p };
    });
    if (err) toast.error("No se pudo cargar la nómina: " + (err.message || err));
    setLoading(false);
    return value;
  };

  const loadOnMount = useEffectEvent(() => load());
  useEffect(() => {
    loadOnMount();
  }, []);

  // Trae al tiro lo que otra persona cambió en trabajadores, labores o
  // jornadas: las listas sincronizadas y las jornadas de los ciclos activos se
  // ponen al día (lo cambiado más el conteo, sin releerlas enteras).
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const { error: err } = await attempt(async () => {
      await load({ fresh: true });
      toast.success("Datos actualizados");
    });
    if (err) {
      console.error(err);
      toast.error("No se pudo recargar.");
    }
    setRefreshing(false);
  };
  // Las nóminas con lo último que se escribió en este equipo, como quién cobró
  // el efectivo: esas escrituras corrigen la copia de la lista en su lugar,
  // así que casi nunca cuesta lecturas. Devuelve la lista, o null si falla.
  const syncPayrollList = async () => {
    const { value } = await attempt(() => listPayrolls());
    if (value) setPayrolls(value);
    return value || null;
  };
  return {
    cycles,
    cycleStats,
    jobs,
    load,
    loading,
    payrolls,
    refresh,
    refreshing,
    subjobs,
    syncPayrollList,
    workers,
  };
}
