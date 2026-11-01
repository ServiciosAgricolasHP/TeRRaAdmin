import { useState, useEffect, useMemo } from "react";
import { transportPaymentsService } from "../../services";
import { syncCycles, syncJobs } from "../../services/jobLists";
import { payrollsService } from "../../services/payrollsService";
import { fortnightsService } from "../../services/transportsService";
import { syncCommitments } from "../../services/commitmentsService";
import { countedList } from "../../services/cache";
import { countWorkdaysInRange } from "../../services/countsService";
import { useToast } from "../../contexts/ToastContext";
import { fmtMonthKey } from "../../utils/format";
import { localIsoDate } from "../../utils/dates";
import { commitmentsWeekOf, lastMonthKeys, monthRangeOfKey } from "../../utils/dashboard";
import { attempt } from "../../utils/attempt";

// Lo que lee el Dashboard al abrirse: faenas, ciclos, nóminas, quincenas y
// resúmenes de transporte, el conteo de jornadas por mes y los Cheques y pagos
// de la semana. `reads` suma las lecturas de las tres cargas.
export function useDashboardData() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [reads, setReads] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [fortnights, setFortnights] = useState([]);
  const [payments, setPayments] = useState([]);
  const [workdayMonths, setWorkdayMonths] = useState([]);
  const [countReads, setCountReads] = useState(0);
  const [commitments, setCommitments] = useState(null);
  const [commitmentReads, setCommitmentReads] = useState(0);

  // Serie de actividad de los últimos 12 meses. Un `getCountFromServer` por mes
  // = 12 lecturas para el año entero, contra las decenas de miles que costaría
  // traerse las filas. No depende del selector de período: se pide una sola vez
  // por sesión y alimenta tanto la tarjeta como el gráfico de historia.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys = lastMonthKeys(12);
      const { error: err } = await attempt(async () => {
        const counts = await Promise.all(
          keys.map((k) => {
            const { start, end } = monthRangeOfKey(k);
            return countWorkdaysInRange(start, end);
          }),
        );
        if (cancelled) return;
        setWorkdayMonths(keys.map((k, i) => ({ key: k, label: fmtMonthKey(k), workdayCount: counts[i] })));
        setCountReads(keys.length);
      });
      if (err && !cancelled) console.error("[dashboard] conteo de jornadas:", err);
    })();
    return () => { cancelled = true; };
  }, []);

  // Cheques y pagos, aparte de la carga principal: si falla, el resto del
  // tablero se muestra igual. Sale de la copia que comparte con la pantalla
  // (`syncCommitments`).
  useEffect(() => {
    let cancelled = false;
    syncCommitments()
      .then(({ data, reads }) => {
        if (cancelled) return;
        setCommitments(data);
        setCommitmentReads(reads);
      })
      .catch((err) => console.error("[dashboard] cheques y pagos:", err));
    return () => { cancelled = true; };
  }, []);

  const commitmentsWeek = useMemo(
    () => (commitments ? commitmentsWeekOf(commitments, localIsoDate()) : null),
    [commitments],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { error: err } = await attempt(async () => {
        // Los resúmenes de transporte se traen siempre por 12 meses (la ventana
        // más larga que se puede pedir) y todo lo que depende del período se
        // filtra en cliente. Así cambiar de período no cuesta ninguna lectura,
        // y la curva de deuda tiene el histórico completo que necesita.
        const historyStart = `${lastMonthKeys(12)[0]}-01`;
        const [f, c, p, q, pays] = await Promise.all([
          // Las faenas y los ciclos salen de la copia que comparten todas las
          // pantallas. Las nóminas copian las opciones exactas de Nómina para
          // compartir clave de caché y salir gratis.
          syncJobs(),
          syncCycles(),
          countedList(payrollsService, { order: ["createdAt", "desc"], take: 50, cache: true, persist: true, ttl: 5 * 60 * 1000 }),
          fortnightsService.listAll(),
          transportPaymentsService.listSince(new Date(historyStart)),
        ]);
        if (cancelled) return;
        setJobs(f.data);
        setCycles(c.data);
        setPayrolls(p.data);
        setFortnights(q);
        setPayments(pays);
        setReads(f.reads + c.reads + p.reads + q.length + pays.length);
      });
      if (err && !cancelled) {
        console.error("[dashboard] carga:", err);
        toast.error("No se pudo cargar el dashboard: " + (err.message || err));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [toast]);

  return {
    commitmentsWeek,
    cycles,
    fortnights,
    jobs,
    loading,
    payments,
    payrolls,
    reads: reads + countReads + commitmentReads,
    workdayMonths,
  };
}
