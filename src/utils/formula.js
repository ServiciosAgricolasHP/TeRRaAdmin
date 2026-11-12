// Interpreta lo que se escribe en una celda. Acepta:
//   - Números ("1500", "1.500", "1,5"), con o sin el signo $ ("$25.000").
//   - Fórmulas que empiezan con "=" y usan solo dígitos y + - * / ( ) .
// Devuelve un número finito, 0 si viene vacío, o null si trae algo que no se
// puede interpretar: una celda no tiene que leer un texto mal escrito como un
// 0, que borra la jornada.
export function readAmount(input) {
  if (input == null) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input).trim();
  if (!s) return 0;

  if (s.startsWith("=")) {
    const expr = s.slice(1).trim();
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
    try {
      const value = Function(`"use strict"; return (${expr});`)();
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  // Formato chileno "1.500,25" o plano "1500.25".
  const cleaned = s.replace(/[$\s]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }
  if (!/^-?(\d+([.,]\d*)?|[.,]\d+)$/.test(cleaned)) return null;
  return Number(cleaned.replace(",", "."));
}

// Como `readAmount`, con 0 para lo que no se puede interpretar.
export function parseAmount(input) {
  return readAmount(input) ?? 0;
}

// El `valueParser` de una celda numérica de ag-grid: lo que no se puede
// interpretar deja el valor que tenía.
export const cellAmountParser = (p) => readAmount(p.newValue) ?? p.oldValue;
