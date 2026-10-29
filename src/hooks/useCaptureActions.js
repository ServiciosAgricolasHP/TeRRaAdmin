import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { copyNodeImage, downloadNodePng } from "../utils/imageCapture";
import { PopupBlockedError, printNodeAsImage, printNodes } from "../utils/printWindow";

const IMAGE_COPIED = "Imagen copiada al portapapeles";

// Corre una exportación con `key` como ocupada mientras dura. Si falla avisa,
// como advertencia si lo que falló es que el navegador bloqueó la ventana.
async function runTask(setBusy, toast, key, task, { success, error = "No se pudo exportar" } = {}) {
  setBusy(key);
  try {
    await task();
    if (success) toast.success(success);
  } catch (err) {
    if (err instanceof PopupBlockedError) toast.warning(err.message);
    else toast.error(`${error}: ${err?.message || err}`);
  } finally {
    setBusy("");
  }
}

// Copiar la imagen, descargar el PNG, imprimir y copiar el texto de lo que
// muestra una pantalla. Cada acción recibe el nodo al llamarla (sin nodo no
// hace nada), así una pantalla con varias tablas usa un solo hook. `busy` es
// la acción en curso ("copy", "download", "print", "text" o la `key` que se
// pase) y `run` corre cualquier otra exportación, como el Excel, con el mismo
// `busy` y el mismo aviso si falla.
//
// La imagen sale en el tema claro y con todo su ancho (`utils/imageCapture.js`);
// la impresión, en una ventana aparte (`utils/printWindow.js`).
export function useCaptureActions() {
  const toast = useToast();
  const [busy, setBusy] = useState("");

  const run = (key, task, options) => runTask(setBusy, toast, key, task, options);

  // `success` cambia el aviso al copiar e `image` pasa opciones a html-to-image.
  const copy = (node, { key = "copy", success = IMAGE_COPIED, image } = {}) => {
    if (!node) return;
    return run(key, () => copyNodeImage(node, image), { success, error: "No se pudo copiar la imagen" });
  };

  const download = (node, fileName, { key = "download", image } = {}) => {
    if (!node) return;
    return run(key, () => downloadNodePng(node, fileName, image), { error: "No se pudo descargar la imagen" });
  };

  // `nodes` es un nodo o una lista (uno por hoja). `options` son las de
  // `printDocument` (title, page, margin, css); con `asImage` imprime la
  // imagen del nodo en una sola hoja.
  const print = (nodes, { key = "print", asImage = false, ...options } = {}) => {
    const list = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
    if (list.length === 0) return;
    const task = asImage ? () => printNodeAsImage(list[0], options) : () => printNodes(list, options);
    return run(key, task, { error: "No se pudo imprimir" });
  };

  const copyText = (text, { key = "text" } = {}) =>
    run(key, () => navigator.clipboard.writeText(text), { success: "Texto copiado", error: "No se pudo copiar el texto" });

  return { busy, run, copy, download, print, copyText };
}
