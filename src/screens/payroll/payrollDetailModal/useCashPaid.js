import { useState, useRef, useEffect } from "react";
import { setCashPaidRuts } from "../../../services/payrollsService";

// Quién ya cobró su efectivo, cuando las transferencias de la nómina se
// pagaron y el efectivo quedó debiéndose: se marca por persona o por grupo y
// se guarda en `cashPaidRuts`.
export function useCashPaid({ cash, payroll, toast }) {
  "use no memo";
  // Entrega del efectivo persona por persona. Solo tiene sentido cuando las
  // transferencias ya se pagaron y el efectivo quedó debiéndose: antes de eso
  // no hay deuda que descontar, y después de pagar la nómina ya no importa.
  const cashPaidMode = !!payroll.bankPaidAt && payroll.status !== "paid";
  const [cashPaidSet, setCashPaidSet] = useState(() => new Set(payroll.cashPaidRuts || []));
  // Guardado diferido (700 ms): marcar varias personas seguidas es una sola escritura.
  const cashSaveRef = useRef(null);
  const flushCashPaid = useRef(() => {});
  const toggleCashPaid = (rut) => {
    setCashPaidSet((prev) => {
      const next = new Set(prev);
      if (next.has(rut)) next.delete(rut); else next.add(rut);
      const ruts = [...next];
      flushCashPaid.current = () => setCashPaidRuts(payroll.id, ruts).catch((err) => {
        console.error("[nómina] no se pudo guardar quién cobró:", err);
        toast.error("No se pudo guardar quién cobró el efectivo.");
      });
      if (cashSaveRef.current) clearTimeout(cashSaveRef.current);
      cashSaveRef.current = setTimeout(() => { cashSaveRef.current = null; flushCashPaid.current(); }, 700);
      return next;
    });
  };
  const setGroupCashPaid = (groupItems, paid) => {
    setCashPaidSet((prev) => {
      const next = new Set(prev);
      for (const it of groupItems) {
        if (paid) next.add(it.rut); else next.delete(it.rut);
      }
      const ruts = [...next];
      flushCashPaid.current = () => setCashPaidRuts(payroll.id, ruts).catch((err) => {
        console.error("[nómina] no se pudo guardar quién cobró:", err);
        toast.error("No se pudo guardar quién cobró el efectivo.");
      });
      if (cashSaveRef.current) clearTimeout(cashSaveRef.current);
      cashSaveRef.current = setTimeout(() => { cashSaveRef.current = null; flushCashPaid.current(); }, 700);
      return next;
    });
  };
  // Si el modal se cierra antes de que corra el debounce, igual se guarda.
  useEffect(() => () => {
    if (cashSaveRef.current) { clearTimeout(cashSaveRef.current); flushCashPaid.current(); }
  }, []);
  // Efectivo que todavía se debe, en vivo (sin esperar el refetch del doc).
  const owedCash = cashPaidMode
    ? cash.reduce((s, it) => s + (cashPaidSet.has(it.rut) ? 0 : Number(it.amount) || 0), 0)
    : 0;
  return {
    cashPaidMode,
    cashPaidSet,
    owedCash,
    setGroupCashPaid,
    toggleCashPaid,
  };
}
