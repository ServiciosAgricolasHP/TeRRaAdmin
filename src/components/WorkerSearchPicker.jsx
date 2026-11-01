import { useState } from "react";
import { useWorkersList } from "../hooks/useWorkersList";
import { formatRutForDisplay } from "../utils/rutUtils";
import { MIN_WORKER_QUERY, searchWorkerList, workerQueryReady, workerSearchInput } from "../utils/workerSearch";

// Buscador para elegir a un trabajador: busca en la lista ya cargada por
// cualquier palabra del nombre o una parte del RUT, y muestra los resultados
// debajo del campo (no flotando, así un modal no los corta). Enter elige el
// primero. `pickedIds` (Set): los ya elegidos, que se ven pero no se eligen
// otra vez.
export default function WorkerSearchPicker({ onPick, pickedIds, actionLabel = "Elegir", autoFocus = false, take = 30 }) {
  const { workers, loading, error } = useWorkersList();
  const [query, setQuery] = useState("");
  const ready = workerQueryReady(query);
  const results = searchWorkerList(workers, query, take);
  const isPicked = (w) => !!pickedIds?.has(w.id);

  const pick = (w) => {
    if (isPicked(w)) return;
    onPick(w);
    setQuery("");
  };

  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const first = results.find((w) => !isPicked(w));
    if (first) {
      e.preventDefault();
      pick(first);
    }
  };

  const note = (text) => <div className="text-xs text-[var(--color-muted)]">{text}</div>;

  return (
    <div className="space-y-2">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(workerSearchInput(e.target.value))}
        onKeyDown={onKeyDown}
        placeholder="Buscar por nombre, apellido o RUT…"
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      {error ? (
        <div className="text-xs text-[var(--color-danger)]">No se pudo cargar la lista de trabajadores: {error}</div>
      ) : !ready ? (
        note(`Escribe al menos ${MIN_WORKER_QUERY} caracteres: cualquier parte del nombre o del RUT.`)
      ) : loading ? (
        note("Cargando trabajadores…")
      ) : results.length === 0 ? (
        note("Sin resultados.")
      ) : (
        <div className="max-h-64 space-y-1 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
          {results.map((w) => {
            const already = isPicked(w);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => pick(w)}
                disabled={already}
                className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm ${
                  already
                    ? "cursor-not-allowed bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                    : "hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{w.name}</span>
                  <span className="block font-mono text-[10px] text-[var(--color-muted)]">{formatRutForDisplay(w.rut || w.id)}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--color-accent)]">{already ? "✓ ya está" : actionLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
