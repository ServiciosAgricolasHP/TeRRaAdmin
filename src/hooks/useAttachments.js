import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { addAttachments, removeAttachment } from "../services/commitmentsService";
import { attempt } from "../utils/attempt";
import { errorText } from "../utils/errorText";
import { prepareAttachments, readClipboardImages } from "../utils/prepareAttachments";

// Subir y quitar los adjuntos de un vencimiento. Los archivos se suben apenas
// se eligen, se pegan o se arrastran: no hay nada que guardar después.
export function useAttachments({ item, onSaved }) {
  const toast = useToast();
  const [stage, setStage] = useState(null); // null | { label, done, total }; sin total, la barra queda indeterminada
  const [rejected, setRejected] = useState([]);

  const busy = !!stage;

  const add = async (files) => {
    if (busy || files.length === 0) return;
    setRejected([]);
    setStage({ label: "Preparando", done: 0, total: 0 });
    const { ready, rejected: why } = await prepareAttachments(files);
    setRejected(why);
    if (ready.length > 0) {
      setStage({ label: "Subiendo", done: 0, total: ready.length });
      const onProgress = (done) => setStage({ label: "Subiendo", done, total: ready.length });
      const { error: err } = await attempt(() => addAttachments(item, ready, { onProgress }));
      if (err) toast.error(errorText(err));
      else await onSaved(ready.length === 1 ? "Adjunto guardado" : `${ready.length} adjuntos guardados`);
    }
    setStage(null);
  };

  const pasteFromClipboard = async () => {
    const { value: files, error: err } = await attempt(() => readClipboardImages());
    if (err) toast.error(errorText(err));
    else if (files.length === 0) toast.error("No hay una imagen copiada. Copia la imagen primero y vuelve a intentar.");
    else await add(files);
  };

  const remove = async (attachment) => {
    setStage({ label: "Quitando", done: 0, total: 0 });
    const { error: err } = await attempt(() => removeAttachment(item, attachment));
    if (err) toast.error(errorText(err));
    else await onSaved("Adjunto quitado");
    setStage(null);
  };

  return { busy, stage, rejected, add, pasteFromClipboard, remove };
}
