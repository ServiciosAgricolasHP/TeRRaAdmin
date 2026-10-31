import { useState } from "react";
import { closedCyclePatch } from "../../utils/cycleClosing";
import { cyclesService } from "../../services";
import { attempt } from "../../utils/attempt";

// Cerrar y reabrir el ciclo. Son las únicas escrituras de la pantalla que no
// pasan por el candado: cerrar lo pone y reabrir lo levanta.
export function useCycleClosing({ cycle, id, setCycle, showToast }) {
  const [closeFlow, setCloseFlow] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);

  const [confirmReopen, setConfirmReopen] = useState(false);

  const handleCloseCycle = async () => {
    setCloseBusy(true);
    const { error: err } = await attempt(async () => {
      const patch = closedCyclePatch(cycle);
      await cyclesService.update(id, patch);
      setCycle((c) => ({ ...c, ...patch }));
      setCloseFlow(false);
      showToast("Ciclo cerrado");
    });
    setCloseBusy(false);
    if (err) throw err;
  };

  const handleReopenCycle = () => setConfirmReopen(true);
  const doReopenCycle = async () => {
    await cyclesService.update(id, { status: "open", endDate: null });
    setCycle((c) => ({ ...c, status: "open", endDate: null }));
    showToast("Ciclo reabierto");
  };
  return {
    closeBusy,
    closeFlow,
    confirmReopen,
    doReopenCycle,
    handleCloseCycle,
    handleReopenCycle,
    setCloseFlow,
    setConfirmReopen,
  };
}
