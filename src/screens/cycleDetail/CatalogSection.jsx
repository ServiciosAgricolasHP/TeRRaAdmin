import { useState } from "react";

export function CatalogSection({ title, subtitle, field, entries, onAddEntry, onRenameEntry }) {
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState(null);

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">{title}</h3>
      <p className="mb-3 text-xs leading-snug text-[var(--color-muted)]">{subtitle}</p>
      <div className="space-y-1.5 max-h-80 overflow-auto pr-1">
        {entries.map((e) => (
          <div key={e.value} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-sm">
            <span className="text-[10px] text-[var(--color-muted)] w-7 tabular-nums">#{e.value}</span>
            {editing?.value === e.value ? (
              <>
                <input
                  value={editing.label}
                  onChange={(ev) => setEditing({ ...editing, label: ev.target.value })}
                  className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-sm outline-none focus:border-[var(--color-accent)]"
                  autoFocus
                />
                <button
                  onClick={async () => {
                    if (editing.label.trim()) await onRenameEntry(field, editing.value, editing.label);
                    setEditing(null);
                  }}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  ✓
                </button>
                <button onClick={() => setEditing(null)} className="text-xs text-[var(--color-muted)]">✕</button>
              </>
            ) : (
              <>
                <span className="flex-1">{e.label}</span>
                <button
                  onClick={() => setEditing({ value: e.value, label: e.label })}
                  className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                >
                  editar
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-1.5">
        <input
          value={adding} onChange={(e) => setAdding(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && adding.trim()) {
              e.preventDefault();
              await onAddEntry(field, adding);
              setAdding("");
            }
          }}
          placeholder="Agregar..."
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={async () => {
            if (!adding.trim()) return;
            await onAddEntry(field, adding);
            setAdding("");
          }}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          + Agregar
        </button>
      </div>
    </div>
  );
}
