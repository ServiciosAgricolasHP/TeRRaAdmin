// El motivo de un error en palabras de la app, para un aviso. Los errores de
// Firebase y del navegador traen su mensaje en inglés: se traducen por su
// código. Un mensaje en español (los que lanza la app) va tal cual. Cualquier
// otro, como el de una librería, pasa a `fallback`, y el original queda en la
// consola.

const FIREBASE = {
  "permission-denied": "No tienes permiso para hacer esto.",
  unavailable: "No hay conexión con la base de datos. Revisa internet y vuelve a intentar.",
  "deadline-exceeded": "La base de datos tardó demasiado en responder. Vuelve a intentar.",
  "resource-exhausted": "Se alcanzó el límite de uso de la base de datos. Intenta más tarde.",
  "not-found": "El registro ya no existe: puede que otra persona lo haya eliminado.",
  "already-exists": "Ya existe un registro con ese identificador.",
  unauthenticated: "La sesión expiró. Vuelve a iniciar sesión.",
  "failed-precondition": "La base de datos no pudo hacer la consulta. Vuelve a intentar en un rato.",
  "network-request-failed": "No hay conexión. Revisa internet y vuelve a intentar.",
  // Authentication.
  "invalid-credential": "El correo o la contraseña no son correctos.",
  "wrong-password": "El correo o la contraseña no son correctos.",
  "user-not-found": "El correo o la contraseña no son correctos.",
  "invalid-email": "El correo no es válido.",
  "missing-password": "Falta la contraseña.",
  "user-disabled": "La cuenta está suspendida.",
  "too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
  "email-already-in-use": "Ya existe una cuenta con ese correo.",
  "email-already-exists": "Ya existe una cuenta con ese correo.",
  "weak-password": "La contraseña es muy corta: usa al menos 6 caracteres.",
  "requires-recent-login": "Por seguridad, vuelve a iniciar sesión y repite el cambio.",
  // Cloud Storage (los adjuntos).
  unauthorized: "No tienes permiso para subir, ver o borrar este archivo.",
  "object-not-found": "El archivo ya no existe: puede que otra persona lo haya borrado.",
  "quota-exceeded": "Se alcanzó el límite de espacio para archivos. Avísale al administrador.",
  "retry-limit-exceeded": "El archivo tardó demasiado en subir. Revisa internet y vuelve a intentar.",
  canceled: "Se canceló la subida.",
};

const BROWSER = {
  NotAllowedError: "El navegador no dio permiso. Vuelve a intentar con la pestaña abierta y al frente.",
  QuotaExceededError: "El navegador se quedó sin espacio para guardar.",
  AbortError: "Se canceló antes de terminar.",
};

// Palabras que delatan un mensaje en inglés, aunque traiga un nombre con
// tildes, y otras que el inglés no usa.
const ENGLISH = /\b(the|is|are|was|cannot|not|failed|unable|invalid|must|of|to|undefined|null|missing|expected|unexpected|required|with|for|from|has|have|been|does|request|network|timeout)\b/i;
const SPANISH = /[¿¡áéíóúñ]|\b(el|la|los|las|del|que|una|para|sin|hay|puede|ya|se|no|al|un|de|en|con|por|su|lo)\b/i;

export function errorText(err, fallback = "Ocurrió un error inesperado.") {
  const code = String(err?.code ?? "").replace(/^[a-z]+\//, "");
  if (FIREBASE[code]) return FIREBASE[code];
  if (BROWSER[err?.name]) return BROWSER[err.name];
  const message = String(err?.message ?? err ?? "").trim();
  if (message && !ENGLISH.test(message) && SPANISH.test(message)) return message;
  if (err) console.error(err);
  return fallback;
}
