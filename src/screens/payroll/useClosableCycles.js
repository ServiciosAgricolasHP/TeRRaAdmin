import { useMemo, useState } from "react";
import { settledOpenCycles } from "../../utils/cycleClosing";

// Los ciclos abiertos ya pagados por completo y cuáles se ofrecen para cerrar.
export function useClosableCycles({ cycles, cycleStats, payrolls }) {
  // Ciclos abiertos ya pagados por completo, para cerrarlos de una vez desde
  // Generar o justo después de marcar una nómina pagada. `closeCycles.ids`
  // acota la lista a los ciclos de esa nómina.
  const closable = useMemo(() => settledOpenCycles(cycles, cycleStats, payrolls), [cycles, cycleStats, payrolls]);

  const [closeCycles, setCloseCycles] = useState(null); // { ids: Set | null, payrollName }
  const closeCandidates = closeCycles
    ? closable.settled.filter((r) => !closeCycles.ids || closeCycles.ids.has(r.cycle.id))
    : [];
  return { closable, closeCandidates, closeCycles, setCloseCycles };
}
