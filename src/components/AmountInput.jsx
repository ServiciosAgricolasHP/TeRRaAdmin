import { useState } from "react";
import { decimalShown, decimalText, wholeAmountText } from "../utils/numberInput";

// Un campo para un monto en pesos o, con `decimals`, para una cantidad con
// decimales (kilos, horas, porcentajes). Limpia lo que se escribe o se pega
// (`utils/numberInput.js`) y le pasa a `onChange` el texto limpio: en pesos,
// solo los dígitos ("$150.000" → "150000"); con decimales, lo escrito, que se
// lee con `parseAmount`. Mientras se escribe una cantidad con decimales, el
// campo muestra lo escrito ("12,") aunque quien lo usa guarde el número.
// Sin `value`, el campo no es controlado (`defaultValue`) y la limpieza queda
// en el mismo campo. El resto de las props van al `<input>`.
export default function AmountInput({ value, onChange, onBlur, decimals = false, ...rest }) {
  const [draft, setDraft] = useState(null);
  const controlled = value !== undefined;
  const shown = decimals ? (draft ?? decimalShown(value)) : (value ?? "");
  return (
    <input
      {...rest}
      {...(controlled ? { value: shown } : null)}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      onChange={(e) => {
        const text = decimals ? decimalText(e.target.value) : wholeAmountText(e.target.value);
        if (!controlled) e.target.value = text;
        else if (decimals) setDraft(text);
        onChange?.(text);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
