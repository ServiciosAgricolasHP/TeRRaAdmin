import { useEffect, useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { loadCarrierSummaryData } from "../../../services/carrierSummaryService";

// Los datos del resumen de un transportista, leídos de nuevo cuando cambia lo
// que entra (con o sin lo pagado, y el rango).
export function useCarrierSummaryData(carrierId, { includePaid, from, to }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const loaded = await loadCarrierSummaryData(carrierId, { includePaid, from, to }).catch((err) => {
        if (!cancelled) toast.error("No se pudo cargar el resumen del transportista: " + (err.message || err));
        return null;
      });
      if (cancelled) return;
      if (loaded) setData(loaded);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [carrierId, includePaid, from, to, toast]);

  return { data, loading };
}
