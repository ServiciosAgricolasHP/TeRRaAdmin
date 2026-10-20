import { useState } from "react";
import { closedCyclePatch } from "../../utils/cycleClosing";
import { cyclesService } from "../../services";

// Cerrar y reabrir el ciclo. Son las únicas escrituras de la pantalla que no
// pasan por el candado: cerrar lo pone y reabrir lo levanta.
export function useCycleClosing({ cycle, id, setCycle, showToast }) {
  "use no memo";
  const [closeFlow, setCloseFlow] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);

  const [confirmReopen, setConfirmReopen] = useState(false);

  const handleCloseCycle = async () => {
    setCloseBusy(true);
    try {
      const patch = closedCyclePatch(cycle);
      await cyclesService.update(id, patch);
      setCycle((c) => ({ ...c, ...patch }));
      setCloseFlow(false);
      showToast("Ciclo cerrado");
    } finally {
      setCloseBusy(false);
    }
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
