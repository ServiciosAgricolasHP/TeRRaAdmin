# TeRRaAdmin

El panel de administración de las faenas agrícolas: los ciclos y sus jornadas, los trabajadores y sus contratos, los transportes, los anticipos y bonos, la nómina, la facturación y los cheques y pagos.

Está publicado en https://serviciosagricolashp.github.io/TeRRaAdmin/ y se puede instalar como app en el teléfono o el computador. Es React con Firebase (Firestore y Authentication).

## Qué hace

| Pantalla | Para qué |
|---|---|
| [Faenas](docs/screens/jobs.md) | Las faenas, subfaenas y ciclos: crearlos, cerrarlos, reabrirlos e importar de otro ciclo. |
| [Grilla del ciclo](docs/screens/cycle-detail.md) | Las jornadas de cada trabajador por día y labor, con sus precios y pisos, y el [resumen del ciclo](docs/screens/summaries.md) para pagar o cobrar. |
| [Trabajadores](docs/screens/workers.md) | Las fichas con sus datos bancarios y personales, los contratos y honorarios, y las listas de honorarios e imposiciones. |
| [Transportes](docs/screens/transports.md) | Los transportistas, sus vueltas, los resúmenes de pago y las quincenas. |
| [Anticipos y bonos](docs/screens/advances.md) | Lo que la nómina descuenta o suma, también en cuotas. |
| [Nómina](docs/screens/payroll.md) | El pago de las jornadas: el archivo del banco, los comprobantes del efectivo y el portal de trabajadores. |
| [Facturación](docs/screens/billing.md) | Las compras y ventas del registro del SII, con sus pagos, los centros de costo y los gastos informales. |
| [Cheques y pagos](docs/screens/commitments.md) | Los vencimientos, los abonos, los avisos por correo y el informe de deudas. |
| [Calendario](docs/screens/calendar.md) y [Dashboard](docs/screens/dashboard.md) | Lo que se trabajó cada día, y los números del mes o del año. |
| [Pesajes QR](docs/screens/harvest-qr.md) | Los pesajes de cosecha que escanea la app de QR, pasados a jornadas. |
| [Libro de Precios](docs/screens/price-book.md) | Lo que se pagó y se cobró por labor, aparte del resto de la app. |
| [Agenda y Cuentas](docs/screens/info-accounts.md) | La agenda telefónica y las fichas con datos bancarios para copiar. |
| [Links útiles](docs/screens/links.md) | Los atajos a otras herramientas. |
| [Ayuda](docs/screens/help.md) | Las guías de uso, con buscador y capturas. |
| Admin | La [auditoría](docs/screens/audit.md), los [usuarios](docs/screens/users.md) y la [consola](docs/screens/admin-console.md), con los respaldos y el registro de lecturas. |

## Puesta en marcha

1. Node 20 o más nuevo, como el CI.
2. `npm ci`. Deja además activo el hook `pre-push` (`.githooks/`), que corre los tests de unidad antes de cada push.
3. Un `.env` en la raíz con las credenciales de Firebase, copiadas de otro `.env` o de la consola de Firebase del proyecto. No está en git.

   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

4. `npm run dev` y abrir http://localhost:5173/TeRRaAdmin/. Para entrar, la cuenta necesita su perfil en `users` (ver "Auth" en AGENTS.md).

Los tests contra el emulador, las capturas de la ayuda y la app con datos descartables piden también JDK 21 y firebase-tools 15 (ver "Tests" en AGENTS.md). Las Cloud Functions llevan su propio `npm ci` en `functions/`.

## Documentación

| Archivo | Qué tiene |
|---|---|
| [AGENTS.md](AGENTS.md) | Las reglas del repo, para personas y agentes: git y commits, código, datos, interfaz, comandos, tests, glosario y rutas. |
| [docs/screens/](docs/screens/) | Cada pantalla: sus piezas, cómo funciona y cuánto lee. Qué archivo corresponde a cada una está en "Documentación por pantalla" de AGENTS.md. |
| [docs/data-model.md](docs/data-model.md) | Las colecciones y los campos de Firestore, con el diagrama. |
| [docs/labor-types.md](docs/labor-types.md) | Los tipos de labor y cómo calcula cada uno sus precios y montos. |
| [docs/deploy.md](docs/deploy.md) | El despliegue: un merge a `main` se publica solo en GitHub Pages. También los secrets, las rutas de la SPA y la PWA. |
| [functions/README.md](functions/README.md) | Las Cloud Functions: los jobs, cómo se verifican y el deploy a mano. |
