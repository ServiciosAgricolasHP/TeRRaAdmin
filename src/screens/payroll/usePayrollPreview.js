import { useState, useRef, useMemo } from "react";
import { workdaysForNewPayroll } from "../../services/payrollsService";
import { workerKeys } from "../../services/workersService";
import { newPayrollCycleDetails } from "../../utils/payrollItem";
import { aggregateWorkerAmounts, payrollSuggestedName, groupCashByLeader } from "../../utils/payroll";
import { resolveCurrentRut } from "./helpers";
import { listPendingForWorkers } from "../../services/advancesService";
import { previewItemsOf, withPreviewEdit } from "../../utils/payrollPreview";
import { isCashBank } from "../../utils/banks";
import { attempt } from "../../utils/attempt";

// La vista previa de una nómina nueva: se arma con lo elegido, se edita fila
// por fila o en bloque, y da los totales de lo incluido.
export function usePayrollPreview({ chosenCycles, cycles, jobs, people, subjobs, toast, workers }) {
  // Los ciclos de la nómina que se está previsualizando, para el filtro por
  // ciclo: los elegidos más los que traen las personas sueltas.
  const [previewCycles, setPreviewCycles] = useState([]);
  const [step, setStep] = useState(1); // 1 = elegir ciclos, 2 = vista previa
  const [previewItems, setPreviewItems] = useState([]); // items de la vista previa; la forma se arma en buildPreview
  // Datos de origen de buildPreview, con los que generateAndSave arma el
  // snapshot sin volver a leer jornadas ni anticipos.
  const previewWorkdaysRef = useRef([]);
  const previewAdvancesRef = useRef([]);
  const [busy, setBusy] = useState(false);

  const [payrollName, setPayrollName] = useState("");
  // Clasificación: "nomina" (default) o "diferencia". Las diferencias (ajustes,
  // pagos puntuales) se listan en una pestaña aparte del historial.
  const [payrollClassification, setPayrollClassification] = useState("nomina");

  const buildPreview = async () => {
    if (chosenCycles.size === 0 && people.length === 0) return;
    setBusy(true);
    const { error: err } = await attempt(async () => {
      // Los tipos de labor de todos los ciclos: los días de una persona suelta
      // pueden ser de un ciclo que no se eligió.
      const laborTypeById = new Map();
      for (const cycle of cycles) {
        for (const labor of cycle.labors || []) {
          laborTypeById.set(labor.id, labor.type);
        }
      }

      // Lo pendiente de los ciclos y labores elegidos, más los días de las
      // personas sueltas, releídos (ver `workdaysForNewPayroll`). Las labores
      // no marcadas quedan disponibles para una próxima nómina. Los ciclos se
      // leen con el mismo helper que `load()`, así que dentro del minuto salen
      // de la caché; el botón de refrescar la invalida.
      const { workdays: allWorkdays, taken } = await workdaysForNewPayroll({
        chosen: chosenCycles,
        people: people.map((p) => ({ keys: workerKeys(p.worker), workdayIds: p.workdayIds })),
      });
      // Los ciclos de la nómina: los elegidos con alguna labor y los que traen
      // las personas sueltas. Cada item lleva una entrada por cada uno, incluso
      // en $0.
      const payrollCycles = newPayrollCycleDetails({
        cycles,
        chosen: chosenCycles,
        workdays: allWorkdays,
        faenas: jobs,
        subfaenas: subjobs,
      });

      const aggregates = aggregateWorkerAmounts(allWorkdays, laborTypeById);

      // Anticipos vigentes de todos los de la vista previa; el servidor
      // devuelve solo pending/partial.
      const keyOf = resolveCurrentRut(workers);
      const candidateIds = aggregates.filter((a) => a.total > 0).map(keyOf);
      const pendingAdvances = await listPendingForWorkers(candidateIds);
      previewWorkdaysRef.current = allWorkdays;
      previewAdvancesRef.current = pendingAdvances;
      const items = previewItemsOf({ aggregates, workers, payrollCycles, pendingAdvances });

      setPreviewItems(items);
      setPreviewCycles(payrollCycles.map((c) => ({ id: c.id, label: c.label })));
      setPayrollName(payrollSuggestedName());
      setStep(2);
      if (taken > 0) {
        toast.warning(`Otra nómina tomó ${taken} jornada(s) de las personas sueltas mientras tanto; quedaron afuera.`);
      }
    });
    if (err) toast.error(`No se pudo armar la vista previa: ${err?.message || err}`);
    setBusy(false);
  };

  const totalSelected = useMemo(
    () => previewItems.filter((p) => p.include).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [previewItems],
  );
  const countSelected = useMemo(() => previewItems.filter((p) => p.include).length, [previewItems]);
  const bankSelected = useMemo(
    () => previewItems.filter((p) => p.include && !isCashBank(p.bankCode)),
    [previewItems],
  );
  const cashSelected = useMemo(
    () => previewItems.filter((p) => p.include && isCashBank(p.bankCode)),
    [previewItems],
  );
  const cashGroups = useMemo(() => groupCashByLeader(cashSelected), [cashSelected]);

  const updatePreview = (rut, patch) => {
    setPreviewItems((prev) => prev.map((p) => (p.rut !== rut ? p : withPreviewEdit(p, patch))));
  };

  const bulkUpdate = (predicate, patch) => {
    setPreviewItems((prev) => prev.map((p) => (predicate(p) ? { ...p, ...patch } : p)));
  };
  // Vuelve al paso de elegir ciclos, sin vista previa.
  const resetPreview = () => {
    setPreviewItems([]);
    setPreviewCycles([]);
    setPayrollName("");
    setStep(1);
  };
  return {
    bankSelected,
    buildPreview,
    bulkUpdate,
    busy,
    cashGroups,
    countSelected,
    payrollClassification,
    payrollName,
    previewAdvancesRef,
    previewCycles,
    previewItems,
    previewWorkdaysRef,
    resetPreview,
    setBusy,
    setPayrollClassification,
    setPayrollName,
    setStep,
    step,
    totalSelected,
    updatePreview,
  };
}
