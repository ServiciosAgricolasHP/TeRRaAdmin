import { useState, useEffect, useEffectEvent } from "react";
import { payrollSnapshotsService } from "../../../services";

// El snapshot JSON de una nómina, leído al abrirla, para el detalle por
// trabajador (días pagados por ciclo, como en Trabajadores). Sin snapshot, el
// detalle muestra solo las 4 métricas básicas. Si no hay doc aparte o falla la
// lectura, usa el embebido en la nómina. Con `payroll` null no lee nada.
export function usePayrollSnapshot({ payroll }) {
  // `loaded.id` es la nómina para la que se leyó: mientras no sea la de ahora,
  // está cargando.
  const [loaded, setLoaded] = useState({ id: null, snapshot: null });
  const payrollId = payroll?.id || null;
  const embedded = useEffectEvent(() => payroll?.snapshot || null);
  useEffect(() => {
    if (!payrollId) return;
    let cancelled = false;
    payrollSnapshotsService.getById(payrollId)
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          const { id: _omit, ...rest } = doc;
          setLoaded({ id: payrollId, snapshot: rest });
        } else {
          setLoaded({ id: payrollId, snapshot: embedded() });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("No se pudo cargar snapshot:", err);
          setLoaded({ id: payrollId, snapshot: embedded() });
        }
      });
    return () => { cancelled = true; };
  }, [payrollId]);
  const current = payrollId !== null && loaded.id === payrollId;
  return { snapshot: current ? loaded.snapshot : null, snapshotLoading: payrollId !== null && !current };
}
