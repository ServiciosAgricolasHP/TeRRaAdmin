import { useState } from "react";
import { readLogsService, usersService } from "../../services";
import { countedList } from "../../services/cache";
import { attempt } from "../../utils/attempt";

const USERS_LIST = { cache: true, ttl: 10 * 60 * 1000 };

// Carga lo que anotó el registro de lecturas en un rango, más los perfiles
// para los nombres. Cuesta un documento por persona y día (uno si no hay
// nada) y los perfiles, si no estaban en caché.
export function useReadReport() {
  // { logs, profiles, from, to, reads }
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (from, to) => {
    setLoading(true);
    setError("");
    const { value, error: err } = await attempt(() =>
      Promise.all([
        readLogsService.list({ wheres: [["date", ">=", from], ["date", "<=", to]] }),
        countedList(usersService, USERS_LIST),
      ]),
    );
    if (err) {
      setError(err.message || String(err));
    } else {
      const [logs, users] = value;
      setData({ logs, profiles: users.data, from, to, reads: Math.max(1, logs.length) + users.reads });
    }
    setLoading(false);
  };

  return { data, loading, error, load };
}
