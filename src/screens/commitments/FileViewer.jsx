import { useEffect, useEffectEvent, useRef, useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { useIsMobile } from "../../hooks/useIsMobile";
import { fileSizeLabel, viewerKind } from "../../utils/attachments";
import { fmtDate } from "./helpers";
import { btnCls } from "./styles";
import { useFileUrl } from "./useFileUrl";

// Lo que hay que deslizar en el teléfono para pasar de archivo.
const SWIPE_PX = 50;

// Un archivo que el visor no muestra en la página: el PDF en el teléfono, que
// no lo dibuja dentro de otra página, o un tipo que no es imagen ni PDF.
function OpenOutside({ url, kind }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="text-5xl">📄</div>
      <p className="text-sm text-[var(--color-muted)]">
        {kind === "pdf" ? "En el teléfono, el PDF se abre en su propio visor." : "Este archivo se abre en otra pestaña."}
      </p>
      <a href={url} target="_blank" rel="noreferrer" className={`${btnCls} inline-flex min-h-9 items-center`}>
        ↗ Abrir {kind === "pdf" ? "el PDF" : "el archivo"}
      </a>
    </div>
  );
}

// Visor de adjuntos: la imagen o el PDF en grande, sin salir de la app. ‹ ›,
// las flechas del teclado o deslizar en el teléfono pasan al anterior o al
// siguiente de `files`. Cada archivo puede traer `context` (de dónde viene),
// que se muestra junto a su tamaño y fecha. Un clic en la imagen la muestra en
// su tamaño real, y otro la vuelve a ajustar.
export function FileViewer({ files, startIndex = 0, onClose }) {
  const isMobile = useIsMobile();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const touchX = useRef(null);
  const last = files.length - 1;
  const at = Math.min(Math.max(index, 0), last);
  const file = files[at];
  const { url, failed } = useFileUrl(file?.path);
  const kind = viewerKind(file?.contentType);

  const go = (delta) => {
    const next = Math.min(Math.max(at + delta, 0), last);
    if (next === at) return;
    setIndex(next);
    setZoomed(false);
  };

  const onKey = useEffectEvent((e) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  });
  useEffect(() => {
    const handler = (e) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const touchStart = (e) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const touchEnd = (e) => {
    const from = touchX.current;
    touchX.current = null;
    if (from === null || zoomed) return;
    const dx = (e.changedTouches[0]?.clientX ?? from) - from;
    if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  if (!file) return null;
  const details = [
    file.context,
    file.size ? fileSizeLabel(file.size) : "",
    fmtDate(String(file.uploadedAt || "").slice(0, 10)),
    file.uploadedByName,
  ].filter(Boolean);

  const outside = !(kind === "image" || (kind === "pdf" && !isMobile));
  let media;
  if (failed) {
    media = <p className="py-12 text-center text-sm text-[var(--color-danger)]">No se pudo abrir el archivo.</p>;
  } else if (!url) {
    media = <div className="h-[60vh] animate-pulse rounded-md bg-[var(--color-surface-2)]" />;
  } else if (!outside && kind === "image") {
    media = (
      <img
        src={url}
        alt={file.name}
        title={zoomed ? "Ajustar a la pantalla" : "Ver en tamaño real"}
        onClick={() => setZoomed(!zoomed)}
        className={zoomed ? "max-w-none cursor-zoom-out" : "mx-auto max-h-[65vh] max-w-full cursor-zoom-in object-contain"}
      />
    );
  } else if (!outside) {
    media = <iframe key={file.path} src={url} title={file.name} className="h-[70vh] w-full rounded-md border border-[var(--color-border)]" />;
  } else {
    media = <OpenOutside url={url} kind={kind} />;
  }

  return (
    <Modal
      open
      size="2xl"
      onClose={onClose}
      title={file.name}
      footer={
        <>
          {files.length > 1 && (
            <div className="mr-auto flex items-center gap-2">
              <button type="button" aria-label="Anterior" className={`${btnCls} min-h-9 min-w-9`} disabled={at === 0} onClick={() => go(-1)}>
                ‹
              </button>
              <span className="whitespace-nowrap text-sm tabular-nums text-[var(--color-muted)]">
                {at + 1} de {files.length}
              </span>
              <button type="button" aria-label="Siguiente" className={`${btnCls} min-h-9 min-w-9`} disabled={at === last} onClick={() => go(1)}>
                ›
              </button>
            </div>
          )}
          {url && !outside && (
            <a href={url} target="_blank" rel="noreferrer" title="Abrir en otra pestaña" className={`${btnCls} inline-flex min-h-9 items-center`}>
              ↗ Abrir
            </a>
          )}
          <ModalCloseButton className={`${btnCls} min-h-9`}>Cerrar</ModalCloseButton>
        </>
      }
    >
      {details.length > 0 && <p className="mb-3 text-xs text-[var(--color-muted)]">{details.join(" · ")}</p>}
      <div onTouchStart={touchStart} onTouchEnd={touchEnd}>
        {media}
      </div>
    </Modal>
  );
}
