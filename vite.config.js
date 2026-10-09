import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// El patch de la versión es la cantidad de commits desde VERSION_RESET_COMMIT,
// donde el versionado arranca en 1.1.0. Fuera de un repo git, o si ese commit
// no está en el historial disponible (p. ej. un clone shallow en CI), vale "0"
// y el build no falla.
const VERSION_RESET_COMMIT = 'e3c61c818e237c7edc2c8ef13ada2adac0c8713d'
const commitCount = (() => {
  try {
    return execSync(`git rev-list --count ${VERSION_RESET_COMMIT}..HEAD`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim() || '0'
  } catch {
    return '0'
  }
})()
const APP_VERSION = `v1.1.${commitCount}`

export default defineConfig({
  base: '/TeRRaAdmin/',   // tiene que coincidir con el basename de src/App.jsx
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
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
        // NetworkFirst (ver runtimeCaching).
        globPatterns: ['**/*.{ico,png,svg,woff2}'],
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