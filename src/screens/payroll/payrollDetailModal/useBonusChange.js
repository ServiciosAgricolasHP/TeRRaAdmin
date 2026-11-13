import { useState } from "react";
import { advancesService } from "../../../services/advancesService";
import { changePayrollBonus } from "../../../services/payrollBonusChange";
import { bonusLockReason } from "../../../utils/payrollBonusChange";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";
import { fmtCurrency } from "../../../utils/format";
import { progressOf } from "./progressSteps";

const STEPS = {
  read: { step: "Revisando la nómina y el bono...", from: 10, to: 10 },
  payroll: { step: "Guardando la nómina...", from: 35, to: 35 },
  advances: { step: "Guardando el bono y los anticipos...", from: 60, to: 60 },
  snapshot: { step: "Guardando el JSON de la nómina...", from: 85, to: 85 },
};

// "✎ Editar bono": el monto y la nota de un bono que la nómina ya le aplica a
// una persona, sin sacarla (`changePayrollBonus`). Al abrir se lee el bono, para
// saber cuánto pagaron otras nóminas; mientras guarda, el gato con la barra
// (`ProgressOverlay`).
export function useBonusChange({ payroll, onChanged, toast }) {
  // { item, bonusId, bonus }; `bonus`, el documento, null mientras se lee.
  const [bonusTarget, setBonusTarget] = useState(null);
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusProgress, setBonusProgress] = useState(null);

  const canChangeBonus = (item) => !bonusLockReason(payroll, item);

  const openBonusChange = async (item, bonusId) => {
    if (bonusBusy) return;
    setBonusTarget({ item, bonusId, bonus: null });
    const { value, error: err } = await attempt(() => advancesService.getById(bonusId));
    if (err || !value) {
      toast.error(err ? `No se pudo leer el bono: ${errorText(err)}` : "Ese bono ya no existe.");
      setBonusTarget(null);
      return;
    }
    setBonusTarget((t) => (t && t.bonusId === bonusId ? { ...t, bonus: value } : t));
  };

  const closeBonusChange = () => setBonusTarget(null);

  const applyBonusChange = async ({ amount: newAmount, note }) => {
    if (!bonusTarget) return;
    const { item, bonusId } = bonusTarget;
    setBonusBusy(true);
    const step = (key) => setBonusProgress((prev) => progressOf(STEPS, key) || prev);
    step("read");
    const { value: plan, error: err } = await attempt(() =>
      changePayrollBonus(payroll.id, { rut: item.rut, bonusId, newAmount, note }, step),
    );
    if (err) {
      toast.error(`No se pudo guardar el bono: ${errorText(err)}`);
      setBonusProgress(null);
      setBonusBusy(false);
      return;
    }
    setBonusProgress({ step: "Actualizando...", detail: "", percent: 95 });
    setBonusTarget(null);
    await attempt(() => onChanged?.());
    setBonusProgress({ step: "Listo ✓", detail: "", percent: 100 });
    const who = item.name || item.rut;
    const returned = plan.returned > 0 ? ` Vuelven ${fmtCurrency(plan.returned)} a sus anticipos.` : "";
    const noteText = plan.noteChanged ? " Nota guardada." : "";
    toast.success(
      plan.amountChanged
        ? `Bono de ${who}: ${fmtCurrency(plan.bonusBefore)} → ${fmtCurrency(plan.bonusAfter)}. ` +
            `Líquido: ${fmtCurrency(plan.oldNet)} → ${fmtCurrency(plan.newNet)}.${returned}${noteText}`
        : `Nota del bono de ${who} guardada.`,
    );
    setTimeout(() => setBonusProgress(null), 400);
    setBonusBusy(false);
  };

  return {
    applyBonusChange,
    bonusBusy,
    bonusProgress,
    bonusTarget,
    canChangeBonus,
    closeBonusChange,
    openBonusChange,
  };
}
