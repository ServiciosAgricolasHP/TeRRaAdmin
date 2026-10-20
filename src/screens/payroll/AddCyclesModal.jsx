import { useState, useMemo } from "react";
import Modal from "../../components/Modal";

// Selector para agregar ciclos o labores a una nómina pendiente. Agrupa por
// faena y muestra solo ciclos abiertos. Al marcar un ciclo se eligen sus
// labores, igual que al generar. Un ciclo que ya está en la nómina con algunas
// labores aparece con las que le faltan; uno que está entero no aparece.
//
// Se monta solo mientras está abierto, así cada apertura arranca con el estado
// limpio.
export function AddCyclesModal({ onClose, cycles, faenas, subfaenas, payrollCycleDetails = [], payrollCycleIds = [], onConfirm, busy }) {
  // cycleId → labores elegidas. Un ciclo marcado puede quedar sin labores, y
  // ese no se agrega.
  const [selected, setSelected] = useState(() => new Map());
  const [query, setQuery] = useState("");

  const subfaenaNameById = useMemo(() => {
    const m = new Map();
    for (const s of subfaenas) m.set(s.id, s.name);
    return m;
  }, [subfaenas]);
  const subfaenaName = (id) => subfaenaNameById.get(id) || "";

  // Por ciclo abierto, las labores que todavía se le pueden sumar a la nómina.
  const groups = useMemo(() => {
    const detalles = new Map(payrollCycleDetails.map((cd) => [cd.id, cd]));
    // Un ciclo en `cycleIds` sin detalle en `cycleDetails` está entero.
    const enteros = new Set(payrollCycleIds.filter((id) => !detalles.has(id)));
    const byFaena = new Map();
    for (const f of faenas) byFaena.set(f.id, { faena: f, entries: [] });
    for (const c of cycles) {
      if (c.status === "closed" || enteros.has(c.id)) continue;
      const enNomina = detalles.get(c.id);
      if (enNomina && !Array.isArray(enNomina.laborIds)) continue;
      const yaTiene = new Set(enNomina?.laborIds || []);
      const labors = (c.labors || []).filter((l) => !yaTiene.has(l.id));
      if (labors.length === 0) continue;
      byFaena.get(c.faenaId)?.entries.push({ cycle: c, labors, partial: !!enNomina });
    }
    return [...byFaena.values()].filter((g) => g.entries.length > 0);
  }, [cycles, faenas, payrollCycleDetails, payrollCycleIds]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter(({ cycle: c }) =>
          (c.label || "").toLowerCase().includes(q) ||
          (g.faena.name || "").toLowerCase().includes(q) ||
          (subfaenaNameById.get(c.subfaenaId) || "").toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [groups, query, subfaenaNameById]);

  const toggleCycle = (entry) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(entry.cycle.id)) next.delete(entry.cycle.id);
    else next.set(entry.cycle.id, new Set(entry.labors.map((l) => l.id)));
    return next;
  });
  const toggleLabor = (cycleId, laborId) => setSelected((prev) => {
    const next = new Map(prev);
    const set = new Set(next.get(cycleId) || []);
    if (set.has(laborId)) set.delete(laborId);
    else set.add(laborId);
    next.set(cycleId, set);
    return next;
  });
  const seleccion = [...selected.entries()]
    .filter(([, set]) => set.size > 0)
    .map(([cycleId, set]) => ({ cycleId, laborIds: [...set] }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar ciclos o labores a la nómina"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(seleccion)}
            disabled={seleccion.length === 0 || busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Agregando..." : `Agregar (${seleccion.length})`}
          </button>
        </>
      }
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Buscar faena, subfaena o ciclo..."
        className="mb-3 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      {filteredGroups.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">
          No hay ciclos abiertos ni labores para agregar (los cerrados no se muestran acá; lo demás ya está en esta nómina).
        </div>
      ) : (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {filteredGroups.map((g) => (
            <div key={g.faena.id}>
              <div className="mb-1 text-xs font-semibold text-[var(--color-muted)]">{g.faena.name}</div>
              <div className="space-y-1">
                {g.entries.map((entry) => {
                  const { cycle: c, labors, partial } = entry;
                  const elegidas = selected.get(c.id);
                  const marcado = !!elegidas;
                  return (
                    <div
                      key={c.id}
                      className={`overflow-hidden rounded-md border border-[var(--color-border)] ${
                        marcado ? "bg-[var(--color-accent-soft)]/40" : "bg-[var(--color-surface-2)]"
                      }`}
                    >
                      <label className="flex min-h-[36px] cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggleCycle(entry)}
                          className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            <span className="font-medium">{c.label || c.id}</span>
                            {c.subfaenaId && (
                              <span className="ml-2 text-xs text-[var(--color-muted)]">{subfaenaName(c.subfaenaId)}</span>
                            )}
                          </span>
                          {partial && (
                            <span className="block text-[11px] text-[var(--color-muted)]">
                              Ya está en la nómina; {labors.length === 1 ? `falta ${labors[0].name}` : `faltan ${labors.length} labores`}
                            </span>
                          )}
                          {marcado && elegidas.size === 0 && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                              ⚠ Sin labores seleccionadas: no se agrega
                            </span>
                          )}
                        </span>
                      </label>
                      {marcado && labors.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] px-2.5 py-2">
                          {labors.map((l) => {
                            const on = elegidas.has(l.id);
                            return (
                              <button
                                type="button"
                                key={l.id}
                                onClick={() => toggleLabor(c.id, l.id)}
                                className={`min-h-[32px] rounded-full border px-2.5 py-1 text-[11px] ${
                                  on
                                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                                    : "border-dashed border-[var(--color-border)] bg-transparent text-[var(--color-muted)] opacity-60"
                                }`}
                                title={on ? "Dejar esta labor afuera" : "Incluir esta labor"}
                              >
                                {on ? "✓" : "○"} {l.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
