import { useEffect, useEffectEvent, useState } from "react";
import { employersService, EMPLOYERS_LIST } from "../services/employmentsService";
import { attempt } from "../utils/attempt";

// Las empresas empleadoras, en caché por un día. `reload` vuelve a leerlas
// después de editarlas.
export function useEmployers() {
  const [employers, setEmployers] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    const { error: err } = await attempt(async () => {
      setEmployers(await employersService.list(EMPLOYERS_LIST));
    });
    setLoading(false);
    if (err) throw err;
  };
  const loadOnMount = useEffectEvent(() => reload());
  useEffect(() => {
    loadOnMount();
  }, []);
  const nameOf = (id) => employers.find((e) => e.id === id)?.name || "—";
  return { employers, loading, nameOf, reload };
}
