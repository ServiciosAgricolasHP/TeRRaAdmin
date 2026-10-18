import { newStageId } from "../../utils/tratoEtapas";

// Editor de etapas de una labor "A trato por etapas": el nombre de cada etapa
// y si cuenta para el conteo de unidades. Pueden contar varias (ej.
// Instalación y Completo). El precio de cada etapa se configura por día.
export function StagesEditor({ stages, onChange }) {
  const update = (idx, patch) =>
    onChange(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const add = () =>
    onChange([...stages, { id: newStageId(), name: "", counts: false }]);
  const remove = (idx) => onChange(stages.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Etapas</span>
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          + Agregar etapa
        </button>
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        Cada etapa: nombre y si cuenta para el conteo de unidades (✓). El precio
        se configura por día abajo, igual que en trato. Marca las que cuentan
        (ej. Instalación, Completo); las que no cuentan pagan pero no suman unidades.
      </p>
      {stages.length === 0 && (
        <p className="text-xs text-[var(--color-danger)]">Agrega al menos una etapa.</p>
      )}
      {stages.map((st, idx) => (
        <div key={st.id || idx} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <input
            value={st.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            placeholder="Nombre (ej. Preparación)"
            className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <label className="flex shrink-0 items-center gap-1 text-xs" title="¿Cuenta para el conteo de unidades?">
            <input
              type="checkbox"
              checked={!!st.counts}
              onChange={(e) => update(idx, { counts: e.target.checked })}
            />
            cuenta
          </label>
          <button
            type="button"
            onClick={() => remove(idx)}
            title="Quitar etapa"
            className="shrink-0 text-[var(--color-danger)]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
