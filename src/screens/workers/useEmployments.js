import { useEffect, useState } from "react";
import { listEmployments } from "../../services/employmentsService";
import { localIsoDate } from "../../utils/dates";
import { openFrom, settlementsSince } from "../../utils/employment";

// Lo que muestra la pestaña Contratos: los períodos vigentes desde hoy
// (también los que empiezan más adelante) y los finiquitos pendientes,
// solicitados o listos en los últimos 90 días, de la lista sincronizada de
// períodos. `reload` los vuelve a pedir después de una acción y `refresh`
// trae lo que cambió en otro equipo sin esperar el minuto.
export function useEmployments() {
  const today = localIsoDate();
  const [active, setActive] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState({ version: 0, fresh: false });

  useEffect(() => {
    let cancelled = false;
    const since = new Date();
    since.setDate(since.getDate() - 90);
    listEmployments({ fresh: request.fresh })
      .then((all) => {
        if (cancelled) return;
        setActive(openFrom(all, today));
        setSettlements(settlementsSince(all, localIsoDate(since)));
        setError("");
      })
      .catch((e) => !cancelled && setError(e.message || "No se pudieron leer los contratos."))
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [today, request]);

  const reload = () => setRequest((r) => ({ version: r.version + 1, fresh: false }));
  const refresh = () => {
    setRefreshing(true);
    setRequest((r) => ({ version: r.version + 1, fresh: true }));
  };
  return { active, settlements, loading, refreshing, error, today, reload, refresh };
}
