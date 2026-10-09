// Saludos personalizados y easter eggs por usuario.
//
// El texto nunca va en el código: aquí solo viven los nombres de las ranuras.
// El contenido está en el campo `greetings` del doc `users/{uid}`, que
// `AuthContext` ya vuelca entero en `user`, así que leerlo no cuesta lecturas
// extra. Cada usuario solo lee el suyo.
//
//   users/{uid} = {
//     role: "admin",
//     greetings: { workerAlreadyInLabor: "..." },
//   }
//
// Para sumar una ranura: declararla aquí, describirla en GREETING_FIELDS,
// leerla con `greeting()` donde corresponda y cargar el texto desde Usuarios.
export const GREETING_SLOTS = {
  // Tag del trabajador que ya está agregado a la labor (WorkerPickerModal).
  workerAlreadyInLabor: "workerAlreadyInLabor",
  // Tooltip del nombre en el header, donde dice "Mi perfil" (Layout).
  profileHover: "profileHover",
  // Línea suelta en la pantalla de 404. Sin saludo no se renderiza nada.
  notFound: "notFound",
};

// Ranuras con su descripción, para el editor de saludos de Usuarios.
export const GREETING_FIELDS = [
  {
    slot: GREETING_SLOTS.workerAlreadyInLabor,
    label: "Trabajador ya en la labor",
    note: 'Tag gris al intentar agregar a alguien que ya está. Default: "Ya en la labor".',
  },
  {
    slot: GREETING_SLOTS.profileHover,
    label: "Hover del nombre en el header",
    note: 'Tooltip al pasar el mouse sobre el propio nombre. Default: "Mi perfil".',
  },
  {
    slot: GREETING_SLOTS.notFound,
    label: "Página no encontrada (404)",
    note: "Línea suelta bajo el mensaje de error. Sin saludo no aparece nada.",
  },
];

// Devuelve el saludo del usuario para esa ranura, o el fallback neutro.
// Un texto vacío o en blanco cuenta como "sin saludo": así borrar el easter
// egg es dejar el campo vacío, sin tener que eliminarlo del documento.
export function greeting(user, slot, fallback = "") {
  const texto = user?.greetings?.[slot];
  return typeof texto === "string" && texto.trim() ? texto : fallback;
}
