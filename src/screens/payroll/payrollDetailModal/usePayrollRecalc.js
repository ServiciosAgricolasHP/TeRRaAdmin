import { useState } from "react";
import { planPayrollRecalc, applyPayrollRecalc } from "../../../services/payrollRecalc";
import { attempt } from "../../../utils/attempt";

const NO_CHANGES = new Map();
const NO_LINES = [];

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
  // El modal de "✎ Editar ciclos" queda abierto bajo la vista previa, así se
  // puede volver a ajustar; se cierra al aplicar.
  const [cyclesEditOpen, setCyclesEditOpen] = useState(false);

  const computeRecalc = async (change) => {
    const removed = change?.removed || NO_CHANGES;
    const added = change?.added || NO_CHANGES;
    setRecalcBusy(true);
    const { error: err } = await attempt(async () => {
      const plan = await planPayrollRecalc(payroll, { cycles, faenas, subfaenas, workers, removed, added });
      if (plan.empty) {
        toast.success("Sin cambios — la nómina ya está al día.");
        return;
      }
      setRecalcPreview({
        ...plan,
        removalLines: change?.removalLines || NO_LINES,
        additionLines: change?.additionLines || NO_LINES,
      });
    });
    if (err) toast.error(`Error al recalcular: ${err?.message || err}`);
    setRecalcBusy(false);
  };
  const startRecalc = () => computeRecalc(null);
  const startCycleEdit = (change) => computeRecalc(change);

  const applyRecalc = async () => {
    if (!recalcPreview) return;
    setRecalcBusy(true);
    const { error: err } = await attempt(async () => {
      await applyPayrollRecalc(payroll.id, recalcPreview);
      const cyclesChanged = recalcPreview.removalLines.length > 0 || recalcPreview.additionLines.length > 0;
      setRecalcPreview(null);
      setCyclesEditOpen(false);
      await onChanged?.();
      toast.success(cyclesChanged ? "Listo: los ciclos quedaron como los elegiste y la nómina quedó recalculada." : "Nómina recalculada.");
    });
    if (err) toast.error(`Error al aplicar el recálculo: ${err?.message || err}`);
    setRecalcBusy(false);
  };

  return {
    applyRecalc,
    cyclesEditOpen,
    recalcBusy,
    recalcPreview,
    setCyclesEditOpen,
    setRecalcPreview,
    startCycleEdit,
    startRecalc,
  };
}
