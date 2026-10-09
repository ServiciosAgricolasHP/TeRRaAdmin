import { defineConfig } from "vitest/config";

// Config propia, separada de `vite.config.js`, que al cargarse corre
// `execSync("git rev-list --count")` y monta VitePWA. Acá solo se copia el
// `define` de la versión, lo único de la app que los módulos pueden leer.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
  },
  test: {
    // Sin globals: cada test importa `describe`/`it`/`expect` de "vitest", así
    // `eslint.config.js` no necesita declararlos.
    globals: false,
    environment: "node",
    include: ["src/**/*.test.js"],
    // Los ciclos end-to-end tienen su propio config y su propio runner: piden
    // el emulador levantado y corren en serie.
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
