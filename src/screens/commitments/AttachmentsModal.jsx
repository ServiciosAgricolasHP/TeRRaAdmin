import { useEffect, useEffectEvent, useRef, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { ProgressBar } from "../../components/ProgressBar";
import { useIsMobile } from "../../hooks/useIsMobile";
import { fileUrl } from "../../services/storageFiles";
import { fileSizeLabel, transferFiles } from "../../utils/attachments";
import { fmtDate } from "./helpers";
import { btnCls } from "./styles";
import { useAttachments } from "./useAttachments";

const ACCEPT = "image/*,application/pdf";

// Una fila de la lista: la miniatura de una imagen o el ícono de un PDF, que
// abren el archivo en otra pestaña. El enlace se pide al mostrarse.
function AttachmentRow({ attachment, disabled, onRemove }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fileUrl(attachment.path)
      .then((u) => live && setUrl(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attachment.path]);

  const image = attachment.contentType?.startsWith("image/");
  const who = attachment.uploadedByName ? ` · ${attachment.uploadedByName}` : "";
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      <a
        href={url || undefined}
        target="_blank"
        rel="noreferrer"
        title="Abrir"
        className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-2xl ${
          image && !url && !failed ? "animate-pulse" : ""
        }`}
      >
        {image && url ? <img src={url} alt="" className="h-full w-full object-cover" /> : image ? null : "📄"}
      </a>
      <div className="min-w-0 flex-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline" title={attachment.name}>
            {attachment.name}
          </a>
        ) : (
          <div className="truncate font-medium" title={attachment.name}>{attachment.name}</div>
        )}
        <div className="text-xs text-[var(--color-muted)]">
          {fileSizeLabel(attachment.size)} · {fmtDate(String(attachment.uploadedAt || "").slice(0, 10))}{who}
        </div>
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

// Fotos y PDF de un vencimiento: comprobantes de pago, facturas, fotos de un
// cheque. Se suben apenas se eligen, se arrastran o se pegan (Ctrl+V, por
// ejemplo una imagen copiada de WhatsApp Web, o 📋 Pegar imagen en el teléfono).
export function AttachmentsModal({ item, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const { busy, stage, rejected, add, pasteFromClipboard, remove } = useAttachments({ item, onSaved });
  const [removing, setRemoving] = useState(null);
  const [dragging, setDragging] = useState(false);
  const pickRef = useRef(null);
  const cameraRef = useRef(null);
  const attachments = item.attachments || [];
  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.read;

  // Ctrl+V en cualquier parte del modal abierto.
  const onPaste = useEffectEvent((e) => {
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
    const target = removing;
    setRemoving(null);
    await remove(target);
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Adjuntos · ${item.counterparty}`}
      footer={<ModalCloseButton className={btnCls}>Cerrar</ModalCloseButton>}
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
            <button type="button" className={`${btnCls} min-h-9`} disabled={busy} onClick={() => cameraRef.current?.click()}>
              📷 Sacar foto
            </button>
          )}
          <button type="button" className={`${btnCls} min-h-9`} disabled={busy} onClick={() => pickRef.current?.click()}>
            📎 Elegir archivos
          </button>
          {canReadClipboard && (
            <button type="button" className={`${btnCls} min-h-9`} disabled={busy} onClick={pasteFromClipboard}>
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

      {stage && (
        <div className="mt-3">
          <ProgressBar label={stage.label} done={stage.done} total={stage.total} />
        </div>
      )}
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
          {attachments.map((a) => (
            <AttachmentRow key={a.id} attachment={a} disabled={busy} onRemove={setRemoving} />
          ))}
        </div>
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
