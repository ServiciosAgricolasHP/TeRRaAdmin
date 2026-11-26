import { useState } from "react";
import Modal, { ModalCloseButton } from "../../../components/Modal";
import { AttachmentRow } from "../../../components/AttachmentsModal";
import { FileViewer } from "../../../components/FileViewer";

// Los archivos de todos los resúmenes de un transportista (`carrierFiles`,
// `utils/transportAttachments.js`), agrupados por resumen del más nuevo al más
// viejo, con el abono que respalda cada uno. Es para ver: los archivos se
// adjuntan en el resumen o en su abono. El visor recorre todos seguidos.
export function CarrierFilesModal({ carrierName, files, onClose }) {
  const [viewing, setViewing] = useState(null);
  const groups = [];
  files.forEach((file, index) => {
    const last = groups[groups.length - 1];
    if (last && last.paymentId === file.paymentId) last.items.push({ file, index });
    else groups.push({ paymentId: file.paymentId, label: file.groupLabel, items: [{ file, index }] });
  });

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`📎 Archivos — ${carrierName}`}
      footer={
        <ModalCloseButton className="min-h-9 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">
          Cerrar
        </ModalCloseButton>
      }
    >
      {files.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          Todavía no hay archivos. Se adjuntan en cada resumen (📎 Adjuntos) o en uno de sus abonos (📎).
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.paymentId}>
              <h3 className="mb-1.5 text-sm font-semibold">{group.label}</h3>
              <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
                {group.items.map(({ file, index }) => (
                  <AttachmentRow key={file.id} attachment={{ ...file, context: file.abonoLabel }} onOpen={() => setViewing(index)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {viewing !== null && files.length > 0 && <FileViewer files={files} startIndex={viewing} onClose={() => setViewing(null)} />}
    </Modal>
  );
}
