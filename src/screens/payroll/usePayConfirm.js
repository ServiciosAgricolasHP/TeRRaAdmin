import { useState } from "react";
import { markPaid as markPayrollPaid, markPending as markPayrollPending, markBankPaid, revertBankPaid } from "../../services/payrollsService";
import { settledOpenCycles } from "../../utils/cycleClosing";

// Marcar una nómina pagada o pendiente, o solo sus transferencias, después de
// confirmarlo escribiendo una palabra. Al pagarla entera ofrece cerrar los
// ciclos que quedaron pagados por completo.
export function usePayConfirm({ load, setCloseCycles, setProgress, toast }) {
  "use no memo";
  // mode: "pay" | "revert" | "bank" | "revertBank". Los dos últimos son el
  // pago en dos tiempos: salen las transferencias pero el efectivo queda
  // debiéndose.
  const [payConfirm, setPayConfirm] = useState(null); // { payroll, mode }
  const onAskMarkPaid = (p) => setPayConfirm({ payroll: p, mode: "pay" });
  const onAskRevert = (p) => setPayConfirm({ payroll: p, mode: "revert" });
  const onAskMarkBankPaid = (p) => setPayConfirm({ payroll: p, mode: "bank" });
  const onAskRevertBank = (p) => setPayConfirm({ payroll: p, mode: "revertBank" });
  const PAY_DONE = {
    pay: "Nómina marcada como pagada",
    revert: "Nómina vuelta a pendiente",
    bank: "Transferencias marcadas como pagadas — el efectivo queda debiéndose",
    revertBank: "Transferencias revertidas",
  };
  const onConfirmPay = async () => {
    if (!payConfirm) return;
    const { payroll: p, mode } = payConfirm;
    // Revertir deshace un pago: lleva la animación de deshacer.
    const undo = mode === "revert" || mode === "revertBank";
    const show = (info) => setProgress({ ...info, undo });
    const progressStep = (step) => (done, total) =>
      show({
        step,
        detail: total ? `${done} de ${total} jornadas` : "",
        percent: total ? (done / total) * 90 : 0,
      });
    show({ step: "Sellando jornadas...", detail: "", percent: 2 });
    try {
      if (mode === "pay") {
        await markPayrollPaid(p.id, p.workdayIds || [], progressStep("Sellando jornadas pagadas..."));
      } else if (mode === "revert") {
        await markPayrollPending(p.id, p.workdayIds || [], progressStep("Quitando el sello de pago..."));
      } else if (mode === "bank") {
        await markBankPaid(p.id, progressStep("Sellando las jornadas de banco..."));
      } else if (mode === "revertBank") {
        await revertBankPaid(p.id, progressStep("Revirtiendo las transferencias..."));
      }
      show({ step: "Actualizando lista...", detail: "", percent: 95 });
      setPayConfirm(null);
      const fresh = await load();
      toast.success(PAY_DONE[mode] || "Listo");
      // Los ciclos de esta nómina que con este pago quedaron pagados por
      // completo se ofrecen para cerrar.
      if (mode === "pay" && fresh) {
        const ids = new Set(p.cycleIds || []);
        const done = settledOpenCycles(fresh.cycles, fresh.stats, fresh.payrolls).settled.filter((r) => ids.has(r.cycle.id));
        if (done.length) setCloseCycles({ ids: new Set(done.map((r) => r.cycle.id)), payrollName: p.name });
      }
    } catch (err) {
      // El servicio lanza mensajes redactados para el usuario (ej. "La nómina
      // ya está pagada entera."): se muestran en un toast.
      toast.error(err.message || "No se pudo completar la operación.");
    } finally {
      setProgress(null);
    }
  };
  return {
    onAskMarkBankPaid,
    onAskMarkPaid,
    onAskRevert,
    onAskRevertBank,
    onConfirmPay,
    payConfirm,
    setPayConfirm,
  };
}
