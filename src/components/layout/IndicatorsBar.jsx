import { fmtIndicator, INDICATOR_DEFS } from "./indicators";

// Los 3 chips de indicadores (sin contenedor). Se reusa en el centro del
// header (desktop) y en la barra tipo ticker de mobile.
export function IndicatorChips({ indicators }) {
  return INDICATOR_DEFS.map((ind) => (
    <div
      key={ind.key}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs"
    >
      <span>{ind.icon}</span>
      <span className="text-[var(--color-muted)]">{ind.label}</span>
      <span className="font-semibold tabular-nums text-[var(--color-text)]">
        {fmtIndicator(indicators?.[ind.key])}
      </span>
    </div>
  ));
}

export function EditIndicatorsButton({ onEdit }) {
  return (
    <button
      onClick={onEdit}
      title="Editar indicadores"
      className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
    >
      ✎
    </button>
  );
}

// Barra de indicadores bajo el header, solo debajo de `lg`, donde no caben en
// el centro del header. Cerrada es una tira con una flecha; abierta muestra
// los chips con scroll horizontal y la flecha para cerrarla al final.
export default function IndicatorsBar({ indicators, onEdit, open, onToggle }) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Mostrar indicadores"
        className="flex w-full shrink-0 items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-2)] py-0.5 leading-none text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] lg:hidden"
      >
        <span className="text-[10px]">▾</span>
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 sm:px-4 lg:hidden">
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        <IndicatorChips indicators={indicators} />
      </div>
      <EditIndicatorsButton onEdit={onEdit} />
      <button
        type="button"
        onClick={onToggle}
        title="Ocultar indicadores"
        className="shrink-0 rounded-md px-1.5 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
      >
        ▴
      </button>
    </div>
  );
}
