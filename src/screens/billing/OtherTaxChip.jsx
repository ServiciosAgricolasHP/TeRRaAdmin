import { otroImpuestoCategory, OTRO_IMP_CATEGORIES, otroImpuestoLabel } from "../../utils/siiCsvParser";

// Chip pequeño que muestra el "Otro Impuesto" detectado del SII. Si el código
// es de combustible va en rojo y con ⛽, para identificarlo de un vistazo. Sin
// código no renderiza nada.
//
// En las retenciones de cambio de sujeto el chip agrega la **tasa**, porque
// esa es la pregunta real frente a una factura de compra: no "hay retención"
// —eso ya se sabe— sino si fue el 19% completo o una parcial del 14%. El
// `Monto Total` del RCV ya viene con la retención descontada, así que mirando
// la fila no se puede deducir.
export function OtherTaxChip({ code, tasa }) {
  if (!code) return null;
  const cat = otroImpuestoCategory(code);
  const meta = cat ? OTRO_IMP_CATEGORIES[cat] : null;
  const label = otroImpuestoLabel(code) || `Cód. ${code}`;
  const sufijo = cat === "retencion" && tasa > 0 ? ` ${tasa}%` : "";
  const colorCls = !meta || meta.color === "muted"
    ? "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
    : meta.color === "danger"
      ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
      : meta.color === "warning"
        ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
        : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]";
  return (
    <span
      title={`Otro impuesto SII código ${code} — ${label}`}
      className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${colorCls}`}
    >
      <span>{meta?.emoji || "•"}</span>
      <span className="hidden sm:inline">{(meta?.label || label) + sufijo}</span>
    </span>
  );
}
