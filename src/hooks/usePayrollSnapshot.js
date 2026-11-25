import { useState, useEffect, useEffectEvent } from "react";
import { completeSnapshotLabors } from "../services/payrollSnapshots";
import { readStored } from "../services/payrollSnapshotStore";

// El snapshot JSON de una nómina, leído al abrirla, para el detalle por
// trabajador (días pagados por ciclo, como en Trabajadores), armado con sus
// partes. Sin snapshot, el detalle muestra solo las 4 métricas básicas. Si no
// hay doc aparte o falla la lectura, usa el embebido en la nómina. Si a un
// ciclo le falta la labor de alguna jornada, la toma del ciclo
// (`completeSnapshotLabors`), sin escribir. Con `payroll` null no lee nada. `reload` lo vuelve a leer después de editar
// la nómina; mientras tanto se sigue viendo el anterior.
export function usePayrollSnapshot({ payroll }) {
  // `loaded.id` es la nómina para la que se leyó: mientras no sea la de ahora,
  // está cargando.
  const [loaded, setLoaded] = useState({ id: null, snapshot: null });
  const [version, setVersion] = useState(0);
  const payrollId = payroll?.id || null;
  const embedded = useEffectEvent(() => payroll?.snapshot || null);
  useEffect(() => {
    if (!payrollId) return;
    let cancelled = false;
    readStored(payrollId)
      .then((stored) => stored?.snapshot || embedded())
      .catch((err) => {
        console.warn("No se pudo cargar snapshot:", err);
        return embedded();
      })
      .then((snapshot) => completeSnapshotLabors(snapshot))
      .then((snapshot) => {
        if (!cancelled) setLoaded({ id: payrollId, snapshot });
      });
    return () => { cancelled = true; };
  }, [payrollId, version]);
  const current = payrollId !== null && loaded.id === payrollId;
  const reload = () => setVersion((v) => v + 1);
  return { snapshot: current ? loaded.snapshot : null, snapshotLoading: payrollId !== null && !current, reload };
}
