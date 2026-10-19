import { useState, useEffect } from "react";
import { payrollSnapshotsService } from "../../../services";

// El snapshot JSON de la nómina, leído al abrir el detalle.
export function usePayrollSnapshot({ payroll }) {
  "use no memo";
  // Snapshot que se carga al abrir, para el detalle por trabajador (días
  // pagados por ciclo, como en Trabajadores). Sin snapshot, el detalle muestra
  // solo las 4 métricas básicas.
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  useEffect(() => {
    if (!payroll?.id) return;
    let cancelled = false;
    setSnapshotLoading(true);
    payrollSnapshotsService.getById(payroll.id)
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          const { id: _omit, ...rest } = doc;
          setSnapshot(rest);
        } else if (payroll.snapshot) {
          setSnapshot(payroll.snapshot);
        } else {
          setSnapshot(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("No se pudo cargar snapshot:", err);
          setSnapshot(payroll.snapshot || null);
        }
      })
      .finally(() => { if (!cancelled) setSnapshotLoading(false); });
    return () => { cancelled = true; };
  }, [payroll?.id]);
  return { snapshot, snapshotLoading };
}
