import { useEffect, useEffectEvent, useState } from "react";
import { attempt } from "../utils/attempt";

// Una lista corta de empresas con nombre (empleadores, mandantes), leída al
// montar con `list`. `reload` la vuelve a pedir después de editarla.
export function useNamedList(list) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    const { error: err } = await attempt(async () => {
      setItems(await list());
    });
    setLoading(false);
    if (err) throw err;
  };
  const loadOnMount = useEffectEvent(() => reload());
  useEffect(() => {
    loadOnMount();
  }, []);
  const nameOf = (id) => items.find((e) => e.id === id)?.name || "—";
  return { items, loading, nameOf, reload };
}
