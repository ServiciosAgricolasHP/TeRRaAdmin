import { useRef, useEffect } from "react";
import { JOB_PALETTE } from "../../services/userPrefsService";

export function ColorPalette({ onPick, onClose, selected }) {
  const ref = useRef(null);
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

  const normalized = (selected || "").toLowerCase();

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-[252px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl ring-1 ring-black/5 backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Color
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
      <div className="grid grid-cols-7 gap-1.5">
        {JOB_PALETTE.map((c) => {
          const isSelected =
            (c.value === null && !selected) ||
            (c.value && c.value.toLowerCase() === normalized);
          const noColor = c.value === null;
          return (
            <button
              key={c.label}
              onClick={() => onPick(c.value)}
              title={c.label}
              className={`relative h-7 w-7 rounded-md transition-transform hover:scale-110 hover:z-10 ${
                isSelected
                  ? "ring-2 ring-offset-2 ring-offset-[var(--color-surface)] ring-[var(--color-accent)]"
                  : "ring-1 ring-inset ring-black/10"
              }`}
              style={{
                backgroundColor: c.value || "var(--color-surface-2)",
                backgroundImage: noColor
                  ? "linear-gradient(135deg, transparent 46%, var(--color-danger) 46%, var(--color-danger) 54%, transparent 54%)"
                  : undefined,
                boxShadow: c.value && isSelected ? `0 4px 14px ${c.value}55` : undefined,
              }}
            >
              {isSelected && c.value && (
                <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[12px] font-bold leading-none text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
        <label className="text-[11px] text-[var(--color-muted)]">Personalizado</label>
        <input
          type="color"
          value={selected || "#000000"}
          onChange={(e) => onPick(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-[var(--color-border)] bg-transparent p-0"
          title="Elige un color personalizado"
        />
        <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">
          {selected ? selected.toUpperCase() : "—"}
        </span>
      </div>
    </div>
  );
}
