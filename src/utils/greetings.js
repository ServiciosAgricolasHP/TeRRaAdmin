// Saludos personalizados y easter eggs por usuario.
//
// El texto NO vive en el código. Un saludo hardcodeado deja el mail de una
// persona real en el repo, y fuera de contexto un chiste interno puede leerse
// como cualquier otra cosa. Acá solo viven los nombres de las ranuras; el
// contenido va en Firestore.
//
// Dónde: el campo `greetings` del doc `users/{uid}`, que `AuthContext` ya lee
// al iniciar sesión y vuelca entero en el objeto `user`. Eso significa **cero
// lecturas extra** — no hace falta una colección aparte ni una consulta al
// abrir el modal.
//
//   users/{uid} = {
//     role: "admin",
//     greetings: { workerAlreadyInLabor: "..." },
//   }
//
// Para sumar un easter egg nuevo: agregar una ranura acá, leerla con
// `greeting()` donde corresponda, y cargar el texto en el doc del usuario.
// Nadie más lo ve, porque cada uno solo lee su propio doc.
export const GREETING_SLOTS = {
  // Tag del trabajador que ya está agregado a la labor (WorkerPickerModal).
  workerAlreadyInLabor: "workerAlreadyInLabor",
  // Tooltip del nombre en el header, donde dice "Mi perfil" (Layout).
  profileHover: "profileHover",
  // Línea suelta en la pantalla de 404. Sin saludo no se renderiza nada.
  notFound: "notFound",
};

// Devuelve el saludo del usuario para esa ranura, o el fallback neutro.
// Un texto vacío o en blanco cuenta como "sin saludo": así borrar el easter
// egg es dejar el campo vacío, sin tener que eliminarlo del documento.
export function greeting(user, slot, fallback = "") {
  const texto = user?.greetings?.[slot];
  return typeof texto === "string" && texto.trim() ? texto : fallback;
}
