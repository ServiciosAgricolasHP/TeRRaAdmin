# Despliegue

- La URL anterior (`/adminAgrofrutos/`) la sirve un repo aparte con ese nombre, en la misma organización: un stub que redirige a `/TeRRaAdmin/`. **GitHub no redirige las URLs de Pages de un repo renombrado** (solo las de git y web).
- **Los secrets son obligatorios para el build de deploy**: las 6 `VITE_FIREBASE_*` viven en *Settings → Secrets and variables → Actions* del repo y se inyectan como `env` del paso de build. `.env` está gitignoreado, así que sin ellas el bundle sale con la config vacía y producción cae con `auth/invalid-api-key`.
- **`fetch-depth: 0`** en el checkout del deploy: sin el historial completo, el conteo de commits de `vite.config.js` no encuentra su punto de partida y la versión del header queda pegada en `.0`.

## SPA en GitHub Pages

- `public/404.html` + script en `index.html` (truco rafgraph/spa-github-pages): cualquier ruta desconocida recarga `index.html?/<path>`, el script hace `history.replaceState` y React Router renderiza la ruta correcta. Sin esto, recargar `/cycles/abc` devuelve 404 de GitHub Pages.

## PWA

- Configurada via `vite-plugin-pwa` en `vite.config.js` con `registerType: 'autoUpdate'`. Genera `manifest.webmanifest`, `sw.js` y `registerSW.js` en `dist/` al build.
- **Instalación**: se abre la URL desplegada en Chrome (Android) o Safari (iOS) → el navegador ofrece "Instalar app" / "Agregar a pantalla de inicio" → queda ícono en el escritorio que abre la app en standalone (sin barra de URL).
- **Precache**: solo assets estables, `globPatterns: ['**/*.{ico,png,svg,woff2}', 'loaders/cat-default.webp', 'loaders/cat-wheel-fall.webp', 'loaders/cat-chasing-tail.webp']` (de las animaciones, solo la general y las dos de los procesos largos; ver `docs/screens/screen-loader.md`). JS, CSS y HTML cambian de nombre en cada deploy: un `index.js` precacheado apuntaría a chunks que el deploy nuevo ya borró, así que van por NetworkFirst (`runtimeCaching` en `vite.config.js`). Límite de 5 MB por archivo.
- **Cache de datos**: NO interceptamos las llamadas a Firestore — el SDK de Firebase ya maneja su propio cache offline en IndexedDB. Habilitar `enableIndexedDbPersistence` si queremos offline-first más agresivo.
- **navigateFallback: null** intencional. No queremos que el SW devuelva `index.html` para rutas desconocidas porque romperíamos el truco 404.html → `?/path` de GitHub Pages.
- **Auto-update**: cuando se publica una versión nueva (merge a `main` → Actions, o `npm run deploy` a mano), el SW detecta el cambio en `sw.js` en la próxima navegación y se actualiza sin prompt al usuario (el reload siguiente toma la versión nueva).
- **Dev**: `devOptions.enabled: false` — el SW no corre en `npm run dev` para no pelearse con HMR.
