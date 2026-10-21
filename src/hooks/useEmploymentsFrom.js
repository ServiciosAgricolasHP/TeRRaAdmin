import { useEffect, useState } from "react";
import { listEmploymentsFrom } from "../services/employmentsService";

// Los contratos y honorarios vigentes desde `date` (en caché por 2 horas).
// Con `enabled` en false no lee nada: el filtro que los usa está apagado.
export function useEmploymentsFrom(date, enabled = true) {
  const [state, setState] = useState({ key: "", employments: [], error: "" });
  const key = enabled && date ? date : "";
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    listEmploymentsFrom(key)
      .then((employments) => !cancelled && setState({ key, employments, error: "" }))
      .catch((e) => !cancelled && setState({ key, employments: [], error: e.message || String(e) }));
    return () => {
      cancelled = true;
    };
  }, [key]);
  const ready = !!key && state.key === key;
  return { employments: ready ? state.employments : [], loading: !!key && !ready, error: ready ? state.error : "" };
}
