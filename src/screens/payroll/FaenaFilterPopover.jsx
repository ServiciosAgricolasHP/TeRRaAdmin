import { useRef, useState, useEffect, useLayoutEffect } from "react";

// Margen mínimo entre el popover y el borde de la pantalla.
const VIEWPORT_MARGIN = 8;

// Popover del filtro de faena, con buscador. Se cierra con click afuera o
// Escape, igual que ColorPalette (Faenas.jsx).
export function FaenaFilterPopover({ faenas, faenaFilter, setFaenaFilter, onClose }) {
  const ref = useRef(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Se alinea a la derecha del botón y, si así no cabe en la pantalla, se
  // corre hacia adentro: en el teléfono el botón puede quedar a la izquierda
  // de su fila.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    const rect = el.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.left < VIEWPORT_MARGIN) shift = VIEWPORT_MARGIN - rect.left;
    else if (rect.right > viewportWidth - VIEWPORT_MARGIN) shift = viewportWidth - VIEWPORT_MARGIN - rect.right;
    el.style.transform = shift ? `translateX(${shift}px)` : "";
  }, []);

  const filtered = faenas.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-[min(320px,90vw)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl ring-1 ring-black/5"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Filtrar por faena
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar faena…"
        autoFocus
        className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
      />
      <div className="flex max-h-52 flex-wrap gap-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <span className="text-xs text-[var(--color-muted)]">Sin resultados</span>
        ) : (
          filtered.map((f) => {
            const active = faenaFilter.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFaenaFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(f.id)) next.delete(f.id);
                    else next.add(f.id);
                    return next;
                  });
                }}
                className={`min-h-[28px] rounded-full px-2 py-0.5 text-xs ${
                  active
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                    : "border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {f.name}
              </button>
            );
          })
        )}
      </div>
      {faenaFilter.size > 0 && (
        <button
          type="button"
          onClick={() => setFaenaFilter(new Set())}
          className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-danger)]"
        >
          Limpiar selección ({faenaFilter.size})
        </button>
      )}
    </div>
  );
}
