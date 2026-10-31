import { useState, useMemo, useEffect, useEffectEvent } from "react";
import { tripsService } from "../../services/transportsService";
import { attempt } from "../../utils/attempt";

// Vueltas de transporte del ciclo y su total, que se muestra aparte del total
// de las labores.
export function useCycleTransports({ id }) {
  const [cycleTrips, setCycleTrips] = useState([]);

  const transportTotal = useMemo(
    () => cycleTrips.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [cycleTrips],
  );

  const reloadTransports = async () => {
    if (!id) return;
    const { error: err } = await attempt(async () => {
      const list = await tripsService.listByCycle(id);
      setCycleTrips(list);
    });
    if (err) console.error("[Transports] load failed:", err);
  };

  // Se vuelven a leer al cambiar de ciclo.
  const reloadForCycle = useEffectEvent(() => reloadTransports());
  useEffect(() => {
    reloadForCycle();
  }, [id]);
  return { cycleTrips, reloadTransports, transportTotal };
}
