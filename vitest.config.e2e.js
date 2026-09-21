import { defineConfig } from "vitest/config";

// Los ciclos end-to-end corren contra el EMULADOR de Firestore, nunca contra
// datos reales. Tres de las cuatro barreras que lo garantizan se declaran acá;
// la cuarta (la assertion que aborta si algo falta) vive en tests/e2e/setup.js.
//
//   1. `demo-terra-test` — el SDK de Firebase jamás contacta servidores de
//      Google con un project id que empieza con `demo-`. Es la barrera que no
//      depende de que nuestra configuración esté bien.
//   2. `VITE_FIRESTORE_EMULATOR` — hace que src/firebase.js apunte a localhost.
//   3. El emulador se levanta con `firebase emulators:exec` (ver el script
//      `test:e2e`), sin import ni export: todo vive en memoria y se va al
//      terminar.
export const EMULATOR_HOST = "127.0.0.1:8080";
export const TEST_PROJECT_ID = "demo-terra-test";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/e2e/**/*.test.js"],
    setupFiles: ["tests/e2e/setup.js"],
    env: {
      VITE_FIRESTORE_EMULATOR: EMULATOR_HOST,
      VITE_FIREBASE_PROJECT_ID: TEST_PROJECT_ID,
      // El SDK exige una apiKey presente aunque con un proyecto `demo-` no la
      // use para nada.
      VITE_FIREBASE_API_KEY: "demo-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-terra-test.firebaseapp.com",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-terra-test.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
      VITE_FIREBASE_APP_ID: "1:0:web:demo",
    },
    // Serie, no paralelo: todos los archivos comparten la misma instancia del
    // emulador y cada uno la limpia al empezar. En paralelo se pisarían.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
