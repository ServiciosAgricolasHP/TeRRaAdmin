import { useState } from "react";
import { planPayrollRecalc, applyPayrollRecalc } from "../../../services/payrollRecalc";
import { removalSummaryOf } from "../../../utils/payrollDetail";
import { attempt } from "../../../utils/attempt";

const NOTHING_REMOVED = new Map();

// Recalcular una nómina pendiente, con lo marcado para sacar en la sección de
// ciclos: la vista previa y su aplicación.
export function usePayrollRecalc({ cycleBreakdown, cycles, faenas, onChanged, payroll, subfaenas, toast, workers }) {
  // Recalcular: compara la nómina contra la producción vigente de sus ciclos
  // y muestra los cambios antes de escribir (`planPayrollRecalc` en
  // services/payrollRecalc.js). Con `removed` (lo destildado en la sección de
  // ciclos), la nómina queda como si se hubiera armado sin eso. `lines`
  // describe lo sacado para la vista previa.
  const [recalcPreview, setRecalcPreview] = useState(null);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const computeRecalc = async (removed = NOTHING_REMOVED, lines = []) => {
    setRecalcBusy(true);
    const { error: err } = await attempt(async () => {
      const plan = await planPayrollRecalc(payroll, { cycles, faenas, subfaenas, workers, removed });
      if (plan.empty) {
        toast.success("Sin cambios — la nómina ya está al día.");
        return;
      }
      setRecalcPreview({ ...plan, removalLines: lines });
    });
    if (err) toast.error(`Error al recalcular: ${err?.message || err}`);
    setRecalcBusy(false);
  };

  const applyRecalc = async () => {
    if (!recalcPreview) return;
    setRecalcBusy(true);
    const { error: err } = await attempt(async () => {
      await applyPayrollRecalc(payroll.id, recalcPreview);
      const removedSome = recalcPreview.removalLines.length > 0;
      setRecalcPreview(null);
      setRemoval(new Map());
      await onChanged?.();
      toast.success(removedSome ? "Listo: se sacó lo elegido y la nómina quedó recalculada." : "Nómina recalculada.");
    });
    if (err) toast.error(`Error al aplicar el recálculo: ${err?.message || err}`);
    setRecalcBusy(false);
  };

  // Lo que se va a sacar, marcado con las casillas de la sección de ciclos:
  // Map(cycleId → true para el ciclo entero, o un Set con las labores). No se
  // escribe nada hasta recalcular.
  const [removal, setRemoval] = useState(() => new Map());

  // Lo marcado para sacar que sigue en la nómina, y su resumen para la barra
  // de abajo y la vista previa.
  const activeRemoval = new Map([...removal].filter(([cid]) => cycleBreakdown.some((c) => c.id === cid)));
  const removalSummary = removalSummaryOf(cycleBreakdown, activeRemoval);
  const startRecalc = () => computeRecalc(activeRemoval, removalSummary.lines);

  const toggleCycleRemoval = (cycleId) =>
    setRemoval((prev) => {
      const next = new Map(prev);
      if (next.get(cycleId) === true) next.delete(cycleId);
      else next.set(cycleId, true);
      return next;
    });
  // Destildar todas las labores de un ciclo es sacar el ciclo entero.
  const toggleLaborRemoval = (cycle, laborId) =>
    setRemoval((prev) => {
      const next = new Map(prev);
      const allLaborIds = cycle.labors.map((l) => l.id);
      const before = prev.get(cycle.id);
      const removedLabors = new Set(before === true ? allLaborIds : before || []);
      if (removedLabors.has(laborId)) removedLabors.delete(laborId);
      else removedLabors.add(laborId);
      if (removedLabors.size === 0) next.delete(cycle.id);
      else if (allLaborIds.every((id) => removedLabors.has(id))) next.set(cycle.id, true);
      else next.set(cycle.id, removedLabors);
      return next;
    });
  return {
    activeRemoval,
    applyRecalc,
    recalcBusy,
    recalcPreview,
    removalSummary,
    setRecalcPreview,
    setRemoval,
    startRecalc,
    toggleCycleRemoval,
    toggleLaborRemoval,
  };
}
