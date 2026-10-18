import { PAYMENT_STATUSES } from "./docs";

// Select inline en cada fila para cambiar el estado de pago de una factura,
// con el estilo del chip del estado actual.
// Las <option> llevan colores explícitos del tema (surface + text): el
// dropdown nativo hereda el fondo del select, y en dark mode los chips de
// color soft (amarillo, rojo claro) dejan ilegibles los items.
export function PaymentStatusSelect({ value, onChange }) {
  const meta = PAYMENT_STATUSES[value] || PAYMENT_STATUSES.unpaid;
  const optionStyle = {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
  };
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium outline-none border-0 cursor-pointer ${meta.chip}`}
    >
      {Object.entries(PAYMENT_STATUSES).map(([key, m]) => (
        <option key={key} value={key} style={optionStyle}>{m.label}</option>
      ))}
    </select>
  );
}
