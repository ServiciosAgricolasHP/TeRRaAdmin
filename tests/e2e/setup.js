import { beforeAll, beforeEach } from "vitest";
import { invalidateAll } from "../../src/services/cache";

// Cuarta barrera contra tocar datos reales (las otras tres están en
// vitest.config.e2e.js). Si la configuración se rompiera, o alguien corriera
// este config a mano sin el emulador, esto aborta ANTES de que se importe
// src/firebase.js y se construya la app.
const proyecto = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const emulador = import.meta.env.VITE_FIRESTORE_EMULATOR;

if (!emulador) {
  throw new Error(
    "Los tests end-to-end exigen VITE_FIRESTORE_EMULATOR. Se aborta antes de " +
      "abrir ninguna conexión. Corrélos con: npm run test:e2e",
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
// Al arrancar, el emulador avisa "does not support multiple databases yet": lo
// que hace es mapear cualquier nombre a su única base. Verificado que el DELETE
// con este nombre borra de verdad, no que devuelva 200 sin hacer nada.
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
        "Corré los tests con: npm run test:e2e (levanta y apaga el emulador solo). " +
        `Detalle: ${err?.message || err}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `No se pudo vaciar el emulador (${res.status}). ` +
        "Corré los tests con: npm run test:e2e",
    );
  }
}

beforeAll(async () => {
  // Falla temprano y con un mensaje claro si el emulador no está arriba, en
  // vez de dejar que cada test muera por timeout.
  await vaciarEmulador();
});

// La caché en memoria de `services/cache.js` vive a nivel de módulo y NO se
// reinicia entre tests: sin esto, un test que lee una colección vacía le deja
// ese vacío cacheado al siguiente, que ya sembró datos. Pasa de verdad —
// `listPendingForWorkers` cachea, así que los anticipos del test 2 no
// aparecían porque el test 1 había cacheado una lista vacía.

// Cada test arranca de cero. Los archivos corren en serie (fileParallelism en
// false) justamente para que esto sea seguro.
beforeEach(async () => {
  await vaciarEmulador();
  invalidateAll();
});
