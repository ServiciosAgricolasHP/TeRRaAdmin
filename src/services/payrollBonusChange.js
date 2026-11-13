import { advancesService, isBono, readPayrollApplications, setPayrollAdvanceAmounts } from "./advancesService";
import { payrollsService, recalcPayrollAggregates } from "./payrollsService";
import { snapshotAdvanceOf, syncSnapshotAmounts } from "./payrollSnapshots";
import { bonusChangeError, bonusLockReason, bonusPaidElsewhere, planBonusChange } from "../utils/payrollBonusChange";
import { toTitleName } from "../utils/textCase";

// Los `payments[]` del bono con lo que le paga esta nómina en `amount`: la
// entrada de la nómina se reescribe en su lugar, con su `paidAt`.
function paymentsWith(bonus, payrollId, amount) {
  const out = [];
  let used = false;
  for (const p of Array.isArray(bonus.payments) ? bonus.payments : []) {
    if (p.payrollId !== payrollId) out.push(p);
    else if (!used) {
      out.push({ ...p, amount });
      used = true;
    }
  }
  if (!used) out.push({ payrollId, amount, paidAt: new Date().toISOString() });
  return out;
}

// Edita un bono que la nómina ya le aplica a una persona: su monto, como si
// hubiera valido eso desde el principio (`planBonusChange`), y su nota
// (`note`; sin ella queda la que tiene). El bono queda en `newAmount`,
// aplicado entero, y la nómina le paga lo que no pagaron otras. Si un anticipo
// de la persona ya no cabe, se descuenta lo que cabe y el resto vuelve al
// anticipo. Con el mismo monto, solo se guarda la nota. Se revisa contra la
// nómina y el bono como están ahora.
//
// Mismo orden que "Generar": primero la nómina, después el bono, los
// anticipos y el JSON. `onProgress(paso)` avisa el paso en curso: "read",
// "payroll", "advances" y "snapshot".
export async function changePayrollBonus(payrollId, { rut, bonusId, newAmount, note }, onProgress) {
  onProgress?.("read");
  const payroll = await payrollsService.getById(payrollId);
  if (!payroll) throw new Error("Nómina no encontrada.");
  const items = Array.isArray(payroll.items) ? payroll.items : [];
  const item = items.find((it) => it.rut === rut);
  if (!item) throw new Error("Esa persona ya no está en esta nómina.");
  const lock = bonusLockReason(payroll, item);
  if (lock) throw new Error(lock);

  const bonus = await advancesService.getById(bonusId);
  if (!bonus || !isBono(bonus)) throw new Error("Ese bono ya no existe.");
  const otherIds = [
    ...(item.advanceIds || []),
    ...(item.anticipoApplications || []).map((a) => a.advanceId),
  ].filter((id) => id && id !== bonusId);
  const appliedByAdvance = await readPayrollApplications(payrollId, otherIds);
  const paidElsewhere = bonusPaidElsewhere(bonus, payrollId);
  const current = (bonus.payments || [])
    .filter((p) => p.payrollId === payrollId)
    .reduce((s, p) => s + (Math.round(Number(p.amount) || 0)), 0);
  appliedByAdvance.set(bonusId, { advanceId: bonusId, kind: "bono", date: bonus.date || "", amount: current });

  const amount = Math.round(Number(newAmount));
  const nextNote = note === undefined ? bonus.note || "" : toTitleName(note);
  const noteChanged = nextNote !== (bonus.note || "");
  const invalid = bonusChangeError(amount, { paidElsewhere, current, noteChanged });
  if (invalid) throw new Error(invalid);
  const plan = planBonusChange({ item, appliedByAdvance, bonusId, newAmount: amount, paidElsewhere });
  if (!plan) throw new Error("Ese bono ya no está en esta nómina.");
  const amountChanged = plan.bonusAfter !== current || amount !== Math.round(Number(bonus.amount) || 0);

  const newItems = amountChanged ? items.map((it) => (it.rut === rut ? plan.item : it)) : items;
  const aggregates = recalcPayrollAggregates(newItems);
  if (amountChanged) {
    onProgress?.("payroll");
    await payrollsService.update(payrollId, aggregates);
  }

  onProgress?.("advances");
  const amountPatch = amountChanged
    ? {
        amount,
        payments: paymentsWith(bonus, payrollId, plan.bonusAfter),
        amountPaid: amount,
        status: "applied",
        appliedPayrollId: bonus.appliedPayrollId || payrollId,
      }
    : {};
  const bonusPatch = { ...amountPatch, ...(noteChanged ? { note: nextNote } : {}) };
  await advancesService.upsert(bonusId, bonusPatch, { before: bonus });
  if (plan.advanceTargets.length) await setPayrollAdvanceAmounts(payrollId, plan.advanceTargets);

  onProgress?.("snapshot");
  await syncSnapshotAmounts(payrollId, {
    items: newItems,
    aggregates,
    advances: [snapshotAdvanceOf({ ...bonus, ...bonusPatch, id: bonusId })],
  });
  return { ...plan, amountChanged, noteChanged };
}
