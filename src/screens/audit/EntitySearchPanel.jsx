import { useState } from "react";
import { advancesService } from "../../services/advancesService";
import WorkerAdvancesModal from "../../components/WorkerAdvancesModal";
import LogsTable from "./LogsTable";
import { useRecordSearch } from "./useRecordSearch";
import { attempt } from "../../utils/attempt";

// Buscador por registro: se elige un tipo (Trabajador, Ciclo, Faena…), se
// busca el registro por nombre o rut y se trae todo su historial, sin rango de
// fechas ni tope (`fetchRecordHistory`).
export default function EntitySearchPanel() {
  const [advancesFor, setAdvancesFor] = useState(null);
  const [advanceItems, setAdvanceItems] = useState([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [open, setOpen] = useState(false);
  const {
    clearSelection,
    entityType,
    loadingLogs,
    loadingRecords,
    matches,
    meta,
    pickRecord,
    query,
    recordLogs,
    selected,
    setEntityType,
    setQuery,
    types,
  } = useRecordSearch();

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold">🔍 Buscar por registro</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Ver todo el historial de un registro (trabajador, ciclo, faena, transportista…) — sin límite de fecha.
            Al buscar un trabajador se suman los cambios en sus jornadas; al buscar un transportista, los cambios en sus vueltas y en sus resúmenes de pago.
          </p>
        </div>
        <span className="text-[var(--color-muted)]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--color-muted)]">Tipo de registro</span>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-48 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
              >
                {types.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--color-muted)]">Buscar</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={loadingRecords ? "Cargando…" : "nombre, rut…"}
                className="w-56 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {!selected && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--color-border)]">
              {matches.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">
                  {loadingRecords ? "Cargando…" : "Sin resultados."}
                </div>
              ) : (
                matches.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => pickRecord(d)}
                    className="block w-full border-t border-[var(--color-border)] px-3 py-1.5 text-left text-sm first:border-t-0 hover:bg-[var(--color-surface-2)]"
                  >
                    {meta.labelOf ? meta.labelOf(d) : d.name || d.id}
                  </button>
                ))
              )}
            </div>
          )}

          {advancesFor && (
            <WorkerAdvancesModal
              workerKeys={[advancesFor.id, advancesFor.doc?.rut]}
              name={advancesFor.doc?.name}
              rut={advancesFor.doc?.rut || advancesFor.id}
              items={advanceItems}
              onClose={() => setAdvancesFor(null)}
            />
          )}

          {selected && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
                <span>
                  <b>{selected.label}</b>{" "}
                  <span className="text-xs text-[var(--color-muted)]">({meta.labelEs})</span>
                </span>
                <span className="flex items-center gap-3">
                  {entityType === "worker" && (
                    <button
                      type="button"
                      disabled={loadingAdvances}
                      onClick={async () => {
                        setLoadingAdvances(true);
                        const { error: err } = await attempt(async () => {
                          // Mismos parámetros que la pantalla de Anticipos para
                          // compartir la entrada de caché en vez de releer.
                          const rows = await advancesService.list({
                            order: ["date", "desc"],
                            cache: true,
                            persist: true,
                            ttl: 5 * 60 * 1000,
                          });
                          setAdvanceItems(rows);
                          setAdvancesFor(selected);
                        });
                        if (err) console.error("No se pudieron cargar los anticipos:", err);
                        setLoadingAdvances(false);
                      }}
                      className="text-xs text-[var(--color-muted)] underline hover:text-[var(--color-text)] disabled:opacity-60"
                    >
                      {loadingAdvances ? "cargando…" : "🪙 anticipos y bonos"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-[var(--color-muted)] underline hover:text-[var(--color-text)]"
                  >
                    cambiar
                  </button>
                </span>
              </div>
              {loadingLogs ? (
                <div className="py-6 text-center text-sm text-[var(--color-muted)]">Cargando historial…</div>
              ) : recordLogs && recordLogs.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
                  Sin acciones registradas para este registro.
                </div>
              ) : recordLogs ? (
                <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                  <LogsTable logs={recordLogs} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
