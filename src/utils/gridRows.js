// La posición del último elemento de la fila en que está `index`, en una
// grilla de `count` elementos y `cols` columnas: ahí se abre lo que va
// debajo de esa fila. -1 si `index` no está en la grilla.
export function rowEndIndex(index, count, cols) {
  if (index < 0 || index >= count) return -1;
  const perRow = Math.max(1, Math.floor(cols) || 1);
  return Math.min(count - 1, Math.floor(index / perRow) * perRow + perRow - 1);
}
