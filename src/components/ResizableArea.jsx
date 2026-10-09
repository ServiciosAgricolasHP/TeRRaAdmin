import { useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "af.gridHeight.";

// Hook sin UI para componentes que ponen el control de alto en otro lugar que
// no sea justo debajo de la grilla (p. ej. una toolbar). Devuelve el alto, el
// handler que inicia el arrastre y `reset`; se usa junto con <ResizeHandle>.
export function useResizableHeight(storageKey, defaultHeight = 500, minHeight = 240) {
  const computeMax = () => Math.max(minHeight + 100, window.innerHeight - 120);

  const [height, setHeight] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return Math.min(computeMax(), Math.max(minHeight, n));
    } catch { /* noop */ }
    return defaultHeight;
  });
  const heightRef = useRef(height);
  useEffect(() => { heightRef.current = height; }, [height]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_PREFIX + storageKey, String(height)); } catch { /* noop */ }
  }, [height, storageKey]);

  // Arrastre en curso (nodo y listeners); null cuando no hay ninguno.
  const dragRef = useRef(null);

  // Pointer Events con setPointerCapture sobre el handle: todos los
  // pointermove/pointerup siguientes llegan a ese nodo, esté el cursor sobre
  // ag-grid, un popover o un iframe. Sin listeners en window, nada de la
  // página se traga los eventos.
  const onPointerDown = (e) => {
    // Con mouse, solo el botón principal; touch y lápiz también traen button === 0.
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.currentTarget;
    if (!target) return;

    const startY = e.clientY;
    const startH = heightRef.current;
    const max = computeMax();

    try { target.setPointerCapture(e.pointerId); } catch { /* noop */ }

    const move = (ev) => {
      const next = Math.max(minHeight, Math.min(max, startH + (ev.clientY - startY)));
      setHeight(next);
    };
    const stop = (ev) => {
      try { target.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      dragRef.current = null;
    };

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
    dragRef.current = { target, move, stop };

    // Evita seleccionar texto durante el arrastre. No corta la propagación:
    // los demás listeners (p. ej. cerrar un dropdown al hacer click afuera)
    // reciben el click igual.
    e.preventDefault();
  };

  const reset = () => setHeight(defaultHeight);

  return { height, setHeight, onPointerDown, reset };
}

// Barra de arrastre con estilo de separador, a todo el ancho del padre.
// Arrastrar en vertical cambia el alto y el doble click lo reinicia. Mouse,
// lápiz y touch van por Pointer Events.
export function ResizeHandle({ onPointerDown, onDoubleClick, label = "Arrastrar para cambiar el alto del grid · Doble click para reiniciar" }) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Arrastrar para cambiar el alto. Doble click para reiniciar."
      title={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="group relative my-1 flex h-3 w-full shrink-0 cursor-ns-resize select-none items-center justify-center rounded bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
      style={{ touchAction: "none" }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-border)] group-hover:bg-[var(--color-accent)]" />
      <div className="pointer-events-none relative z-10 flex h-2 w-12 items-center justify-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 group-hover:border-[var(--color-accent)]">
        <span className="block h-0.5 w-1 rounded-full bg-[var(--color-muted)] group-hover:bg-[var(--color-accent)]" />
        <span className="block h-0.5 w-1 rounded-full bg-[var(--color-muted)] group-hover:bg-[var(--color-accent)]" />
        <span className="block h-0.5 w-1 rounded-full bg-[var(--color-muted)] group-hover:bg-[var(--color-accent)]" />
      </div>
    </div>
  );
}

// Área de alto fijo con el handle justo debajo. Si el handle va en otro lugar
// (p. ej. una toolbar), se usan useResizableHeight y ResizeHandle.
export default function ResizableArea({
  storageKey,
  defaultHeight = 500,
  minHeight = 240,
  children,
}) {
  const { height, onPointerDown, reset } = useResizableHeight(storageKey, defaultHeight, minHeight);
  return (
    <>
      <div style={{ height: `${height}px` }} className="flex min-h-0 flex-col">
        {children}
      </div>
      <ResizeHandle onPointerDown={onPointerDown} onDoubleClick={reset} />
    </>
  );
}
