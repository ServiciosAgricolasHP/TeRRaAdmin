import { useState } from "react";
import { AttachmentsModal } from "../../../components/AttachmentsModal";
import { useToast } from "../../../contexts/ToastContext";
import { payrollAttachments } from "../../../services/payrollsService";
import { ProgressOverlay } from "../ProgressOverlay";

// El avance de preparar, subir o quitar un adjunto, con el gato de Nómina: el
// que persigue su cola al quitar.
function progressInfo(stage) {
  const step = stage.undo ? "Quitando el adjunto..." : stage.total ? "Subiendo los adjuntos..." : "Preparando los archivos...";
  return {
    step,
    detail: stage.total ? `${stage.done} / ${stage.total}` : "",
    percent: stage.total ? (stage.done / stage.total) * 100 : 0,
    indeterminate: !stage.total,
    undo: !!stage.undo,
  };
}

// 📎 Adjuntos de la nómina, en la fila de acciones del detalle: el
// comprobante de las transferencias, la cartola del banco o lo que respalde el
// pago. Abre `AttachmentsModal` con la nómina como dueña.
export function PayrollAttachments({ payroll, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const count = (payroll.attachments || []).length;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Comprobantes y archivos de la nómina: el comprobante de las transferencias, la cartola del banco"
        className="min-h-8 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
      >
        📎 Adjuntos{count > 0 && <span className="tabular-nums"> ({count})</span>}
      </button>
      {open && (
        <AttachmentsModal
          title={`Adjuntos · ${payroll.name}`}
          owner={payroll}
          target={payrollAttachments}
          renderProgress={(stage) => <ProgressOverlay info={progressInfo(stage)} />}
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
