import { useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { setItemsGroupLeader, setReviewedChecks } from "../../../services/payrollsService";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";
import { reviewedChecksFor } from "../../../utils/payrollChecks/payrollChecks";
import { usePayrollChecks } from "../usePayrollChecks";

const NONE = [];

// La revisión en el detalle de una nómina: la explicación de lo inusual, con
// las jornadas del JSON. En una pendiente, marcar revisadas y asignar grupos
// se guarda en la nómina (y el grupo, también en las fichas); una pagada solo
// se lee. Lo pendiente en otros ciclos abiertos se revisa solo en una
// pendiente: a una pagada ya no le cambia nada.
export function useDetailChecks({ payroll, snapshot, snapshotLoading, cycles, workers, allPayrolls, openWorkdays, onChanged }) {
  const toast = useToast();
  const editable = payroll.status !== "paid";
  const [saving, setSaving] = useState(false);

  const checks = usePayrollChecks({
    enabled: !snapshotLoading,
    items: payroll.items || NONE,
    workdays: snapshot?.workdays || NONE,
    openWorkdays: editable ? openWorkdays : NONE,
    cycles,
    workers,
    payrolls: allPayrolls,
    payrollId: payroll.id,
    createdAt: payroll.createdAt || null,
    reviewedChecks: payroll.reviewedChecks || NONE,
    resetKey: payroll.id,
  });

  const review = async (keys, on) => {
    const next = checks.setReviewed(keys, on);
    setSaving(true);
    const { error } = await attempt(() => setReviewedChecks(payroll.id, reviewedChecksFor(next, checks.alerts)));
    setSaving(false);
    if (error) {
      checks.resetReviewed();
      toast.error(`No se pudo guardar la revisión: ${errorText(error)}`);
      return;
    }
    await onChanged?.();
  };

  // El grupo va primero a las fichas y después a la nómina.
  const assign = async (assignments) => {
    if (!(await checks.assignGroups(assignments))) return;
    const leaderByRut = Object.fromEntries(assignments.map((a) => [a.rut, a.leader]));
    setSaving(true);
    const { error } = await attempt(() => setItemsGroupLeader(payroll.id, leaderByRut));
    setSaving(false);
    if (error) {
      toast.error(`El grupo quedó en las fichas, pero no en la nómina: ${errorText(error)}`);
      return;
    }
    await onChanged?.();
  };

  return {
    ...checks,
    editable,
    saving,
    review: editable ? review : null,
    assign: editable ? assign : null,
  };
}
