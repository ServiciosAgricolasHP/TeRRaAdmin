import { useState } from "react";
import { deliverAdvances, removeAdvancePayouts } from "../../../services/payrollPayouts";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";
import { fmtCurrency } from "../../../utils/format";
import { progressOf } from "./progressSteps";

const STEPS = {
  read: { step: "Revisando la nómina y los anticipos...", from: 10, to: 10 },
  payroll: { step: "Guardando la nómina...", from: 35, to: 35 },
  advances: { step: "Marcando los anticipos...", from: 60, to: 60 },
  snapshot: { step: "Guardando el JSON de la nómina...", from: 85, to: 85 },
};

// "💸 Entregar anticipos": pagar en la nómina anticipos que ya existen
// (`deliverAdvances`) y quitar una entrega (`removeAdvancePayouts`). Mientras
// guarda, el gato con la barra (`ProgressOverlay`); al quitar, el de deshacer.
export function useAdvancePayouts({ payroll, onChanged, toast }) {
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutProgress, setPayoutProgress] = useState(null);
  // Las entregas que se pide quitar: filas de `payoutRowsOf`, o null.
  const [payoutsToRemove, setPayoutsToRemove] = useState(null);

  const run = async (action, { undo = false, failed, done }) => {
    setPayoutBusy(true);
    const step = (key) => setPayoutProgress((prev) => {
      const next = progressOf(STEPS, key);
      return next ? { ...next, undo } : prev;
    });
    step("read");
    const { value, error: err } = await attempt(() => action(step));
    if (err) {
      toast.error(`${failed}: ${errorText(err)}`);
      setPayoutProgress(null);
      setPayoutBusy(false);
      return false;
    }
    setPayoutProgress({ step: "Actualizando...", detail: "", percent: 95, undo });
    await attempt(() => onChanged?.());
    setPayoutProgress({ step: "Listo ✓", detail: "", percent: 100, undo });
    toast.success(done(value));
    setTimeout(() => setPayoutProgress(null), 400);
    setPayoutBusy(false);
    return true;
  };

  const deliver = async ({ advanceIds, cycleId }) => {
    if (payoutBusy) return;
    const ok = await run((step) => deliverAdvances(payroll.id, { advanceIds, cycleId }, step), {
      failed: "No se pudieron entregar los anticipos",
      done: (plan) => {
        const people = plan.added.length;
        const entering = plan.added.filter((a) => a.isNew).length;
        return (
          `Se entregan ${fmtCurrency(plan.total)} en anticipos a ${people} ${people === 1 ? "persona" : "personas"}.` +
          (entering ? ` ${entering === 1 ? "Entra 1 persona" : `Entran ${entering} personas`} a la nómina.` : "")
        );
      },
    });
    if (ok) setPayoutOpen(false);
  };

  const confirmRemovePayout = async () => {
    const rows = payoutsToRemove;
    if (!rows?.length || payoutBusy) return;
    setPayoutsToRemove(null);
    const entries = rows.map((r) => ({ rut: r.rut, advanceId: r.advanceId }));
    await run((step) => removeAdvancePayouts(payroll.id, { entries }, step), {
      undo: true,
      failed: "No se pudieron quitar los anticipos entregados",
      done: (plan) => {
        const count = plan.removed.length;
        const leaving = plan.leaving.length
          ? ` ${plan.leaving.length === 1 ? `${plan.leaving[0]} sale` : `${plan.leaving.length} personas salen`} de la nómina: ${plan.leaving.length === 1 ? "estaba" : "estaban"} solo por su anticipo.`
          : "";
        return `${count === 1 ? "1 anticipo vuelve" : `${count} anticipos vuelven`} a quedar sin entregar (${fmtCurrency(plan.removedTotal)}).${leaving}`;
      },
    });
  };

  return {
    confirmRemovePayout,
    deliver,
    payoutBusy,
    payoutOpen,
    payoutProgress,
    payoutsToRemove,
    setPayoutOpen,
    setPayoutsToRemove,
  };
}
