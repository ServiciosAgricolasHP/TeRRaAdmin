import { useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { saveReviewChange, setItemsGroupLeader } from "../../../services/payrollsService";
import { attempt } from "../../../utils/attempt";
import { errorText } from "../../../utils/errorText";
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
    place: "detail",
    qrSync: editable,
  });

  // Marcar revisadas cambia la revisión al instante y se guarda atrás, sin
  // releer la nómina ni su JSON: la escritura corrige la copia de la lista de
  // nóminas, que es de donde se abre el detalle. Se guarda solo el cambio, sobre
  // lo guardado en ese momento (`saveReviewChange`), así no se pierde lo que
  // marcó otra persona con la nómina abierta. Los cambios seguidos se guardan
  // en orden y, al terminar el último, la revisión toma lo guardado, con lo de
  // los demás. Si uno no se puede guardar, vuelve a lo último guardado.
  const saves = useRef(Promise.resolve());
  const pending = useRef(0);
  const lastSaved = useRef(null);
  const review = (keys, on) => {
    const change = checks.setReviewed(keys, on);
    pending.current += 1;
    saves.current = saves.current.then(async () => {
      const { value, error } = await attempt(() => saveReviewChange(payroll.id, change));
      pending.current -= 1;
      if (error) {
        checks.resetReviewed(lastSaved.current);
        toast.error(`No se pudo guardar la revisión: ${errorText(error)}`);
        return;
      }
      lastSaved.current = value;
      if (pending.current === 0) checks.resetReviewed(value);
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
