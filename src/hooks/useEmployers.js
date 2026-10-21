import { useEffect, useState } from "react";
import { employersService, EMPLOYERS_LIST } from "../services/employmentsService";

// Las empresas empleadoras, en caché por un día. `reload` vuelve a leerlas
// después de editarlas.
export function useEmployers() {
  const [employers, setEmployers] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    try {
      setEmployers(await employersService.list(EMPLOYERS_LIST));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);
  const nameOf = (id) => employers.find((e) => e.id === id)?.name || "—";
  return { employers, loading, nameOf, reload };
}
