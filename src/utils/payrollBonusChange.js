// Cambiar el monto de un bono que una nómina ya aplica, como si el bono
// hubiera valido eso desde el principio. El bono solo suma:
//
// - Si sube, sube el líquido en la diferencia y nada más: los anticipos que la
//   nómina descuenta quedan como están.
// - Si baja, baja el líquido en la diferencia. Si un anticipo ya no cabe en
//   bruto + bonos, se descuenta lo que cabe y el resto vuelve al anticipo
//   (`refitAppliedAdvances`), que queda parcial.
import { appliedFromItem, itemAdvanceFields, payoutOf, refitAppliedAdvances } from "./payrollItem";
import { isCashBank } from "./banks";

// Por qué no se puede cambiar el bono de `item`, o "" si se puede. Con la
// nómina pagada, no; con las transferencias ya pagadas, solo el de quien cobra
// en efectivo: lo de banco ya salió.
export function bonusLockReason(payroll, item) {
  if (payroll?.status === "paid") return "La nómina está pagada: revierte el pago antes de cambiar un bono.";
  if (payroll?.bankPaidAt && !isCashBank(item?.bankCode)) {
    return "Las transferencias de esta nómina ya salieron: el bono de quien cobra por banco ya no se puede cambiar.";
  }
  return "";
}

// El bruto del item. Uno sin `grossAmount` es de antes de que se guardara: se
// despeja del neto.
function grossOf(item) {
  if (item?.grossAmount != null) return Math.round(Number(item.grossAmount) || 0);
  return Math.round((Number(item?.amount) || 0) + (Number(item?.advance) || 0) - (Number(item?.bonus) || 0));
}

// Lo que otras nóminas ya le pagaron al bono: el monto nuevo no puede bajar de
// eso, y esta nómina paga la diferencia.
export function bonusPaidElsewhere(bonus, payrollId) {
  return (Array.isArray(bonus?.payments) ? bonus.payments : [])
    .filter((p) => p.payrollId !== payrollId)
    .reduce((s, p) => s + (Math.round(Number(p.amount) || 0)), 0);
}

// Por qué no sirve el cambio, o "" si sirve. Esta nómina tiene que seguir
// pagándole algo al bono: para quitarlo está sacar a la persona o Recalcular.
// Con el mismo monto, sirve si cambió la nota (`noteChanged`).
export function bonusChangeError(newAmount, { paidElsewhere = 0, current = 0, noteChanged = false } = {}) {
  const value = Number(newAmount);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return "Escribe el monto del bono, en pesos.";
  if (value <= paidElsewhere) return `Otras nóminas ya pagaron ${paidElsewhere.toLocaleString("es-CL")} de este bono: el monto tiene que ser mayor.`;
  if (value - paidElsewhere === current && !noteChanged) return "No cambiaste ni el monto ni la nota.";
  return "";
}

// El item con el bono `bonusId` en `newAmount`. `appliedByAdvance` es lo que
// la nómina aplica hoy a cada anticipo y bono, desde su `payments[]`
// (`readPayrollApplications`); sin él vale lo que dice el item. Devuelve null
// si el bono no está en el item.
//
// - `item`: la fila nueva, con sus anticipos, bonos y líquido.
// - `bonusBefore` / `bonusAfter`: lo que esta nómina le paga al bono.
// - `advanceTargets`: los anticipos que cambian, con lo que la nómina les
//   descuenta ahora (para `setPayrollAdvanceAmounts`).
// - `advanceChanges`: los mismos, con lo de antes y lo de después.
// - `returned`: lo que vuelve a los anticipos.
export function planBonusChange({ item, appliedByAdvance = new Map(), bonusId, newAmount, paidElsewhere = 0 }) {
  const applied = appliedFromItem(item, appliedByAdvance);
  const current = applied.find((a) => a.advanceId === bonusId && a.kind === "bono");
  if (!current) return null;
  const bonusAfter = Math.round(Number(newAmount) || 0) - Math.round(Number(paidElsewhere) || 0);
  const next = applied.map((a) => (a.advanceId === bonusId ? { ...a, amount: bonusAfter } : a));
  const refit = refitAppliedAdvances({ gross: grossOf(item), applied: next, payout: payoutOf(item) });

  const before = new Map(applied.map((a) => [a.advanceId, a.amount]));
  const advanceChanges = refit.targets
    .filter((t) => t.advanceId !== bonusId && !t.missing && t.amount !== before.get(t.advanceId))
    .map((t) => ({ advanceId: t.advanceId, before: before.get(t.advanceId) || 0, after: t.amount }));

  return {
    item: { ...item, ...itemAdvanceFields(refit), grossAmount: grossOf(item) },
    bonusBefore: current.amount,
    bonusAfter,
    advanceTargets: advanceChanges.map((c) => ({ advanceId: c.advanceId, amount: c.after })),
    advanceChanges,
    oldNet: Math.round(Number(item.amount) || 0),
    newNet: refit.amount,
    returned: refit.devuelto,
  };
}
