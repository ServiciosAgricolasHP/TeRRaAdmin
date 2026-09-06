// Cloud Functions for TeRRaAdmin.
//
// Backend mínimo, listo para crecer. Por ahora solo expone un `ping` callable
// que sirve para verificar el setup end-to-end (auth + región).
//
// === Por qué v1 y no v2 ===
// Functions v2 corre sobre Cloud Run, que requiere binding IAM público
// (`allUsers` con rol invoker) para que el navegador pueda invocarla. Si el
// proyecto GCP tiene una org policy que restringe acceso público (es el caso
// acá — el deploy de v2 lo avisó), v2 no funciona desde el browser ni con
// `invoker: "public"`. v1 corre sobre la infra clásica de Cloud Functions y
// los HTTPS triggers son públicos por defecto sin necesitar ese binding.
//
// La autenticación REAL sigue siendo el `context.auth` que valida el ID token
// de Firebase Auth automáticamente. Que el endpoint sea públicamente
// invocable no significa que cualquiera pueda hacer cosas — solo significa
// que pueden hacer la request HTTP; si no traen un token válido, la función
// los rechaza.
//
// Cuando agregues funciones nuevas:
//   - Mismo patrón: `functions.region("southamerica-west1").https.onCall(...)`.
//   - Para secrets, usar `functions.config()` (set: `firebase functions:config:set
//     servicio.api_key="..."`). Funcional pero está deprecado; la alternativa
//     moderna es `defineSecret` de v2, pero eso te trae el problema de Cloud
//     Run de vuelta.
//   - Validá `context.auth` para rechazar llamadas sin login.

import * as functionsV1 from "firebase-functions/v1";

const { HttpsError } = functionsV1.https;

// TODO: backup manual en JSON (segundo camino, pendiente de que Functions
// quede habilitado correctamente en la plataforma).
//
// Complementa al backup nativo de Firestore (schedule diario, retención 7d,
// creado vía `firebase firestore:backups:schedules:create` — sin código, sin
// bucket propio). Ese backup nativo cubre "restaurar la base completa a un
// punto anterior" pero NO es legible/inspeccionable ni permite restaurar una
// sola colección.
//
// Este segundo camino es un callable (`generateJsonBackup`) que:
//   - Lee cada colección con el admin SDK (ver createService/firestoreBase.js
//     en src/services para la lista de colecciones: faenas, subfaenas,
//     cycles, worker, workdays, groupLeader, payrollSnapshots,
//     interestLinks, companies, dteDocuments, contactCards, indicators,
//     advances, carriers, payrolls, transports, transportPayments,
//     transportPayrolls — dejar fuera `logs`, es auditoría, no data operativa).
//   - Serializa Timestamps de Firestore a ISO string (y de vuelta al
//     restaurar con Timestamp.fromDate()).
//   - Sube el JSON resultante a Cloud Storage con nombre timestamped, en vez
//     de devolverlo por la respuesta del callable (evita límites de memoria
//     del browser en bases grandes).
//   - Se dispara manual desde AdminConsole al inicio; automatizar después es
//     el mismo código detrás de un Cloud Scheduler en vez de un botón.
//   - El restore se hace colección por colección (acción de admin normal,
//     con confirmación) — nunca "restaurar todo" de un clic.

// Callable de prueba — devuelve un pong con el uid del caller.
export const ping = functionsV1
  .region("southamerica-west1")
  .https.onCall((data, context) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Tenés que estar logueado.");
    }
    return {
      ok: true,
      uid: context.auth.uid,
      email: context.auth.token?.email || null,
      serverTime: new Date().toISOString(),
    };
  });
