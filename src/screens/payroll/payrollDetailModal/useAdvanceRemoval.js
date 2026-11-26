import { useState } from "react";
import { removePayrollAdvances } from "../../../services/payrollAdvanceRemoval";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";
import { fmtCurrency } from "../../../utils/format";
import { progressOf } from "./progressSteps";

const STEPS = {
  read: { step: "Revisando la nómina y los anticipos...", from: 10, to: 10 },
  payroll: { step: "Guardando la nómina...", from: 35, to: 35 },
  advances: { step: "Devolviendo los anticipos y bonos...", from: 60, to: 60 },
  snapshot: { step: "Guardando el JSON de la nómina...", from: 85, to: 85 },
};

// Quitar de la nómina anticipos o bonos que ya aplica, desde "📋 Ver
// anticipos y bonos" (`removePayrollAdvances`). Mientras guarda, el gato de
// deshacer con la barra (`ProgressOverlay`).
export function useAdvanceRemoval({ payroll, onChanged, toast }) {
  // Lo que se pide quitar: filas de `advancesAndBonusesOf` con su `kind`, o null.
  const [advancesToRemove, setAdvancesToRemove] = useState(null);
  const [removalBusy, setRemovalBusy] = useState(false);
  const [removalProgress, setRemovalProgress] = useState(null);

  const confirmRemoveAdvances = async () => {
    const rows = advancesToRemove;
    if (!rows?.length || removalBusy) return;
    setAdvancesToRemove(null);
    setRemovalBusy(true);
    const step = (key) => setRemovalProgress((prev) => {
      const next = progressOf(STEPS, key);
      return next ? { ...next, undo: true } : prev;
    });
    step("read");
    const entries = rows.map((r) => ({ rut: r.rut, advanceId: r.advanceId }));
    const { value: plan, error: err } = await attempt(() => removePayrollAdvances(payroll.id, { entries }, step));
    if (err) {
      toast.error(`No se pudieron quitar de la nómina: ${errorText(err)}`);
      setRemovalProgress(null);
      setRemovalBusy(false);
      return;
    }
    setRemovalProgress({ step: "Actualizando...", detail: "", percent: 95, undo: true });
    await attempt(() => onChanged?.());
    setRemovalProgress({ step: "Listo ✓", detail: "", percent: 100, undo: true });
    const count = plan.removedIds.length;
    const returned = plan.people.reduce((s, p) => s + p.returned, 0);
    const what =
      count === 1
        ? `${rows[0].kind === "bono" ? "El bono" : "El anticipo"} de ${rows[0].name} vuelve a quedar pendiente.`
        : `${count} anticipos y bonos vuelven a quedar pendientes.`;
    toast.success(
      what + (returned > 0 ? ` Además, ${fmtCurrency(returned)} de anticipos ya no caben en esta nómina y vuelven a quedar pendientes.` : ""),
    );
    setTimeout(() => setRemovalProgress(null), 400);
    setRemovalBusy(false);
  };

  return { advancesToRemove, confirmRemoveAdvances, removalBusy, removalProgress, setAdvancesToRemove };
}
