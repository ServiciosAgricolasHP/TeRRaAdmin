// El encabezado de Nómina: el título con el formato del archivo del banco, la
// configuración, recargar los datos y las pestañas.
export function PayrollHeader({ bankFormatLabel, onOpenSettings, onRefresh, refreshing, loading, tab, setTab, payrollCount }) {
  "use no memo";
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nómina</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Generar nóminas a partir de ciclos activos · archivo del banco: {bankFormatLabel}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onOpenSettings}
          title="Configuración de nómina: formato del archivo del banco"
          className="flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]"
        >
          <span>⚙</span>
          <span className="hidden sm:inline">Configuración</span>
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing || loading}
          title="Forzar recarga desde el servidor (ignora la caché local). Útil si otro usuario acaba de agregar trabajadores, labores o jornadas."
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface-3)] disabled:opacity-50"
        >
          <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>
          <span className="hidden sm:inline">{refreshing ? "Recargando…" : "Recargar datos"}</span>
        </button>
        <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm">
          <button
            onClick={() => setTab("create")}
            className={`rounded px-3 py-1 ${
              tab === "create" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
            }`}
          >
            Generar
          </button>
          <button
            onClick={() => setTab("history")}
            className={`rounded px-3 py-1 ${
              tab === "history" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
            }`}
          >
            Historial Nómina ({payrollCount})
          </button>
          <button
            onClick={() => setTab("workers")}
            className={`rounded px-3 py-1 ${
              tab === "workers" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
            }`}
          >
            💰 Pagos anteriores
          </button>
        </div>
      </div>
    </div>
  );
}
