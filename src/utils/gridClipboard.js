// Copiar y pegar en la grilla del ciclo: el texto que sale de las celdas que
// se copian y las celdas donde cae lo que se pega.

// Las líneas de lo que se pega, de la primera columna: de un copiado de
// varias columnas de Excel (separadas por tabs) se usa solo la primera. Sin
// las líneas vacías del final, que Excel agrega al copiar.
export function clipboardColumn(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r/g, "").split("\n").map((l) => l.split("\t")[0]);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

// Un valor pegado, listo para parseAmount: sin el signo $ ni espacios, como
// llega una celda con formato de moneda copiada de Excel ("$ 25.000").
export function pastedAmount(value) {
  return String(value ?? "").replace(/[$\s]/g, "");
}

// El texto de una celda al copiarla. Un número va sin separador de miles y
// con coma decimal, como lo leen Excel en Chile y parseAmount; un cero va
// vacío, como se ve en la grilla.
export function copiedValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return "";
    return String(value).replace(".", ",");
  }
  return String(value).replace(/[\t\r\n]+/g, " ");
}

// Dónde cae lo que se pega. `rows` son las filas de la grilla, de arriba
// abajo, cada una { id, header, skip }:
//   - con `fill` (varias celdas elegidas) y un solo valor copiado, el valor va
//     en todas las filas;
//   - si no, cada línea baja a la fila siguiente desde la primera.
// Un encabezado de grupo no recibe ni consume una línea. Una fila `skip`
// (sueldo mensual) consume su línea sin recibirla, así cada línea cae en la
// persona de su misma posición. Devuelve [{ id, value }].
export function pasteWrites(lines, rows, { fill = false } = {}) {
  if (!lines.length) return [];
  if (fill && lines.length === 1) {
    return rows.filter((r) => !r.header && !r.skip).map((r) => ({ id: r.id, value: lines[0] }));
  }
  const writes = [];
  let next = 0;
  for (const row of rows) {
    if (next >= lines.length) break;
    if (row.header) continue;
    if (!row.skip) writes.push({ id: row.id, value: lines[next] });
    next++;
  }
  return writes;
}
