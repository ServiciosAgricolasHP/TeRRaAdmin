import { STATUS_STYLES } from "./styles";

export function StatusPill({ status, payrollNames }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.unpaid;
  const tooltip = payrollNames && payrollNames.length > 0
    ? (status === "paid" ? "Pagado en " : "Incluido en ") + payrollNames.join(", ")
    : (status === "unpaid" ? "Sin nómina asignada" : "");
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-block",
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 600,
        borderRadius: 4,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export function StatusFilterPill({ status, label, active, onToggle }) {
  const s = STATUS_STYLES[status];
  return (
    <button
      onClick={onToggle}
      className={`rounded-full border px-2 py-0.5 transition-opacity ${
        active ? "" : "opacity-40 line-through"
      }`}
      style={{ background: s.bg, color: s.color, borderColor: s.color }}
      title={active ? `Ocultar filas: ${label}` : `Mostrar filas: ${label}`}
    >
      {label}
    </button>
  );
}
