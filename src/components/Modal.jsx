import { createContext, useContext, useEffect, useRef, useState } from "react";

// Cierre del modal más cercano, con el aviso de cambios sin guardar.
const ModalCloseContext = createContext(null);

// Modales abiertos, del primero al último. Escape cierra solo el de arriba.
const openModals = [];

// Botón que cierra el modal que lo contiene pasando por el mismo aviso que el
// ✕, Escape y el clic afuera. Es el "Cancelar" de los formularios con `dirty`.
export function ModalCloseButton({ children, onClick, ...props }) {
  const close = useContext(ModalCloseContext);
  return (
    <button type="button" {...props} onClick={close || onClick}>
      {children}
    </button>
  );
}

// `dirty`: el formulario tiene cambios sin guardar. Cerrar por el ✕, Escape,
// el clic afuera o un `ModalCloseButton` pide confirmación antes de descartarlos,
// y cerrar o recargar la pestaña muestra el aviso del navegador.
export default function Modal({ open, onClose, title, children, footer, size = "md", dirty = false }) {
  const [askDiscard, setAskDiscard] = useState(false);
  // El clic afuera cierra solo si también empezó afuera: arrastrar una
  // selección desde un campo hasta el fondo no es un clic en el fondo.
  const pressedBackdrop = useRef(false);
  const stackToken = useRef(null);

  const requestClose = () => {
    if (dirty) setAskDiscard(true);
    else onClose?.();
  };

  useEffect(() => {
    if (!open) return;
    const token = {};
    stackToken.current = token;
    openModals.push(token);
    return () => {
      const i = openModals.indexOf(token);
      if (i >= 0) openModals.splice(i, 1);
    };
  }, [open]);

  useEffect(() => {
    if (!open || askDiscard) return;
    const onKey = (e) => {
      if (e.key !== "Escape" || openModals[openModals.length - 1] !== stackToken.current) return;
      if (dirty) setAskDiscard(true);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dirty, askDiscard]);

  useEffect(() => {
    if (!open || !dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, dirty]);

  if (!open) return null;

  const widths = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    "2xl": "max-w-6xl",
    "3xl": "max-w-7xl",
    full: "max-w-[96vw]",
  };

  return (
    <ModalCloseContext.Provider value={requestClose}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        onMouseDown={(e) => {
          pressedBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && pressedBackdrop.current) requestClose();
          pressedBackdrop.current = false;
        }}
      >
        <div
          className={`flex max-h-[90vh] w-full ${widths[size]} flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
            <h2 className="font-semibold">{title}</h2>
            <button type="button" onClick={requestClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">{footer}</div>}
        </div>
      </div>
      {askDiscard && (
        <Modal
          open
          size="sm"
          title="Cambios sin guardar"
          onClose={() => setAskDiscard(false)}
          footer={
            <>
              <button
                type="button"
                autoFocus
                onClick={() => setAskDiscard(false)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setAskDiscard(false);
                  onClose?.();
                }}
                className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Descartar cambios
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-muted)]">Hay cambios que no se han guardado. Si cierras, se pierden.</p>
        </Modal>
      )}
    </ModalCloseContext.Provider>
  );
}
