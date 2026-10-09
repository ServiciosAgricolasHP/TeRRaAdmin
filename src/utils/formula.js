// Interpreta lo que se escribe en una celda. Acepta:
//   - Números ("1500", "1.500", "1,5")
//   - Fórmulas que empiezan con "=" y usan solo dígitos y + - * / ( ) .
// Devuelve un número finito, o 0 si no se puede interpretar.
export function parseAmount(input) {
  if (input == null) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const s = String(input).trim();
  if (!s) return 0;

  if (s.startsWith("=")) {
    const expr = s.slice(1).trim();
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return 0;
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${expr});`)();
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  // Formato chileno "1.500,25" o plano "1500.25".
  const cleaned = s.replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(cleaned.replace(",", ".")) || 0;
}
