import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Versión del header: mayor y menor salen del "version" de package.json; el
// último número es la cantidad de commits, sin contar merges, desde el último
// commit que cambió esa línea. Así cada PR no suma un commit de más, y subir de
// versión (`npm version minor --no-git-tag-version` + commit) reinicia el conteo
// en 0. El tercer número de package.json no se usa. Fuera de un repo git, o con
// un historial incompleto (p. ej. un clone shallow en CI), el conteo vale 0 y el
// build no falla.
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const [major, minor] = pkgVersion.split('.')
const git = (args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
const commitCount = (() => {
  try {
    const base = git(['log', '-1', '--format=%H', '-G"version":', '--', 'package.json'])
    return (base && git(['rev-list', '--count', '--no-merges', `${base}..HEAD`])) || '0'
  } catch {
    return '0'
  }
})()
const APP_VERSION = `v${major}.${minor}.${commitCount}`
const branch = (() => {
  try {
    return git(['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return ''
  }
})()

// Inyecta la versión como `__APP_VERSION__`. En el servidor de desarrollo lleva
// la rama ("v1.3.12 · develop"): el número cuenta los commits de la rama que se
// está corriendo, que puede ir por delante de producción, y así el encabezado y
// el registro de lecturas no la confunden con una versión publicada.
const appVersion = () => ({
  name: 'app-version',
  config: (_, { command }) => ({
    define: {
      __APP_VERSION__: JSON.stringify(command === 'serve' && branch ? `${APP_VERSION} · ${branch}` : APP_VERSION),
    },
  }),
})

export default defineConfig({
  base: '/TeRRaAdmin/',   // tiene que coincidir con el basename de src/App.jsx
  plugins: [
    appVersion(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
    VitePWA({
      // autoUpdate: el service worker se actualiza solo cuando se hace deploy
      // de una versión nueva, sin preguntarle al usuario.
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'terra.png', 'terra.svg', '404.html'],
      manifest: {
        name: 'TeRRA',
        short_name: 'TeRRA',
        description: 'TeRRA — faenas, calendario, nomina',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        // landscape (no landscape-primary): permite rotar 180° pero fuerza
        // horizontal en la PWA instalada. Solo tiene efecto real cuando el
        // usuario abre la PWA instalada — en tab de browser normal el sistema
        // lo ignora. iOS Safari ignora esto siempre; ver el lock en runtime
        // (src/main.jsx) que apunta al mismo objetivo con screen.orientation.
        orientation: 'landscape',
        scope: '/TeRRaAdmin/',
        start_url: '/TeRRaAdmin/',
        icons: [
          { src: 'terra.png', sizes: '192x192', type: 'image/png' },
          { src: 'terra.png', sizes: '512x512', type: 'image/png' },
          { src: 'terra.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Precachea SOLO assets estables (imágenes, fuentes, íconos). JS, CSS y
        // HTML cambian de nombre (hash) en cada deploy: un index.js precacheado
        // apuntaría a chunks que el deploy nuevo ya borró. Esos van por
        // NetworkFirst (ver runtimeCaching). De las animaciones de
        // `public/loaders/` van la general y las dos de los procesos largos
        // (hacer y deshacer); las demás se guardan la primera vez que salen.
        globPatterns: ['**/*.{ico,png,svg,woff2}', 'loaders/cat-default.webp', 'loaders/cat-wheel-fall.webp', 'loaders/cat-chasing-tail.webp'],
        // Las capturas de la ayuda se bajan al abrir su guía, nunca al instalar.
        globIgnores: ['help/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // El SW nuevo toma control de las pestañas abiertas apenas se activa,
        // sin esperar a que se cierren.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: null,
        runtimeCaching: [
          {
            // HTML / JS / CSS de la app: NetworkFirst. Con red trae lo último;
            // si la red falla o tarda más de 3 s, usa la caché (offline
            // parcial).
            urlPattern: ({ request }) =>
              request.destination === 'document' ||
              request.destination === 'script' ||
              request.destination === 'style',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Animaciones de la pantalla de carga (`public/loaders/`): no
            // cambian, así que después de la primera vez salen de la caché.
            urlPattern: ({ url }) => url.pathname.includes('/loaders/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'screen-loaders',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Logo y otros assets externos (firebase storage, etc.) si los hay.
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        // No habilitamos el SW en dev — interfiere con HMR.
        enabled: false,
      },
    }),
  ],
})