import { useEffect, useState } from "react";
import { listJobs, listSubjobs } from "../../../services/jobLists";
import { tripsService } from "../../../services/transportsService";
import { useToast } from "../../../contexts/ToastContext";
import { hasChanges } from "../../../utils/formChanges";

// Las tarifas que se escriben en el modal de vueltas sin precio y su guardado.
// Guarda de a una vuelta (`tripsService.update`), que recalcula el monto y el
// total de su resumen y de su quincena; en serie, para que dos vueltas del
// mismo resumen no recalculen su total al mismo tiempo.
export function useTripRates({ onSaved }) {
  const toast = useToast();
  const [rates, setRates] = useState({}); // tripId → texto escrito
  const [progress, setProgress] = useState(null); // { done, total } mientras guarda
  const [refs, setRefs] = useState({});

  // Los nombres de las faenas y subfaenas, para la columna de la labor.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [faenas, subfaenas] = await Promise.all([listJobs(), listSubjobs()]).catch(() => [[], []]);
      if (!cancelled) setRefs({ faenaById: new Map(faenas.map((f) => [f.id, f])), subfaenaById: new Map(subfaenas.map((s) => [s.id, s])) });
    })();
    return () => { cancelled = true; };
  }, []);

  const setRate = (tripId, value) => setRates((prev) => ({ ...prev, [tripId]: value }));
  // Pone la tarifa por defecto del transportista en todas sus vueltas.
  const fillDefault = (group) => setRates((prev) => {
    const next = { ...prev };
    for (const t of group.trips) next[t.id] = String(group.carrier?.defaultRate || "");
    return next;
  });

  const toSave = Object.entries(rates).filter(([, v]) => Number(v) > 0);
  const saving = progress != null;
  const dirty = !saving && hasChanges({}, rates);

  const save = async () => {
    setProgress({ done: 0, total: toSave.length });
    let saved = 0;
    const failed = [];
    for (const [tripId, value] of toSave) {
      await tripsService.update(tripId, { rate: Number(value) }).then(
        () => { saved += 1; },
        (err) => failed.push(err.message || String(err)),
      );
      setProgress({ done: saved + failed.length, total: toSave.length });
    }
    setProgress(null);
    if (failed.length) toast.error(`No se pudieron guardar ${failed.length} vuelta(s): ${failed[0]}`);
    if (saved) toast.success(`${saved} vuelta(s) con precio`);
    onSaved(saved);
  };

  return { refs, rates, setRate, fillDefault, toSave, saving, progress, dirty, save };
}
