# Layout

- `components/Layout.jsx` arma la barra lateral, el header y el drawer del teléfono. Sus piezas, en `components/layout/`: `TerraLogo` (el logo, el wordmark y el motivo de circuito), `ThemePicker`, `ProfileModal` (Mi perfil: el alias), `IndicatorsBar` (con `IndicatorChips` y `EditIndicatorsButton`), `IndicatorsModal`, `useIndicators` (carga y guarda `indicators/main`) e `indicators.js`.
- El drawer del teléfono queda abierto solo en la ruta donde se abrió (`drawerPath`): navegar lo cierra.
- **Sidebar colapsable** (`layout.sidebarOpen` en `localStorage`): un solo botón ☰ funciona como toggle en desktop y abre drawer en mobile (decidido por `matchMedia("(min-width: 768px)")`).
- Nav incluye: Dashboard, Faenas, Calendario, Trabajadores, Transportes, Anticipos / Bonos, Nómina, Facturación, Cheques y pagos, Links útiles. Items admin (Usuarios, Auditoría, Migrar CSV, Limpiar pagados, Consola) se ven solo con `isAdmin`.
- **Versión en el header** — `TeRRA v{mayor}.{menor}.{commits}`, armada en build-time por `vite.config.js` e inyectada como `__APP_VERSION__`. Sirve para diagnosticar caché PWA viejo de un vistazo: si el header sigue mostrando una versión anterior tras un deploy, el SW tiene un bundle stale.
  - **Mayor y menor salen del `version` de `package.json`**; su tercer número no se usa.
  - **El último número son los commits desde el último que cambió esa línea, sin contar merges** (`git log -G'"version":' -- package.json` + `git rev-list --count --no-merges`). Sin merges, cada PR no suma uno de más, y el mismo código muestra el mismo número en `develop` y en producción.
  - **Subir de versión**: `npm version minor --no-git-tag-version` (actualiza `package.json` y el lock) y commit; el conteo vuelve a 0 solo. Un commit que reformatee la línea `"version"` también reinicia el conteo.
  - Ojo en CI: sin `fetch-depth: 0` el conteo da 0.
