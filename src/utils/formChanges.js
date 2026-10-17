// Si un formulario tiene cambios respecto de cómo se abrió. Compara lo que
// verían los ojos, no los tipos: un campo vacío, `null`, `undefined`, `false`
// o una lista vacía valen lo mismo, `150000` y `"150000"` también, y los
// espacios en los bordes no cuentan (los servicios los recortan al guardar).

const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const isEmpty = (v) =>
  v == null ||
  v === false ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.every(isEmpty)) ||
  (isPlainObject(v) && Object.values(v).every(isEmpty));

export function sameValue(a, b) {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    // Una fila agregada y dejada en blanco no es un dato que se pierda.
    const left = a.filter((x) => !isEmpty(x));
    const right = b.filter((x) => !isEmpty(x));
    return left.length === right.length && left.every((x, i) => sameValue(x, right[i]));
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => sameValue(a[k], b[k]));
  }
  return String(a).trim() === String(b).trim();
}

// `ignore`: claves de primer nivel que no son datos del formulario (estado de
// la pantalla, respaldos internos).
export function hasChanges(before, after, { ignore = [] } = {}) {
  if (!before || !after) return false;
  const skip = new Set(ignore);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (!skip.has(k) && !sameValue(before[k], after[k])) return true;
  }
  return false;
}
