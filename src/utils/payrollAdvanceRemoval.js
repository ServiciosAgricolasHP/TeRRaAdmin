// Quitar de una nómina pendiente anticipos o bonos que ya aplica, desde
// "📋 Ver anticipos y bonos". La nómina queda como si se hubiera armado sin
// ellos: a la persona se le devuelve lo descontado o se le resta lo
// acreditado, y si al quitar un bono un anticipo ya no cabe en bruto + bonos,
// se achica y lo que no cabe vuelve al anticipo (`refitAppliedAdvances`, la
// regla de achicar la nómina).
import { appliedFromItem, itemAdvanceFields, payoutOf, refitAppliedAdvances } from "./payrollItem";

// Un item sin `grossAmount` es de antes de que se guardara: su bruto es el neto.
const grossOf = (it) => Math.round(Number(it?.grossAmount ?? it?.amount) || 0);

// `entries`: `{ rut, advanceId }` de una o varias personas. `appliedByAdvance`
// es lo que la nómina descuenta hoy de cada anticipo (`readPayrollApplications`).
// Devuelve los items de la nómina después de quitarlos, el monto final que
// la nómina le descuenta a cada anticipo o bono de esas personas (`targets`,
// para `setPayrollAdvanceAmounts`; 0 lo suelta) y, por persona, lo quitado y
// su líquido antes y después. Lo que la nómina ya no aplica se salta; si no
// queda nada que quitar, devuelve null.
export function planAdvanceRemoval({ items = [], entries = [], appliedByAdvance = new Map() }) {
  const byRut = new Map();
  for (const e of entries) {
    if (!e?.rut || !e?.advanceId) continue;
    byRut.set(e.rut, new Set([...(byRut.get(e.rut) || []), e.advanceId]));
  }
  const next = [...items];
  const targets = [];
  const people = [];
  const removedIds = [];
  for (const [rut, drop] of byRut) {
    const i = next.findIndex((it) => it.rut === rut);
    if (i < 0) continue;
    const item = next[i];
    const applied = appliedFromItem(item, appliedByAdvance);
    const removed = applied.filter((a) => drop.has(a.advanceId) && a.amount > 0);
    if (removed.length === 0) continue;
    const refit = refitAppliedAdvances({
      gross: grossOf(item),
      applied: applied.filter((a) => !drop.has(a.advanceId)),
      payout: payoutOf(item),
    });
    next[i] = { ...item, ...itemAdvanceFields(refit) };
    for (const a of removed) {
      removedIds.push(a.advanceId);
      if (!a.missing) targets.push({ advanceId: a.advanceId, amount: 0 });
    }
    for (const t of refit.targets) if (!t.missing) targets.push({ advanceId: t.advanceId, amount: t.amount });
    people.push({
      rut,
      name: item.name || rut,
      removed: removed.map((a) => ({ advanceId: a.advanceId, kind: a.kind, amount: a.amount })),
      returned: refit.devuelto,
      oldNet: Math.round(Number(item.amount) || 0),
      newNet: refit.amount,
    });
  }
  if (removedIds.length === 0) return null;
  return { items: next, targets, people, removedIds };
}
