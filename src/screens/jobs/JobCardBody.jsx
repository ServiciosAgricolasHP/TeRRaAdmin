import { ColorPickerButton } from "./ColorPickerButton";

// El contenido de la tarjeta de una faena: la franja de su color, el nombre,
// la ubicación, hace cuánto (`since`: { icon, label, title }, en la vista por
// estado), sus notas, cuántas subfaenas y ciclos tiene, y el color, Editar y
// Eliminar. Lo usan la tarjeta de la grilla y, con la faena abierta, el
// encabezado de su detalle. Va dentro de un contenedor `relative` y `group`.
// `dragHint` muestra el ⠿ de arrastrar; `asTitle`, el nombre como título del
// detalle, más grande y en el color del tema.
export function JobCardBody({ job, cardColor, colorValue, onColorChange, subjobCount, cyclesCount, dragHint, since, onEdit, onDelete, asTitle = false }) {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-lg"
        style={{ backgroundColor: cardColor || "var(--color-border)" }}
      />
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {dragHint && <span className="mt-1 select-none text-[10px] leading-none text-[var(--color-muted)] opacity-30 group-hover:opacity-90 transition-opacity" title="Arrastra para reordenar">⠿</span>}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: cyclesCount > 0 ? "#16a34a" : "var(--color-muted)" }}
                title={cyclesCount > 0 ? "Activa" : "Sin ciclos"}
              />
              {asTitle ? (
                <h2 className="text-2xl font-bold leading-tight text-[var(--color-accent)] [overflow-wrap:anywhere]">{job.name}</h2>
              ) : (
                <span className="truncate text-[15px] font-semibold leading-tight text-[var(--color-text)]">{job.name}</span>
              )}
            </div>
            {job.location && <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">{job.location}</div>}
            {since && (
              <div className="mt-0.5 text-[11px] text-[var(--color-muted)]" title={since.title}>
                {since.icon} {since.label}
              </div>
            )}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <ColorPickerButton value={colorValue} onChange={onColorChange} />
        </div>
      </div>
      {job.notes && <p className="mb-3 line-clamp-2 text-[11px] leading-snug text-[var(--color-muted)]">{job.notes}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">
            {subjobCount != null ? `${subjobCount} sub` : "—"}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={
              cardColor && cyclesCount > 0
                ? { backgroundColor: `${cardColor}22`, color: cardColor }
                : cyclesCount > 0
                  ? { backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }
                  : { backgroundColor: "var(--color-surface-2)", color: "var(--color-muted)" }
            }
          >
            {cyclesCount != null ? `${cyclesCount} ciclos` : "—"}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 gap-1 opacity-70 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="rounded-md px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="rounded-md px-2 py-1 text-[var(--color-muted)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
          >
            Eliminar
          </button>
        </div>
      </div>
    </>
  );
}
