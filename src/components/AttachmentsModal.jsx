import { useEffect, useEffectEvent, useRef, useState } from "react";
import Modal, { ModalCloseButton } from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { ProgressBar } from "./ProgressBar";
import { useIsMobile } from "../hooks/useIsMobile";
import { attachmentSummary, transferFiles } from "../utils/attachments";
import { FileViewer } from "./FileViewer";
import { useAttachments } from "../hooks/useAttachments";
import { useFileUrl } from "../hooks/useFileUrl";

const ACCEPT = "image/*,application/pdf";
const BTN =
  "min-h-9 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50";

// Una fila de la lista: la miniatura de una imagen o el ícono de un PDF y el
// nombre, que abren el visor. El enlace de la miniatura se pide al mostrarse.
function AttachmentRow({ attachment, disabled, onOpen, onRemove }) {
  const image = attachment.contentType?.startsWith("image/");
  const { url, failed } = useFileUrl(image ? attachment.path : null);
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <button
        type="button"
        title="Ver"
        aria-label={`Ver ${attachment.name}`}
        onClick={onOpen}
        className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-2xl ${
          image && !url && !failed ? "animate-pulse" : ""
        }`}
      >
        {image && url ? <img src={url} alt="" className="h-full w-full object-cover" /> : image ? null : "📄"}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="block max-w-full truncate text-left font-medium hover:underline" title={attachment.name}>
          {attachment.name}
        </button>
        <div className="text-xs text-[var(--color-muted)]">{attachmentSummary(attachment)}</div>
        {failed && <div className="text-xs text-[var(--color-danger)]">No se pudo abrir el archivo.</div>}
      </div>
      <button
        type="button"
        title="Quitar adjunto"
        aria-label={`Quitar ${attachment.name}`}
        disabled={disabled}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-danger)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
        onClick={() => onRemove(attachment)}
      >
        ✕
      </button>
    </div>
  );
}

// Fotos y PDF de un documento (`owner`: un vencimiento, una nómina), como un
// comprobante de pago, una factura o la foto de un cheque, con el `target` de
// su colección (`services/attachments.js`). Se suben apenas se eligen, se
// arrastran o se pegan (Ctrl+V, por ejemplo una imagen copiada de WhatsApp
// Web, o 📋 Pegar imagen en el teléfono). `renderProgress(stage)` dibuja el
// avance a la manera de la pantalla; sin él, una barra en el modal.
export function AttachmentsModal({ title, owner, target, onClose, onSaved, renderProgress }) {
  const isMobile = useIsMobile();
  const { busy, stage, rejected, add, pasteFromClipboard, remove } = useAttachments({ target, owner, onSaved });
  const [removing, setRemoving] = useState(null);
  const [viewing, setViewing] = useState(null); // índice del adjunto abierto en el visor
  const [dragging, setDragging] = useState(false);
  const pickRef = useRef(null);
  const cameraRef = useRef(null);
  const attachments = owner.attachments || [];
  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.read;

  // Ctrl+V en cualquier parte del modal abierto, salvo con el visor encima.
  const onPaste = useEffectEvent((e) => {
    if (viewing !== null) return;
    const files = transferFiles(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    add(files);
  });
  useEffect(() => {
    const handler = (e) => onPaste(e);
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  const fromInput = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    add(files);
  };

  const drop = (e) => {
    e.preventDefault();
    setDragging(false);
    add(transferFiles(e.dataTransfer));
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const attachment = removing;
    setRemoving(null);
    await remove(attachment);
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={title}
      footer={<ModalCloseButton className={BTN}>Cerrar</ModalCloseButton>}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`rounded-lg border-2 border-dashed p-4 text-center ${
          dragging ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)]"
        }`}
      >
        <div className="flex flex-wrap justify-center gap-2">
          {isMobile && (
            <button type="button" className={BTN} disabled={busy} onClick={() => cameraRef.current?.click()}>
              📷 Sacar foto
            </button>
          )}
          <button type="button" className={BTN} disabled={busy} onClick={() => pickRef.current?.click()}>
            📎 Elegir archivos
          </button>
          {canReadClipboard && (
            <button type="button" className={BTN} disabled={busy} onClick={pasteFromClipboard}>
              📋 Pegar imagen
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {isMobile
            ? "Fotos, imágenes y PDF, hasta 10 MB. Las fotos se achican antes de subirlas."
            : "Arrastra los archivos aquí o pega una imagen con Ctrl+V, como una copiada de WhatsApp Web. Fotos, imágenes y PDF, hasta 10 MB; las fotos se achican antes de subirlas."}{" "}
          Word y Excel se guardan como PDF primero.
        </p>
        <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={fromInput} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={fromInput} />
      </div>

      {stage &&
        (renderProgress ? (
          renderProgress(stage)
        ) : (
          <div className="mt-3">
            <ProgressBar label={stage.label} done={stage.done} total={stage.total} />
          </div>
        ))}
      {rejected.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--color-warning)]">
          {rejected.map((r, i) => (
            <li key={i}>⚠ {r}</li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-5 text-sm font-semibold">Adjuntos ({attachments.length})</h3>
      {attachments.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Todavía no hay adjuntos.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {attachments.map((a, i) => (
            <AttachmentRow key={a.id} attachment={a} disabled={busy} onOpen={() => setViewing(i)} onRemove={setRemoving} />
          ))}
        </div>
      )}

      {viewing !== null && attachments.length > 0 && (
        <FileViewer files={attachments} startIndex={viewing} onClose={() => setViewing(null)} />
      )}

      <ConfirmDialog
        open={!!removing}
        title="Quitar adjunto"
        message={removing ? `¿Quitar ${removing.name}? El archivo se borra.` : ""}
        confirmLabel="Quitar"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  );
}
