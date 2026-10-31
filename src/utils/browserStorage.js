// Lectura y escritura de localStorage que nunca lanzan: en una ventana
// privada, con los datos del sitio bloqueados o con el espacio lleno, el
// navegador lanza al acceder, y la pantalla tiene que seguir funcionando con el
// valor por defecto.

export function readStored(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

// `null` o `undefined` borran la clave.
export function writeStored(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // El valor queda solo en memoria hasta que se recargue la página.
  }
}

export function readStoredJson(key, fallback = null) {
  const raw = readStored(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  writeStored(key, value === undefined ? undefined : JSON.stringify(value));
}
