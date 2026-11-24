import AmountInput from "./AmountInput";

const INPUT_CLASS = "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

// Un campo con su etiqueta. Con `type="number"` es un `AmountInput`: un monto
// en pesos, que se escribe o se pega con o sin puntos.
export default function TextField({ label, value, onChange, type = "text", required = false, placeholder, autoFocus = false }) {
  const isNumber = type === "number";
  // En campos numéricos, 0, null y undefined se muestran vacíos: se ve el
  // placeholder y no hay que borrar un "0" antes de escribir.
  const display = isNumber
    ? (value === 0 || value === "0" || value == null ? "" : value)
    : (value ?? "");
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-[var(--color-muted)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-danger)]">*</span>}
      </span>
      {isNumber ? (
        <AmountInput value={display} onChange={onChange} required={required} placeholder={placeholder} autoFocus={autoFocus} className={INPUT_CLASS} />
      ) : (
        <input
          type={type}
          value={display}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={INPUT_CLASS}
        />
      )}
    </label>
  );
}
