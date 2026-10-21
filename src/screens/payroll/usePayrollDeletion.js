import { useState } from "react";
import { untagWorkdaysFromPayroll, payrollsService } from "../../services/payrollsService";
import { restoreAdvancesFromPayroll } from "../../services/advancesService";
import { deleteSnapshot } from "../../services/payrollSnapshots";

// Eliminar una nómina pendiente: suelta sus jornadas, devuelve sus anticipos y
// bonos y borra su JSON antes de borrar el documento.
export function usePayrollDeletion({ load, setProgress, toast }) {
  "use no memo";
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
    const id = confirmDelete.id;
    const workdayIds = confirmDelete.workdayIds || [];
    const advanceIds = confirmDelete.advanceIds || [];
    setConfirmDelete(null);
    setProgress({ step: "Iniciando eliminación...", detail: "", percent: 2 });
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
        if (advanceIds.length > 0) detailParts.push(`Anticipos ${advancesDone ? "✓" : "…"}`);
        detailParts.push(`JSON ${snapDone ? "✓" : "…"}`);
        setProgress({
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
        advancesDone = true;
        recompute();
      })();
      const pSnap = (async () => {
        await deleteSnapshot(id);
        snapDone = true;
        recompute();
      })();

      await Promise.all([pUntag, pAdv, pSnap]);

      setProgress({ step: "Eliminando nómina...", detail: "", percent: 95 });
      await payrollsService.remove(id);
    } catch (err) {
      console.error("Error al eliminar nómina:", err);
      toast.error(`Error al eliminar la nómina: ${err?.message || err}`);
      setProgress(null);
      return;
    }
    setProgress({ step: "Actualizando lista...", detail: "", percent: 98 });
    await load();
    setProgress({ step: "Listo ✓", detail: "", percent: 100 });
    setTimeout(() => setProgress(null), 400);
  };
  return { confirmDelete, onDelete, setConfirmDelete };
}
