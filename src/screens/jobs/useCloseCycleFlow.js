import { useState } from "react";
import { cyclesService } from "../../services";
import { closedCyclePatch } from "../../utils/cycleClosing";
import { defaultLabors, newId, todayStr } from "./helpers";
import { nextCycleLabors } from "../../utils/cycleCreation";
import { attempt } from "../../utils/attempt";

// Cerrar un ciclo y ofrecer crear el siguiente, con las mismas labores y, si
// se pide, sus trabajadores.
export function useCloseCycleFlow({ cyclePrefix, cyclesByJob, loadCycles, setBusy }) {
  const [closeFlow, setCloseFlow] = useState(null);

  const openCloseFlow = (cycle, jobId) => {
    setCloseFlow({ cycle, jobId, askNext: false, copyWorkers: true });
  };

  const confirmCloseCycle = async () => {
    if (!closeFlow) return;
    setBusy(true);
    const { error: err } = await attempt(async () => {
      await cyclesService.update(closeFlow.cycle.id, closedCyclePatch(closeFlow.cycle));
      setCloseFlow((s) => ({ ...s, askNext: true }));
      await loadCycles(closeFlow.jobId);
    });
    setBusy(false);
    if (err) throw err;
  };

  const createNextCycle = async (copy) => {
    if (!closeFlow) return;
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const prev = closeFlow.cycle;
      const cycles = cyclesByJob[closeFlow.jobId] || [];
      const scope = cycles.filter((c) =>
        prev.subfaenaId ? c.subfaenaId === prev.subfaenaId : !c.subfaenaId,
      );
      const nextNumber = scope.length + 1;
      const prevLabors = prev.labors || defaultLabors(prev.workers || []);
      const newLabors = nextCycleLabors(prevLabors, copy, newId);
      await cyclesService.create({
        faenaId: closeFlow.jobId,
        subfaenaId: prev.subfaenaId || null,
        label: cyclePrefix(closeFlow.jobId, prev.subfaenaId) + `Ciclo ${nextNumber}`,
        startDate: todayStr(),
        notes: "",
        status: "open",
        // Como al crear desde el form, el ciclo nace con un primer día para
        // que la grilla tenga una columna.
        days: [todayStr()],
        labors: newLabors,
      });
      setCloseFlow(null);
      await loadCycles(closeFlow.jobId);
    });
    setBusy(false);
    if (err) throw err;
  };
  return {
    closeFlow,
    confirmCloseCycle,
    createNextCycle,
    openCloseFlow,
    setCloseFlow,
  };
}
