import { useEffect, useState } from "react";
import { workersService } from "../services";
import { WORKERS_LIST } from "../services/workersService";

// La lista completa de trabajadores, de la misma caché que usan Trabajadores,
// Nómina y Calendario: la primera vez cuesta una lectura por trabajador y
// después sale gratis hasta que vence (2 h).
export function useWorkersList() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    workersService
      .list(WORKERS_LIST)
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
