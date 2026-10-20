
// Formulario de un centro de costo: nombre (se guarda como título) y un
// emoji opcional.
export function CostCenterForm({ busy, editing, save, setEditing }) {
  "use no memo";
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Nombre</label>
        <input
          value={editing.label}
          onChange={(e) => setEditing({ ...editing, label: e.target.value })}
          placeholder="Arriendo, Mantención, etc."
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Emoji (opcional)</label>
        <input
          value={editing.emoji}
          onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
          placeholder="🏠"
          maxLength={4}
          className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => setEditing(null)}
          disabled={busy}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          {busy ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}
