// Lo que queda de un número escrito o pegado en un campo (`AmountInput`,
// components/). Los pesos van sin decimales; las cantidades con decimales
// (kilos, horas, porcentajes) se escriben como en Chile.

// Un monto en pesos: solo los dígitos. El punto, la coma, el $ y los espacios
// se quitan ("$150.000" y "150,000" → "150000"). Un texto que termina en una
// coma o un punto con uno o dos dígitos trae centavos ("150.000,00", copiado
// de una planilla o del banco): se redondean, y no se pegan a los pesos.
export function wholeAmountText(text) {
  const s = String(text ?? "");
  const cents = /^(.*\d.*)[.,](\d{1,2})\D*$/.exec(s);
  if (cents) return String(Math.round(Number(`${cents[1].replace(/\D/g, "")}.${cents[2]}`)));
  return s.replace(/\D/g, "");
}

// Una cantidad con decimales: los dígitos, el punto y la coma, sin el $, los
// espacios ni las letras. Se lee con `parseAmount` (utils/formula.js), como en
// Chile: el punto separa los miles y la coma los decimales ("1.500" → 1500,
// "12,5" → 12,5).
export function decimalText(text) {
  return String(text ?? "").replace(/[^\d.,]/g, "");
}

// Cómo se muestra una cantidad con decimales guardada como número: con coma
// decimal (12.5 → "12,5"), así `parseAmount` no lee "1.255" como mil
// doscientos cincuenta y cinco. Un texto se muestra tal cual.
export function decimalShown(value) {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value).replace(".", ",") : "";
  return String(value);
}
