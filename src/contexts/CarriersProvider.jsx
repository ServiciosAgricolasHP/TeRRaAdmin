import { useEffect, useEffectEvent, useState, useCallback } from "react";
import { carriersService } from "../services/carriersService";
import { useAuth } from "./AuthContext";
import { CarriersContext } from "./CarriersContext";
import { attempt } from "../utils/attempt";

export function CarriersProvider({ children }) {
  const { user, hasAccess } = useAuth();
  const uid = hasAccess ? user.uid : null;
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { error: err } = await attempt(async () => {
      const all = await carriersService.listAll({ includeInactive: true });
      setCarriers(all);
    });
    if (err) console.error("[Carriers] load failed:", err);
    setLoading(false);
  }, []);

  // `useEffectEvent` lee la versión actual de `reload` sin volver a correr el
  // efecto.
  const reloadForUser = useEffectEvent(() => reload());
  useEffect(() => {
    if (uid) reloadForUser();
  }, [uid]);

  const addCarrier = useCallback(async (data) => {
    const created = await carriersService.createCarrier(data);
    await reload();
    return created;
  }, [reload]);

  const updateCarrier = useCallback(async (id, patch) => {
    await carriersService.updateCarrier(id, patch);
    await reload();
  }, [reload]);

  const softDeleteCarrier = useCallback(async (id) => {
    await carriersService.softDelete(id);
    await reload();
  }, [reload]);

  const restoreCarrier = useCallback(async (id) => {
    await carriersService.restore(id);
    await reload();
  }, [reload]);

  const activeCarriers = carriers.filter((c) => c.active !== false);

  return (
    <CarriersContext.Provider
      value={{
        carriers,
        activeCarriers,
        loading,
        reload,
        addCarrier,
        updateCarrier,
        softDeleteCarrier,
        restoreCarrier,
      }}
    >
      {children}
    </CarriersContext.Provider>
  );
}
