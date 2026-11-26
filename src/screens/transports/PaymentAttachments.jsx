import { useState } from "react";
import { AttachmentsModal } from "../../components/AttachmentsModal";
import { useToast } from "../../contexts/ToastContext";
import { transportPaymentAttachments } from "../../services/transportsService";
import { abonoAttachmentCount, abonoFileLabel, abonoOfAttachment, paymentFileLabel } from "../../utils/transportAttachments";

const FULL_BTN = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]";
const COMPACT_BTN =
  "min-h-7 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50";

// 📎 Adjuntos de un resumen de transporte, o de uno de sus abonos con `abono`:
// el botón con la cantidad y `AttachmentsModal`. Los del resumen muestran todos
// sus archivos, con el abono que respalda cada uno; los de un abono, solo los
// suyos, y lo que se sube queda con ese abono. Se adjunta también con el
// resumen pagado.
export function PaymentAttachments({ payment, carrierName = "", abono = null, compact = false, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const count = abono ? abonoAttachmentCount(payment, abono.id) : (payment.attachments || []).length;
  const scope = abono
    ? { filter: (a) => a.abonoId === abono.id, extra: { abonoId: abono.id } }
    : { contextOf: (a) => (abonoOfAttachment(payment, a) ? abonoFileLabel(abonoOfAttachment(payment, a)) : "") };
  const title = abono
    ? `Adjuntos · ${abonoFileLabel(abono)}`
    : ["Adjuntos", carrierName, paymentFileLabel(payment)].filter(Boolean).join(" · ");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={abono ? "El comprobante de este abono" : "Comprobantes y archivos del resumen, también los de sus abonos"}
        aria-label={abono ? `Adjuntos del abono${count ? ` (${count})` : ""}` : undefined}
        className={compact ? COMPACT_BTN : FULL_BTN}
      >
        📎{compact ? "" : " Adjuntos"}
        {count > 0 && <span className="tabular-nums">{compact ? ` ${count}` : ` (${count})`}</span>}
      </button>
      {open && (
        <AttachmentsModal
          title={title}
          owner={payment}
          target={transportPaymentAttachments}
          scope={scope}
          onClose={() => setOpen(false)}
          onSaved={async (message) => {
            toast.success(message);
            await onChanged?.();
          }}
        />
      )}
    </>
  );
}
