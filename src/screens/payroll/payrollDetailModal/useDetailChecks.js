import { useRef, useState } from "react";
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
// se lee. Lo pendiente en otros ciclos abiertos y los pesajes QR sin
// sincronizar se revisan solo en una pendiente: a una pagada ya no le cambia
// nada.
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
    qrSync: editable,
  });

  // Marcar revisadas cambia la revisión al instante y se guarda atrás, sin
  // releer la nómina ni su JSON: la escritura corrige la copia de la lista de
  // nóminas, que es de donde se abre el detalle. Las marcas seguidas se
  // guardan en orden, una después de otra, así la última es la que queda.
  // Si una no se puede guardar, la revisión vuelve a la última guardada.
  const saves = useRef(Promise.resolve());
  const lastSaved = useRef(null);
  const review = (keys, on) => {
    const next = reviewedChecksFor(checks.setReviewed(keys, on), checks.alerts);
    saves.current = saves.current.then(async () => {
      const { error } = await attempt(() => setReviewedChecks(payroll.id, next));
      if (!error) {
        lastSaved.current = next;
        return;
      }
      checks.resetReviewed(lastSaved.current);
      toast.error(`No se pudo guardar la revisión: ${errorText(error)}`);
    });
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
