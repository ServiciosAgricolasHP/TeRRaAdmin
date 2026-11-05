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
};

const BROWSER = {
  NotAllowedError: "El navegador no dio permiso. Vuelve a intentar con la pestaña abierta y al frente.",
  QuotaExceededError: "El navegador se quedó sin espacio para guardar.",
  AbortError: "Se canceló antes de terminar.",
};

// Palabras que delatan un mensaje en inglés, aunque traiga un nombre con
// tildes, y otras que el inglés no usa.
const ENGLISH = /\b(the|is|are|was|cannot|not|failed|unable|invalid|must|of|to|undefined|null)\b/i;
const SPANISH = /[¿¡]|\b(el|la|los|las|del|que|una|para|sin|hay|puede|ya|se|no)\b|está/i;

export function errorText(err, fallback = "Ocurrió un error inesperado.") {
  const code = String(err?.code ?? "").replace(/^[a-z]+\//, "");
  if (FIREBASE[code]) return FIREBASE[code];
  if (BROWSER[err?.name]) return BROWSER[err.name];
  const message = String(err?.message ?? err ?? "").trim();
  if (message && !ENGLISH.test(message) && SPANISH.test(message)) return message;
  if (err) console.error(err);
  return fallback;
}
