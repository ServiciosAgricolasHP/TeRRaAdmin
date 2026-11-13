import { useState } from "react";
import { advancesService } from "../../services/advancesService";
import WorkerAdvancesModal from "../../components/WorkerAdvancesModal";
import LogsTable from "./LogsTable";
import RecordSummary from "./RecordSummary";
import { useRecordSearch } from "./useRecordSearch";
import { attempt } from "../../utils/attempt";
import { entityLabelEs, labelKey } from "../../utils/auditLabels";
import { MAX_CUSTOM_DAYS, RECORD_RANGES, filterRecordLogs } from "../../utils/auditRecord";
import { fmtNumber } from "../../utils/format";
import { ActionPill } from "./LogsTable";

// Lo que ya dice el registro elegido y no se repite en el nombre de sus jornadas.
const omitOf = (entityType, id) =>
  entityType === "cycle" ? { cycleId: id } : entityType === "worker" ? { workerKey: id } : undefined;

const RANGE_EMPTY = { today: "hoy", "7d": "en los últimos 7 días", "30d": "en los últimos 30 días" };
const dayText = (iso) => String(iso || "").split("-").reverse().join("-");

// Buscador por registro: se elige un tipo (Trabajador, Ciclo, Faena…), se
// carga su lista con un botón (solo lo abierto, salvo con "Ver también
// cerrados"), se busca el registro por nombre o rut y se trae su historial
// del rango elegido: hoy, 7 días, 30 días o uno personalizado de hasta
// `MAX_CUSTOM_DAYS` días (`fetchRecordLogs`). Nada se lee hasta pedir la lista.
// El resumen de arriba filtra la tabla por tipo de registro y acción.
export default function EntitySearchPanel() {
  const [advancesFor, setAdvancesFor] = useState(null);
  const [advanceItems, setAdvanceItems] = useState([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const {
    canFilterOpen,
    applyCustom,
    changeRange,
    clearSelection,
    closedCount,
    confirmLoad,
    custom,
    customError,
    entityType,
    history,
    historyError,
    loadedRecords,
    loadingLogs,
    loadingRecords,
    loadRecords,
    logFilter,
    matches,
    meta,
    pendingCount,
    pickRecord,
    query,
    range,
    recordsError,
    selected,
    setCustom,
    setEntityType,
    setLogFilter,
    setQuery,
    setShowClosed,
    showClosed,
    types,
  } = useRecordSearch();
  const recordLogs = history?.logs || null;
  const shownLogs = recordLogs ? filterRecordLogs(recordLogs, logFilter) : null;
  // El nombre del registro elegido, y el de los ciclos y subfaenas que abarca,
  // ya se saben: sus filas no los buscan.
  const selectedKey = selected ? labelKey(entityType, selected.id) : null;
  const knownLabels = selectedKey ? { ...selected.scopeLabels, [selectedKey]: selected.label } : null;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs text-[var(--color-muted)]">
        El historial de un registro (trabajador, ciclo, faena, nómina, usuario…), de hoy o del rango que elijas. Al buscar
        un trabajador se suman sus jornadas y anticipos; un ciclo, sus jornadas y las sincronizaciones de Pesajes QR; una
        faena o subfaena, lo mismo de todos sus ciclos; un transportista, sus vueltas y sus resúmenes de pago; una nómina,
        su JSON; y un usuario, todo lo que hizo en la app.
      </p>

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Tipo de registro</span>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="min-h-[32px] w-48 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
            >
              <option value="" disabled>Elige un tipo…</option>
              {types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          {meta && !loadedRecords ? (
            <button
              type="button"
              onClick={loadRecords}
              disabled={loadingRecords}
              className="min-h-[32px] rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {loadingRecords ? "Cargando…" : `▶ Cargar ${meta.labelEs.toLowerCase()}`}
            </button>
          ) : null}
          {loadedRecords ? (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--color-muted)]">Buscar</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="nombre, rut…"
                className="min-h-[32px] w-56 max-w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}
          {loadedRecords && canFilterOpen ? (
            <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-xs text-[var(--color-muted)]">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              Ver también cerrados{closedCount > 0 && !showClosed ? ` (${closedCount})` : ""}
            </label>
          ) : null}
        </div>
        {recordsError ? <p className="text-xs text-[var(--color-danger)]">{recordsError}</p> : null}

        {loadedRecords && !selected && (
          <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--color-border)]">
            {matches.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">Sin resultados.</div>
            ) : (
              matches.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pickRecord(d)}
                  className="block w-full border-t border-[var(--color-border)] px-3 py-1.5 text-left text-sm first:border-t-0 hover:bg-[var(--color-surface-2)]"
                >
                  {meta.labelOf ? meta.labelOf(d) : d.name || d.id}
                  {meta.listDetailOf && (
                    <span className="ml-2 text-xs text-[var(--color-muted)]">{meta.listDetailOf(d)}</span>
                  )}
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
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Rango del historial">
              {RECORD_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => changeRange(r.id)}
                  aria-pressed={range === r.id}
                  className={`min-h-[32px] rounded-md border px-3 text-xs ${
                    range === r.id
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
              {recordLogs && !loadingLogs ? (
                <span className="ml-1 text-xs text-[var(--color-muted)]">
                  {recordLogs.length} {recordLogs.length === 1 ? "acción" : "acciones"}
                </span>
              ) : null}
            </div>
            {range === "custom" && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-muted)]">Desde</span>
                  <input
                    type="date"
                    value={custom.from}
                    onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                    className="min-h-[32px] rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-muted)]">Hasta</span>
                  <input
                    type="date"
                    value={custom.to}
                    onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                    className="min-h-[32px] rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!!customError || loadingLogs}
                  className="min-h-[32px] rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                >
                  ▶ Ver
                </button>
                <span className={`text-xs ${customError ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}>
                  {customError || `Hasta ${MAX_CUSTOM_DAYS} días.`}
                </span>
              </div>
            )}
            {history?.missingIndexes?.length > 0 && (
              <div className="rounded-md border border-[var(--color-warning)] px-3 py-2 text-xs">
                <p>
                  Falta un índice de Firestore para buscar por fecha, así que faltan acciones en este historial. Créalo
                  (tarda unos minutos) y vuelve a buscar.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {history.missingIndexes.map((link, i) => (
                    <li key={link}>
                      <a href={link} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] underline">
                        Crear el índice{history.missingIndexes.length > 1 ? ` ${i + 1}` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {historyError ? <p className="text-xs text-[var(--color-danger)]">No se pudo leer el historial. {historyError}</p> : null}
            {pendingCount != null && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-warning)] px-3 py-2 text-xs">
                <span>
                  Son {fmtNumber(pendingCount)} acciones en este rango: cargarlas cuesta una lectura cada una. Elige un rango
                  más corto o
                </span>
                <button
                  type="button"
                  onClick={confirmLoad}
                  className="min-h-8 rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
                >
                  ▶ Cargar las {fmtNumber(pendingCount)}
                </button>
              </div>
            )}
            {loadingLogs ? (
              <div className="py-6 text-center text-sm text-[var(--color-muted)]">Cargando historial…</div>
            ) : recordLogs && recordLogs.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
                {range === "custom"
                  ? `Sin acciones entre el ${dayText(history.from)} y el ${dayText(history.to)}.`
                  : `Sin acciones ${RANGE_EMPTY[range]}. Prueba con un rango más largo.`}
              </div>
            ) : recordLogs ? (
              <>
                <RecordSummary logs={recordLogs} filter={logFilter} onFilter={setLogFilter} />
                {logFilter.entity && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                    <span>
                      Mostrando {fmtNumber(shownLogs.length)} de {fmtNumber(recordLogs.length)}:{" "}
                      <b className="text-[var(--color-text)]">{entityLabelEs(logFilter.entity)}</b>
                    </span>
                    {logFilter.action && <ActionPill action={logFilter.action} />}
                    <button
                      type="button"
                      onClick={() => setLogFilter({ entity: null, action: null })}
                      className="min-h-8 rounded-md px-2 underline hover:text-[var(--color-text)]"
                    >
                      ✕ Quitar filtro
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                  <LogsTable logs={shownLogs} knownLabels={knownLabels} omit={omitOf(entityType, selected.id)} grouped />
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
