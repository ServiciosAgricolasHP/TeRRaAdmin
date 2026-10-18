import { useState } from "react";
import { laborTypeLabel } from "../../../utils/laborTypes";
import { fmtCurrency } from "../../../utils/format";

// Paso 2: las labores con días de los ciclos elegidos, de cualquier tipo. Cada
// una que se marque entra al resumen como labor propia, con su tabla, y suma
// al total. Las ya importadas quedan deshabilitadas.
export function ImportLaborsModal({ candidates, onClose, onConfirm }) {
  const [picked, setPicked] = useState(
    () => new Set(candidates.filter((c) => !c.already).map((c) => c.key)),
  );
  const toggle = (key) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const chosen = candidates.filter((c) => !c.already && picked.has(c.key));
  const byCycle = new Map();
  for (const c of candidates) {
    if (!byCycle.has(c.cycleId)) byCycle.set(c.cycleId, { label: c.cycleLabel, items: [] });
    byCycle.get(c.cycleId).items.push(c);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-baseline justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">📥 Elegir labores a importar</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Cada labor entra al resumen con su propia tabla, sea del tipo que sea, y suma al total a facturar.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">✕</button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
          {[...byCycle.entries()].map(([cycleId, group]) => (
            <div key={cycleId}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{group.label}</div>
              <ul className="space-y-1">
                {group.items.map((c) => {
                  const total = c.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                  const on = !c.already && picked.has(c.key);
                  return (
                    <li key={c.key}>
                      <label
                        className={`flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                          c.already
                            ? "cursor-not-allowed border-[var(--color-border)] bg-[var(--color-surface-2)] opacity-60"
                            : on
                              ? "cursor-pointer border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                              : "cursor-pointer border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                        }`}
                      >
                        <input type="checkbox" checked={on} disabled={c.already} onChange={() => toggle(c.key)} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{c.labor.name}</div>
                          <div className="text-[10px] text-[var(--color-muted)]">
                            {laborTypeLabel(c.labor.type) || c.labor.type} · {c.rows.length} día{c.rows.length === 1 ? "" : "s"} · {fmtCurrency(total)}
                            {c.already && " · ya importada"}
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(chosen.map((c) => c.key))}
            disabled={chosen.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:opacity-90 disabled:opacity-50"
          >
            Importar {chosen.length} labor{chosen.length === 1 ? "" : "es"}
          </button>
        </footer>
      </div>
    </div>
  );
}
