import { useState } from "react";

// Tarjeta colapsable, cerrada por defecto. Recuerda en localStorage si quedó
// abierta, con una clave por tarjeta.
export function ConsoleCard({ id, title, description, actions, children }) {
  const storageKey = `af.console.${id}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });

  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(storageKey, v ? "0" : "1"); } catch { /* noop */ }
      return !v;
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-baseline gap-3 p-4 text-left hover:bg-[var(--color-accent-soft)]"
      >
        <span className="text-xs text-[var(--color-muted)]">{open ? "\u25BE" : "\u25B8"}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{description}</span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div className="border-t border-[var(--color-border)] p-4">
          {actions ? <div className="mb-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
