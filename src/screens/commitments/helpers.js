// Ayudas que comparten las piezas de Cheques y pagos: el formato de fecha y los
// colores de los chips.

// "2026-10-21" → "21-10-2026".
export const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

export const TONE_CLS = {
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  success: "bg-[var(--color-surface-2)] text-[var(--color-success)]",
  muted: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
};
