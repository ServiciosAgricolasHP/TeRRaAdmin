import { useState } from "react";
import { untagWorkdaysFromPayroll, payrollsService } from "../../services/payrollsService";
import { clearAdvancePayouts, restoreAdvancesFromPayroll } from "../../services/advancesService";
import { deleteSnapshot } from "../../services/payrollSnapshots";

// Eliminar una nómina pendiente: suelta sus jornadas, devuelve sus anticipos y
// bonos y borra su JSON antes de borrar el documento. Una nómina publicada en
// el portal de trabajadores (`isPublished(id)`) no se elimina: primero se
// retira del portal.
export function usePayrollDeletion({ load, setProgress, toast, isPublished }) {
  // Eliminar deshace una nómina: lleva la animación de deshacer.
  const showProgress = (info) => setProgress(info && { ...info, undo: true });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const onDelete = async () => {
    if (!confirmDelete) return;
    // Una nómina pagada no se elimina. Se vuelve a chequear acá aunque la UI
    // desactive el botón.
    if (confirmDelete.status === "paid") {
      setConfirmDelete(null);
      toast.error("No se puede eliminar una nómina pagada. Revierte primero a No pagado.");
      return;
    }
    // Tampoco con las transferencias pagadas: borrarla liberaría los días y
    // restauraría anticipos de quienes ya tienen la plata en la cuenta.
    if (confirmDelete.bankPaidAt) {
      setConfirmDelete(null);
      toast.error("Las transferencias de esta nómina ya se pagaron. Reviértelas antes de eliminarla.");
      return;
    }
    if (isPublished?.(confirmDelete.id)) {
      setConfirmDelete(null);
      toast.error("Esta nómina está publicada en el portal de trabajadores. Un admin la retira desde su detalle (🚫 Retirar del portal) y después se puede eliminar.");
      return;
    }
    const id = confirmDelete.id;
    const workdayIds = confirmDelete.workdayIds || [];
    const advanceIds = confirmDelete.advanceIds || [];
    const payoutIds = (confirmDelete.items || []).flatMap((it) => (it.payoutApplications || []).map((p) => p.advanceId));
    setConfirmDelete(null);
    showProgress({ step: "Iniciando eliminación...", detail: "", percent: 2 });
    try {
      // Soltar las jornadas, restaurar los anticipos y borrar el snapshot
      // corren en paralelo; el doc de la nómina se borra después de las tres,
      // para no dejar referencias colgando.
      const W_UNTAG = 70, W_ADV = 15, W_SNAP = 10;
      let untagDone = 0, untagTotal = Math.max(1, workdayIds.length);
      let advancesDone = false, snapDone = false;
      const recompute = () => {
        const pct =
          W_UNTAG * (untagDone / untagTotal) +
          (advancesDone ? W_ADV : 0) +
          (snapDone ? W_SNAP : 0);
        const detailParts = [];
        if (workdayIds.length > 0) detailParts.push(`Jornadas ${untagDone}/${untagTotal}`);
        if (advanceIds.length > 0 || payoutIds.length > 0) detailParts.push(`Anticipos ${advancesDone ? "✓" : "…"}`);
        detailParts.push(`JSON ${snapDone ? "✓" : "…"}`);
        showProgress({
          step: "Liberando jornadas y anticipos...",
          detail: detailParts.join(" · "),
          percent: pct,
        });
      };
      recompute();

      const pUntag = untagWorkdaysFromPayroll(workdayIds, (done, total) => {
        untagDone = done;
        untagTotal = Math.max(1, total);
        recompute();
      });
      const pAdv = (async () => {
        await restoreAdvancesFromPayroll(advanceIds, id);
        // Lo que la nómina entregaba vuelve a quedar sin entregar.
        await clearAdvancePayouts(payoutIds, id);
        advancesDone = true;
        recompute();
      })();
      const pSnap = (async () => {
        await deleteSnapshot(id);
        snapDone = true;
        recompute();
      })();

      await Promise.all([pUntag, pAdv, pSnap]);

      showProgress({ step: "Eliminando nómina...", detail: "", percent: 95 });
      await payrollsService.remove(id);
    } catch (err) {
      console.error("Error al eliminar nómina:", err);
      toast.error(`Error al eliminar la nómina: ${err?.message || err}`);
      showProgress(null);
      return;
    }
    showProgress({ step: "Actualizando lista...", detail: "", percent: 98 });
    await load();
    showProgress({ step: "Listo ✓", detail: "", percent: 100 });
    setTimeout(() => showProgress(null), 400);
  };
  return { confirmDelete, onDelete, setConfirmDelete };
}
