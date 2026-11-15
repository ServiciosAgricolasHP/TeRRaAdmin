import { useEffect, useState } from "react";
import { listWorkers } from "../services/workersService";
import { activeWorkers } from "../utils/workerMerge";
import { errorText } from "../utils/errorText";

// La lista completa de trabajadores (`listWorkers`) para mostrar y elegir: la
// copia del navegador, puesta al día con lo que cambió, sin las fichas unidas
// a otra (`activeWorkers`).
export function useWorkersList() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listWorkers()
      .then((list) => {
        if (alive) setWorkers(activeWorkers(list));
      })
      .catch((err) => {
        if (alive) setError(errorText(err));
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
