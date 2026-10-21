import { useEffect, useState } from "react";
import { listEmploymentsFrom, listSettlements } from "../../services/employmentsService";
import { localIsoDate } from "../../utils/dates";

// Lo que muestra la pestaña Contratos: los períodos vigentes desde hoy
// (también los que empiezan más adelante) y los finiquitos pendientes,
// solicitados o listos en los últimos 90 días. `reload` los vuelve a leer
// después de una acción.
export function useEmployments() {
  const today = localIsoDate();
  const [active, setActive] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const since = new Date();
    since.setDate(since.getDate() - 90);
    Promise.all([listEmploymentsFrom(today), listSettlements(localIsoDate(since))])
      .then(([a, s]) => {
        if (cancelled) return;
        setActive(a);
        setSettlements(s);
        setError("");
      })
      .catch((e) => !cancelled && setError(e.message || "No se pudieron leer los contratos."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [today, version]);

  return { active, settlements, loading, error, today, reload: () => setVersion((v) => v + 1) };
}
