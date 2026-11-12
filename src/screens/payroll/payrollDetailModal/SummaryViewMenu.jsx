import { useState } from "react";

// El menú "👁 Vista" de la tabla del resumen: qué separa (labores, ciclos) y
// si muestra el bruto con los anticipos y bonos aparte. `options` trae
// `{ key, label, hint, checked, onChange }`; el botón dice cuántas están
// marcadas.
export function SummaryViewMenu({ options }) {
  const [open, setOpen] = useState(false);
  const active = options.filter((o) => o.checked).length;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`min-h-8 rounded-md border px-2.5 py-1.5 text-xs ${active > 0 ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
      >
        👁 Vista{active > 0 ? ` (${active})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[88vw] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl">
            {options.map((o) => (
              <label key={o.key} className="flex min-h-8 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]">
                <input type="checkbox" className="mt-0.5" checked={o.checked} onChange={(e) => o.onChange(e.target.checked)} />
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-[11px] text-[var(--color-muted)]">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
