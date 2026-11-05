import { useState } from "react";
import { planPayrollRecalc, applyPayrollRecalc } from "../../../services/payrollRecalc";
import { refreshSnapshotLabors } from "../../../services/payrollSnapshots";
import { attempt } from "../../../utils/attempt";
import { progressOf } from "./progressSteps";

const NO_CHANGES = new Map();
const NO_LINES = [];

// Los pasos de comparar y de aplicar, con el tramo de la barra de cada uno
// (`progressOf`).
const COMPARE_STEPS = {
  workdays: { step: "Leyendo las jornadas de sus ciclos...", unit: "Ciclos", from: 5, to: 70 },
  advances: { step: "Revisando anticipos y bonos...", from: 80, to: 80 },
};
const APPLY_STEPS = {
  payroll: { step: "Guardando la nómina...", from: 5, to: 5 },
  untag: { step: "Soltando las jornadas que salen...", unit: "Jornadas", from: 10, to: 25 },
  tag: { step: "Etiquetando las jornadas...", unit: "Jornadas", from: 25, to: 75 },
  advances: { step: "Ajustando anticipos y bonos...", from: 80, to: 80 },
  snapshot: { step: "Guardando el JSON de la nómina...", from: 88, to: 88 },
};

// Recalcular una nómina pendiente, también al cambiarle los ciclos con
// "✎ Editar ciclos": la vista previa y su aplicación.
export function usePayrollRecalc({ cycles, faenas, onChanged, payroll, subfaenas, toast, workers }) {
  // Recalcular: compara la nómina contra la producción vigente de sus ciclos
  // y muestra los cambios antes de escribir (`planPayrollRecalc` en
  // services/payrollRecalc.js). Con `removed` y `added` (lo elegido en
  // "✎ Editar ciclos"), la nómina queda como si se hubiera armado con esos
  // ciclos. `removalLines` y `additionLines` describen el cambio en la vista
  // previa.
  const [recalcPreview, setRecalcPreview] = useState(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  // El gato con la barra (`ProgressOverlay`) mientras compara y mientras aplica.
  const [recalcProgress, setRecalcProgress] = useState(null);
  // El modal de "✎ Editar ciclos" queda abierto bajo la vista previa, así se
  // puede volver a ajustar; se cierra al aplicar.
  const [cyclesEditOpen, setCyclesEditOpen] = useState(false);

  const computeRecalc = async (change) => {
    const removed = change?.removed || NO_CHANGES;
    const added = change?.added || NO_CHANGES;
    setRecalcBusy(true);
    setRecalcProgress({ step: COMPARE_STEPS.workdays.step, detail: "", percent: 2 });
    const onProgress = (key, done, total) => setRecalcProgress((prev) => progressOf(COMPARE_STEPS, key, done, total) || prev);
    const { error: err } = await attempt(async () => {
      const plan = await planPayrollRecalc(payroll, { cycles, faenas, subfaenas, workers, removed, added, onProgress });
      if (plan.empty) {
        // Sin otros cambios, igual pone al día las labores del JSON: a una
        // nómina armada antes de crear una labor le puede faltar su nombre.
        const repaired = await refreshSnapshotLabors(payroll.id, plan.cycleLabors);
        if (repaired) await onChanged?.();
        toast.success(
          repaired
            ? "Sin cambios en la nómina. Se pusieron al día las labores de su detalle."
            : "Sin cambios — la nómina ya está al día.",
        );
        return;
      }
      setRecalcPreview({
        ...plan,
        removalLines: change?.removalLines || NO_LINES,
        additionLines: change?.additionLines || NO_LINES,
      });
    });
    if (err) toast.error(`Error al recalcular: ${err?.message || err}`);
    setRecalcProgress(null);
    setRecalcBusy(false);
  };
  const startRecalc = () => computeRecalc(null);
  const startCycleEdit = (change) => computeRecalc(change);

  const applyRecalc = async () => {
    if (!recalcPreview) return;
    setRecalcBusy(true);
    setRecalcProgress({ step: APPLY_STEPS.payroll.step, detail: "", percent: 2 });
    const onProgress = (key, done, total) => setRecalcProgress((prev) => progressOf(APPLY_STEPS, key, done, total) || prev);
    const { error: err } = await attempt(async () => {
      await applyPayrollRecalc(payroll.id, recalcPreview, onProgress);
      const cyclesChanged = recalcPreview.removalLines.length > 0 || recalcPreview.additionLines.length > 0;
      setRecalcProgress({ step: "Actualizando...", detail: "", percent: 95 });
      await onChanged?.();
      setRecalcProgress({ step: "Listo ✓", detail: "", percent: 100 });
      setRecalcPreview(null);
      setCyclesEditOpen(false);
      toast.success(cyclesChanged ? "Listo: los ciclos quedaron como los elegiste y la nómina quedó recalculada." : "Nómina recalculada.");
    });
    if (err) toast.error(`Error al aplicar el recálculo: ${err?.message || err}`);
    setTimeout(() => setRecalcProgress(null), err ? 0 : 400);
    setRecalcBusy(false);
  };

  return {
    applyRecalc,
    cyclesEditOpen,
    recalcBusy,
    recalcPreview,
    recalcProgress,
    setCyclesEditOpen,
    setRecalcPreview,
    startCycleEdit,
    startRecalc,
  };
}
