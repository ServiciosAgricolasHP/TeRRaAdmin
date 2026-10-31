import { useEffect, useState } from "react";
import { listWorkers } from "../services/workersService";

// La lista completa de trabajadores (`listWorkers`): la copia del navegador,
// puesta al día con lo que cambió.
export function useWorkersList() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listWorkers()
      .then((list) => {
        if (alive) setWorkers(list);
      })
      .catch((err) => {
        if (alive) setError(err?.message || String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { workers, loading, error };
}
