import { useState } from "react";
import Modal, { ModalCloseButton } from "../../../components/Modal";
import { useValuesChanged } from "../../../hooks/useValuesChanged";
import { fmtCurrency } from "../../../utils/format";
import { hasChanges } from "../../../utils/formChanges";
import { formatRutForDisplay } from "../../../utils/rutUtils";
import { toTitleName } from "../../../utils/textCase";
import { bonusChangeError, bonusPaidElsewhere, planBonusChange } from "../../../utils/payrollBonusChange";

const dayText = (iso) => String(iso || "").split("-").reverse().join("-");
const signed = (n) => `${n > 0 ? "+" : "−"} ${fmtCurrency(Math.abs(n))}`;

// Editar el monto y la nota de un bono que la nómina ya le aplica a una
// persona, con lo que cambia antes de aplicarlo: el bono, el anticipo (solo
// si ya no cabe) y el líquido. `target` es el de `useBonusChange`; `cashPaid`, si la persona
// ya cobró su efectivo.
export function BonusChangeModal({ target, payrollId, cashPaid, busy, onClose, onConfirm }) {
  const { item, bonusId, bonus } = target;
  const current = Math.round(Number((item.bonoApplications || []).find((b) => b.advanceId === bonusId)?.amount) || 0);
  const [initial, setInitial] = useState({ amount: "", note: "" });
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  if (useValuesChanged([bonus]) && bonus) {
    const loaded = { amount: String(Math.round(Number(bonus.amount) || 0)), note: bonus.note || "" };
    setInitial(loaded);
    setValue(loaded.amount);
    setNote(loaded.note);
  }

  const paidElsewhere = bonus ? bonusPaidElsewhere(bonus, payrollId) : 0;
  const amount = Number(value);
  const noteChanged = !!bonus && toTitleName(note) !== (bonus.note || "");
  const error = bonus ? bonusChangeError(amount, { paidElsewhere, current, noteChanged }) : "";
  const plan = bonus && !error ? planBonusChange({ item, bonusId, newAmount: amount, paidElsewhere }) : null;
  const amountChanged = !!plan && (plan.bonusAfter !== current || value !== initial.amount);
  const dirty = !busy && hasChanges(initial, { amount: value, note });
  const submit = () => {
    if (plan && !busy) onConfirm({ amount, note });
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      size="md"
      section="Cambiar bono"
      title="🎁 Editar el bono"
      footer={
        <>
          <ModalCloseButton onClick={onClose} className="min-h-8 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={submit}
            disabled={!plan || busy}
            className="min-h-8 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-medium">{item.name || item.rut}</div>
          <div className="text-xs text-[var(--color-muted)]">
            {formatRutForDisplay(item.rut)}
            {bonus?.date ? ` · bono del ${dayText(bonus.date)}` : ""}
          </div>
        </div>

        {!bonus ? (
          <div className="py-4 text-center text-[var(--color-muted)]">Leyendo el bono…</div>
        ) : (
          <>
            <p className="text-xs text-[var(--color-muted)]">
              Esta nómina le paga {fmtCurrency(current)}
              {paidElsewhere > 0 ? `; otras nóminas ya pagaron ${fmtCurrency(paidElsewhere)}` : ""}. El bono queda con el
              monto nuevo, como si hubiera sido así desde el principio.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Monto nuevo del bono</span>
              <input
                autoFocus
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="min-h-8 w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-right tabular-nums outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Nota</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Para qué es el bono"
                className="min-h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            {error && dirty ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}

            {amountChanged && (
              <table className="w-full text-sm">
                <thead className="text-xs text-[var(--color-muted)]">
                  <tr>
                    <th className="py-1 text-left font-normal" />
                    <th className="py-1 text-right font-normal">Antes</th>
                    <th className="py-1 text-right font-normal">Después</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <ChangeRow label="🎁 Bono" before={plan.bonusBefore} after={plan.bonusAfter} />
                  <ChangeRow label="↩ Anticipos" before={Number(item.advance) || 0} after={plan.item.advance} />
                  <ChangeRow label="Líquido" before={plan.oldNet} after={plan.newNet} strong />
                </tbody>
              </table>
            )}
            {plan?.returned > 0 && (
              <p className="text-xs text-[var(--color-muted)]">
                Con el bono más bajo, su anticipo ya no cabe entero: vuelven {fmtCurrency(plan.returned)} al anticipo, que
                queda pendiente para la próxima nómina.
              </p>
            )}
            {plan && cashPaid && plan.newNet !== plan.oldNet && (
              <div className="rounded-md border border-[var(--color-warning)] px-3 py-2 text-xs">
                ⚠ {item.name || "Esta persona"} ya cobró su efectivo: la diferencia ({signed(plan.newNet - plan.oldNet)}) se
                arregla en la mano.
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ChangeRow({ label, before, after, strong = false }) {
  const changed = before !== after;
  return (
    <tr className={`border-t border-[var(--color-border)] ${strong ? "font-semibold" : ""}`}>
      <td className="py-1.5">{label}</td>
      <td className="whitespace-nowrap py-1.5 text-right text-[var(--color-muted)]">{fmtCurrency(before)}</td>
      <td className={`whitespace-nowrap py-1.5 text-right ${changed ? "text-[var(--color-accent)]" : ""}`}>{fmtCurrency(after)}</td>
    </tr>
  );
}
