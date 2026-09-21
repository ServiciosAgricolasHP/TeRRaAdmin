import { defineConfig } from "vitest/config";

// Config propia, deliberadamente separada de `vite.config.js`. Ese config corre
// `execSync("git rev-list --count")` al cargarse y monta VitePWA: dos cosas que
// no queremos pagar en cada corrida de tests. Acá solo se copia el `define` de
// la versión, que es lo único de la app que los módulos pueden llegar a leer.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
  },
  test: {
    // Sin globals: cada test importa `describe`/`it`/`expect` de "vitest". Así
    // `eslint.config.js` no necesita declarar globals nuevos y el lint no suma
    // ruido a la deuda que ya arrastra.
    globals: false,
    environment: "node",
    include: ["src/**/*.test.js"],
    // Los ciclos end-to-end tienen su propio config y su propio runner: piden
    // el emulador levantado y corren en serie.
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
