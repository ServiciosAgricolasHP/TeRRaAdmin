import { useState, useEffect } from "react";
import { jobsService, subjobsService, cyclesService, workersService, listWorkdaysByCycles, workdaysService } from "../../services";
import { payrollsService } from "../../services/payrollsService";
import { cycleStatsOf } from "../../utils/payrollCycles";
import { WORKERS_LIST } from "../../services/workersService";

// Lo que usa la pantalla Nómina: faenas, subfaenas, ciclos, trabajadores, las
// nóminas y lo pendiente de cada ciclo activo. `load` lo relee (con la caché) y
// `refresh` lo relee sin ella.
export function usePayrollData({ toast }) {
  "use no memo";
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

  const load = async () => {
    setLoading(true);
    try {
      const [f, s, c, w, p] = await Promise.all([
        jobsService.list({ order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        subjobsService.list({ order: ["name", "asc"], cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        cyclesService.list({ order: ["createdAt", "desc"], cache: true, persist: true, ttl: 5 * 60 * 1000 }),
        workersService.list(WORKERS_LIST),
        payrollsService.list({ order: ["createdAt", "desc"], take: 50, cache: true, persist: true, ttl: 5 * 60 * 1000 }),
      ]);
      setJobs(f);
      setSubjobs(s);
      setCycles(c);
      setWorkers(w);
      setPayrolls(p);

      // Pendiente, lo que ya entró a nómina y rango de fechas de los ciclos activos.
      const activeIds = c.filter((x) => x.status !== "closed").map((x) => x.id);
      // Por ciclo y cacheado: `buildPreview` vuelve a pedir estos mismos
      // documentos al elegir los ciclos y los toma de la misma clave de caché.
      const wds = await listWorkdaysByCycles(activeIds);
      const stats = cycleStatsOf(c, w, wds);
      setCycleStats(stats);
      return { cycles: c, stats, payrolls: p };
    } catch (err) {
      toast.error("No se pudo cargar la nómina: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Relee desde Firestore sin la caché local (memoria y localStorage): invalida
  // lo que alimenta el armado de la nómina y recarga. Sirve cuando otro usuario
  // cambió trabajadores, labores o jornadas y la caché todavía no vence.
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      jobsService.invalidate();
      subjobsService.invalidate();
      cyclesService.invalidate();
      workersService.invalidate();
      workdaysService.invalidate();
      payrollsService.invalidate();
      await load();
      toast.success("Datos actualizados");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo recargar.");
    } finally {
      setRefreshing(false);
    }
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
    workers,
  };
}
