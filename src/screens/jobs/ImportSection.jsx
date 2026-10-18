// Sección del modal de creación de ciclo que ofrece importar desde otro
// ciclo abierto de la misma subfaena. Se muestra solo si hay al menos un
// candidato. Permite elegir qué labores clonar y si copiar días y precios o
// mover las jornadas existentes al nuevo ciclo.
export function ImportSection({ data, onChange }) {
  const candidates = data.importCandidates || [];
  const source = candidates.find((c) => c.id === data.importSourceId) || null;
  const sourceLabors = source?.labors || [];
  const sourceDays = source?.days || [];
  const selectedIds = data.importLaborIds || new Set();
  const selectedDays = data.importDays || new Set();

  const toggleLabor = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ importLaborIds: next });
  };
  const allLaborsOn = sourceLabors.every((l) => selectedIds.has(l.id));
  const toggleAllLabors = () => {
    onChange({ importLaborIds: new Set(allLaborsOn ? [] : sourceLabors.map((l) => l.id)) });
  };
  const toggleDay = (d) => {
    const next = new Set(selectedDays);
    if (next.has(d)) next.delete(d); else next.add(d);
    onChange({ importDays: next });
  };
  const allDaysOn = sourceDays.length > 0 && sourceDays.every((d) => selectedDays.has(d));
  const toggleAllDays = () => {
    onChange({ importDays: new Set(allDaysOn ? [] : sourceDays) });
  };
  const onPickSource = (id) => {
    const c = candidates.find((x) => x.id === id);
    onChange({
      importSourceId: id,
      importLaborIds: new Set((c?.labors || []).map((l) => l.id)),
      importDays: new Set((c?.days || [])),
    });
  };

  return (
    <div className="rounded-md border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)]/30 p-3 text-sm space-y-2">
      <label className="flex items-start gap-2 font-medium">
        <input
          type="checkbox"
          checked={!!data.importEnabled}
          onChange={(e) => onChange({ importEnabled: e.target.checked })}
          className="mt-0.5"
        />
        <span>Importar desde un ciclo abierto del mismo ámbito</span>
      </label>
      {data.importEnabled && (
        <div className="space-y-3 pl-6">
          {candidates.length > 1 && (
            <label className="block text-xs">
              <span className="text-[var(--color-muted)]">Ciclo origen</span>
              <select
                value={data.importSourceId || ""}
                onChange={(e) => onPickSource(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · abierto
                  </option>
                ))}
              </select>
            </label>
          )}
          {sourceLabors.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">Labores a clonar</span>
                <button
                  type="button"
                  onClick={toggleAllLabors}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  {allLaborsOn ? "Ninguna" : "Todas"}
                </button>
              </div>
              <div className="max-h-40 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
                {sourceLabors.map((l) => {
                  const workers = (l.workers || []).length;
                  return (
                    <label
                      key={l.id}
                      className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5 text-xs last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(l.id)}
                        onChange={() => toggleLabor(l.id)}
                      />
                      <span className="flex-1">
                        <b>{l.name}</b>{" "}
                        <span className="text-[var(--color-muted)]">· {l.type}</span>
                      </span>
                      <span className="text-[var(--color-muted)]">
                        {workers} trab.
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {sourceDays.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">Días a importar</span>
                <button
                  type="button"
                  onClick={toggleAllDays}
                  className="text-[var(--color-accent)] hover:underline"
                >
                  {allDaysOn ? "Ninguno" : "Todos"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
                {sourceDays.map((d) => {
                  const on = selectedDays.has(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] tabular-nums transition-opacity ${
                        on
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                          : "border-dashed border-[var(--color-border)] bg-transparent text-[var(--color-muted)] opacity-60"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                La lista de días del nuevo ciclo será solo las fechas marcadas.
                Mover jornadas y copiar precios queda restringido a estas fechas.
              </p>
            </div>
          )}
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!data.importCopyDayPrices}
              onChange={(e) => onChange({ importCopyDayPrices: e.target.checked })}
              className="mt-0.5"
            />
            <span>Copiar precios por día (combos, precios múltiples y piso) de las labores y días marcados</span>
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!data.importMoveWorkdays}
              onChange={(e) => onChange({ importMoveWorkdays: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <b>Mover</b> las jornadas de las labores seleccionadas al nuevo ciclo.{" "}
              <span className="text-[var(--color-danger)]">
                ⚠ Desaparecen del ciclo origen.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
