import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// ============================================================
// Popover: Mostrar / ocultar columnas (modo cobrar)
// ============================================================
// Columnas que se pueden ocultar en todas las tablas del resumen; se guardan
// en `cobrar.hiddenColumns`. Las claves son las que consultan LaborTable y
// TransportTable con `hiddenColumns.has(key)`. Algunas aplican solo a ciertos
// tipos (he y bonos a tratoHE; piso, cuando hay piso registrado).
const COLUMN_OPTIONS = [
  { key: "qty", label: "Base $ / Unidad / Vueltas" },
  { key: "he", label: "HE (hrs) — tratoHE" },
  { key: "rate", label: "Total HE / Valor" },
  { key: "valorTotal", label: "Valor total" },
  { key: "piso", label: "Piso" },
  { key: "transport", label: "Transporte" },
  { key: "total", label: "Total" },
  { key: "personas", label: "Personas" },
  { key: "bonos", label: "Bonos — tratoHE" },
];

export function ColumnsMenu({ anchorRef, hidden, onToggle, onReset, onClose }) {
  // Popover con posición fija, calculada desde el rect del botón ancla, y
  // renderizado por portal en <body> para que el overflow del Modal padre no
  // lo recorte.
  const POPOVER_WIDTH = 256; // = w-64
  const MARGIN = 8;
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const recompute = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Alinea el borde derecho del popover con el del botón, dentro de la ventana.
      const left = Math.max(MARGIN, Math.min(window.innerWidth - POPOVER_WIDTH - MARGIN, r.right - POPOVER_WIDTH));
      const top = r.bottom + 4;
      setPos({ top, left });
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [anchorRef]);

  if (!pos) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000]" onClick={onClose} />
      <div
        className="fixed z-[1001] w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          <span>Columnas visibles</span>
          <button
            onClick={onReset}
            className="rounded px-1 py-0.5 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
          >
            Mostrar todas
          </button>
        </div>
        <ul className="space-y-0.5">
          {COLUMN_OPTIONS.map((c) => {
            const isHidden = hidden.has(c.key);
            return (
              <li key={c.key}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]">
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    onChange={() => onToggle(c.key)}
                  />
                  <span className={isHidden ? "text-[var(--color-muted)] line-through" : ""}>{c.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </>,
    document.body,
  );
}
