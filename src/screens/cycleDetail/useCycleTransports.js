import { useState, useMemo, useEffect } from "react";
import { tripsService } from "../../services/transportsService";

// Vueltas de transporte del ciclo y su total, que se muestra aparte del total
// de las labores.
export function useCycleTransports({ id }) {
  "use no memo";
  const [cycleTrips, setCycleTrips] = useState([]);

  const transportTotal = useMemo(
    () => cycleTrips.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [cycleTrips],
  );

  const reloadTransports = async () => {
    if (!id) return;
    try {
      const list = await tripsService.listByCycle(id);
      setCycleTrips(list);
    } catch (err) {
      console.error("[Transports] load failed:", err);
    }
  };

  useEffect(() => {
    reloadTransports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return { cycleTrips, reloadTransports, transportTotal };
}
