import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Menú "⋯" con las acciones secundarias de una fila. Va en un portal con
// posición fija: una tabla con overflow-x-auto recortaría un desplegable
// absoluto. Se cierra al hacer click afuera, con Escape o al cambiar el tamaño
// de la ventana. Al desplazar sigue al botón (tocar una fila que se ve a
// medias desplaza la lista), y se cierra si el botón sale de la pantalla.
// `items`: { icon, label, hint, onClick, danger, disabled } o { divider: true }.
// Una opción `disabled` se muestra apagada y su `hint` dice por qué.
// `trigger` y `triggerClassName` reemplazan el botón "⋯" por uno propio (por
// ejemplo "📥 Descargar"); `triggerLabel` es su nombre accesible.
export default function RowMenu({ items, trigger = "⋯", triggerLabel = "Más acciones", triggerClassName = "" }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const open = !!pos;

  const close = (refocus) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  };

  // El menú mide a lo más ~320 px: si abajo no cabe y arriba hay más espacio,
  // se ancla por abajo y crece hacia arriba.
  const place = (r) => {
    const below = window.innerHeight - r.bottom;
    const up = below < 320 && r.top > below;
    return { right: window.innerWidth - r.right, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) };
  };
  const toggle = () => {
    if (open) return close();
    setPos(place(btnRef.current.getBoundingClientRect()));
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus({ preventScroll: true });
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setPos(null);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setPos(null);
      btnRef.current?.focus();
    };
    const onScroll = () => {
      const r = btnRef.current?.getBoundingClientRect();
      setPos(!r || r.bottom < 0 || r.top > window.innerHeight ? null : place(r));
    };
    const onResize = () => setPos(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Flechas arriba/abajo recorren las opciones habilitadas.
  const onMenuKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = [...menuRef.current.querySelectorAll("[role=menuitem]:not([disabled])")];
    const i = els.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? (i + 1) % els.length : i <= 0 ? els.length - 1 : i - 1;
    els[next]?.focus();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={triggerLabel}
        title={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={
          triggerClassName ||
          `flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg leading-none md:h-8 md:w-8 ${
            open
              ? "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
              : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          }`
        }
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            tabIndex={-1}
            onKeyDown={onMenuKey}
            style={pos}
            className="fixed z-50 w-60 max-w-[calc(100vw-16px)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-[var(--color-text)] shadow-xl outline-none"
          >
            {items.map((it, i) =>
              it.divider ? (
                <div key={`d${i}`} role="separator" className="my-1 border-t border-[var(--color-border)]" />
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    close();
                    it.onClick();
                  }}
                  className={`flex min-h-10 w-full items-start gap-2.5 px-3 py-2 text-left text-sm outline-none hover:bg-[var(--color-surface-2)] focus:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent md:min-h-9 ${
                    it.danger ? "text-[var(--color-danger)]" : ""
                  }`}
                >
                  <span className="w-5 shrink-0 text-center" aria-hidden="true">{it.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{it.label}</span>
                    {it.hint && <span className="block text-xs font-normal text-[var(--color-muted)]">{it.hint}</span>}
                  </span>
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}
