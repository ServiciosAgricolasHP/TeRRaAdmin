import { counterpartiesError } from "../../utils/jobCounterparties";

const input =
  "min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

const EMPTY_ROW = { rut: "", name: "" };

// Las contrapartes de una faena en el formulario: una fila por empresa, con su
// RUT y su razón social, y "+ otra razón social". Con una sola, la razón
// social es opcional; con más, cada una la lleva. Debajo dice qué falta.
export function CounterpartiesField({ rows, onChange }) {
  const list = rows?.length ? rows : [EMPTY_ROW];
  const setRow = (i, patch) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => onChange(list.filter((_, j) => j !== i));
  const error = counterpartiesError(list);
  const several = list.length > 1;

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm text-[var(--color-muted)]">Contraparte (RUT y razón social)</legend>
      {list.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <input
            value={r.rut}
            onChange={(e) => setRow(i, { rut: e.target.value })}
            placeholder="RUT"
            aria-label={`RUT ${i + 1}`}
            className={`${input} sm:w-40 sm:shrink-0`}
          />
          <input
            value={r.name}
            onChange={(e) => setRow(i, { name: e.target.value })}
            placeholder={several ? "Razón social" : "Razón social (opcional)"}
            aria-label={`Razón social ${i + 1}`}
            className={`${input} min-w-0 flex-1`}
          />
          {several && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Quitar esta contraparte"
              className="min-h-9 shrink-0 rounded-md px-2 text-[var(--color-muted)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, EMPTY_ROW])}
        className="min-h-8 rounded-md border border-dashed border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        + otra razón social
      </button>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </fieldset>
  );
}
