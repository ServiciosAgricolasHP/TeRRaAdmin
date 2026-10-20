import { useCycleDetail } from "./CycleDetailContext";

// Pestañas de las labores del ciclo, con el candado QR de cada una, y el
// botón para agregar una labor.
export function LaborTabs() {
  "use no memo";
  const {
    activeLabor,
    cycle,
    openCreateLabor,
    qrLockedLabors,
    readOnly,
    setActiveLaborId,
  } = useCycleDetail();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-[var(--color-border)]">
      {cycle.labors.map((l) => {
        const isActive = l.id === activeLabor?.id;
        const isCo = l.type === "cosecha";
        const isTr = l.type === "trato";
        const isOvertimeDay = l.type === "tratoHE";
        const tagClass = isCo
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          : isTr
            ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
            : isOvertimeDay
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-[var(--color-surface-2)] text-[var(--color-muted)]";
        const tagIcon = isCo ? "🌾" : isTr ? "🛠" : isOvertimeDay ? "⏱" : l.type === "main" ? "al día" : l.type;
        return (
          <button
            key={l.id}
            onClick={() => setActiveLaborId(l.id)}
            className={`relative px-4 py-1.5 text-sm transition-colors ${
              isActive ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {l.name}
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${tagClass}`}>{tagIcon}</span>
            {qrLockedLabors.has(l.id) && (
              <span
                title={`Cosecha sincronizada desde los pesajes QR del prefijo ${qrLockedLabors.get(l.id).id}`}
                className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
              >
                📱 {qrLockedLabors.get(l.id).id}
              </span>
            )}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
          </button>
        );
      })}
      <button
        onClick={openCreateLabor}
        disabled={readOnly}
        className="ml-2 rounded-md border border-dashed border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
      >
        + Labor
      </button>
    </div>
  );
}
