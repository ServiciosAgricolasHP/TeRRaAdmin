import { useDeferredValue, useMemo } from "react";
import { newPayrollDocs, newPayrollWeight } from "../../utils/newPayroll";

const SAMPLE_DATE = "2000-01-01T00:00:00.000Z";

// Cuánto pesaría la nómina de la vista previa al guardarla
// (`newPayrollWeight`), armada igual que "Guardar nómina" con las filas
// incluidas. Se rehace en segundo plano al editar una fila, y no al escribir
// el nombre, que pesa unos pocos bytes. `null` sin filas.
export function usePayrollWeight({ enabled, items, sources, chosenCycles, jobs, subjobs, bankFormatId, classification }) {
  const deferredItems = useDeferredValue(items);
  return useMemo(() => {
    if (!enabled || !deferredItems.length) return null;
    const docs = newPayrollDocs({
      items: deferredItems,
      cycles: sources.cycles,
      chosenCycles,
      workdays: sources.workdays,
      advances: sources.advances,
      jobs,
      subjobs,
      name: "",
      bankFormatId,
      classification,
      generatedAt: SAMPLE_DATE,
    });
    return newPayrollWeight(docs);
  }, [enabled, deferredItems, sources, chosenCycles, jobs, subjobs, bankFormatId, classification]);
}
