import { beforeAll, beforeEach } from "vitest";
import { invalidateAll } from "../../src/services/cache";

// Cuarta barrera contra tocar datos reales (las otras tres están en
// vitest.config.e2e.js): sin emulador o sin un project id `demo-`, aborta ANTES
// de que se importe src/firebase.js y se construya la app.
const proyecto = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const emulador = import.meta.env.VITE_FIRESTORE_EMULATOR;

if (!emulador) {
  throw new Error(
    "Los tests end-to-end exigen VITE_FIRESTORE_EMULATOR. Se aborta antes de " +
      "abrir ninguna conexión. Córrelos con: npm run test:e2e",
  );
}
if (!String(proyecto || "").startsWith("demo-")) {
  throw new Error(
    `El project id de los tests tiene que empezar con "demo-" y es "${proyecto}". ` +
      "Ese prefijo es lo que impide que el SDK hable con servidores de Google " +
      "aunque el emulador no responda. Se aborta.",
  );
}

// Base nombrada: la app usa `getFirestore(app, "hpdatabase")`, no la default,
// y la URL de limpieza tiene que coincidir.
//
// El emulador no soporta bases múltiples y mapea cualquier nombre a su única
// base, así que el DELETE con este nombre la vacía.
const BASE = "hpdatabase";
const URL_LIMPIEZA = `http://${emulador}/emulator/v1/projects/${proyecto}/databases/${BASE}/documents`;

async function vaciarEmulador() {
  let res;
  try {
    res = await fetch(URL_LIMPIEZA, { method: "DELETE" });
  } catch (err) {
    // Sin emulador, `fetch` tira ECONNREFUSED antes de devolver nada. El
    // mensaje crudo no dice qué hacer, así que lo traducimos.
    throw new Error(
      `No hay emulador de Firestore escuchando en ${emulador}. ` +
        "Corre los tests con: npm run test:e2e (levanta y apaga el emulador solo). " +
        `Detalle: ${err?.message || err}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `No se pudo vaciar el emulador (${res.status}). ` +
        "Corre los tests con: npm run test:e2e",
    );
  }
}

beforeAll(async () => {
  // Falla temprano y con un mensaje claro si el emulador no está arriba, en
  // vez de dejar que cada test muera por timeout.
  await vaciarEmulador();
});

// La caché en memoria de `services/cache.js` vive a nivel de módulo y no se
// reinicia sola: se vacía antes de cada test, junto con el emulador.

// Cada test arranca de cero. Los archivos corren en serie (fileParallelism en
// false) justamente para que esto sea seguro.
beforeEach(async () => {
  await vaciarEmulador();
  invalidateAll();
});
