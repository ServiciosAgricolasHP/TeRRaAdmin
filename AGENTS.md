# AGENTS.md

## Comandos / Commands

| Comando / Command | Propósito / Purpose |
|---------|---------|
| `npm run dev` | Iniciar servidor de desarrollo (HMR) / Start Vite dev server (HMR) |
| `npm run build` | Compilar para producción → `dist/` / Production build → `dist/` |
| `npm run lint` | ESLint (flat config, `.js` y `.jsx`) |
| `npm run preview` | Vista previa del build / Preview production build locally |
| `npm test` | Vitest sobre lógica pura (~2s, sin red) / Pure-logic unit tests |
| `npm run test:watch` | Vitest en modo watch |
| `npm run test:e2e` | Ciclos end-to-end contra el emulador de Firestore / Integration cycles against the Firestore emulator |
| `npm run test:rules` | `firestore.rules` contra el emulador / Security rules against the Firestore emulator |
| `npm run test:all` | Los tres anteriores |
| `npm run functions:verify` | Cloud Functions contra los emuladores de functions, firestore y auth, sin deployar / Verify Cloud Functions locally |
| `npm run deploy` | Deploy manual a GitHub Pages (`gh-pages -d dist -t`). **Escape hatch** — el camino normal es mergear a `main` y dejar que Actions deploye / Manual fallback; normal path is merge to `main` |

## Tests

Tres capas, ninguna toca datos reales.

- **Unidad** (`vitest.config.js`): `src/**/*.test.js`, entorno `node`, sin globals
  (cada archivo importa `describe`/`it`/`expect` de `vitest`, así `eslint.config.js`
  no necesita declararlos). Cubre la matemática: reparto de anticipos y bonos,
  agregación de workdays, RUT, parser del SII, caché, cuotas.
- **End-to-end** (`vitest.config.e2e.js` + `tests/e2e/`): ciclos completos por la
  **capa de servicios**, no por el DOM — generar nómina → etiquetar workdays →
  aplicar anticipos → borrar → verificar que todo volvió atrás; y el import del
  RCV del SII, incluido el borrado de huérfanos. Corren en serie y
  el emulador se vacía antes de cada test.
- **Reglas** (`vitest.config.rules.js` + `tests/rules/`): `firestore.rules` contra
  el emulador, desde el lado de cada cliente real: TeRRa con perfil, una cuenta
  sin perfil o suspendida, el escáner sin sesión y la cola del backend. Usa
  `@firebase/rules-unit-testing` y su propio project id (`demo-terra-rules`).

**Cuatro barreras impiden que un test toque `arandanos-hp`**, y cualquiera alcanza:

1. El project id es `demo-terra-test`. Con el prefijo `demo-` el SDK de Firebase
   **nunca** contacta servidores de Google, aunque el emulador no responda.
2. `VITE_FIRESTORE_EMULATOR` apunta `src/firebase.js` a localhost (ver el bloque al
   final de ese archivo). En producción la variable no existe.
3. `tests/e2e/setup.js` **aborta** si falta cualquiera de las dos.
4. El emulador se levanta con `emulators:exec`, sin `--import` ni `--export-on-exit`:
   todo vive en memoria y se va al terminar.

Requisito local: **JDK 21 o superior** (`winget install EclipseAdoptium.Temurin.21.JDK`).
`firebase-tools` 15 rechaza runtimes anteriores. En CI lo fija `actions/setup-java`.

**Las reglas de Firestore viven en `firestore.rules`** y se prueban con
`npm run test:rules`. Se publican a mano: el archivo entero se pega en la consola
de Firebase, en la base `hpdatabase`. `firebase.json` no las referencia a
propósito: el emulador de los e2e las cargaría, y esos tests hablan con la base
sin sesión.

- **Una sesión sola no da acceso.** Lo que da acceso es tener perfil en
  `users/{uid}` (el id del documento es el UID de la cuenta) sin `disabled: true`.
  Los perfiles se crean desde la consola de Firebase; el rol y la suspensión se
  cambian desde Usuarios (ver esa sección).
- Cualquier perfil lee y escribe lo de la app, igual que en las pantallas: lo que
  separa a un admin del resto son las rutas, no los datos. `users`, `logs` y
  `functionJobs` tienen reglas propias.
- **El escáner (`scan_IS`) y las apps de cosechas y reportes no inician sesión**:
  lo que usan queda abierto, acotado campo por campo a lo que esas apps escriben.
- Si el escáner empieza a escribir un campo nuevo (en un pesaje, por ejemplo), el
  campo **tiene que entrar también en `firestore.rules`**. Si no, el servidor
  rechaza los pesajes nuevos.
- Lo que se carga al abrir la app y vive fuera de las rutas protegidas
  (`CatalogsProvider`, `CarriersProvider`) espera a que la cuenta tenga acceso
  (`hasAccess`): sin eso las reglas rechazan la lectura.

El mismo enganche sirve para usar la app entera contra datos descartables:
`VITE_FIRESTORE_EMULATOR=127.0.0.1:8080 VITE_FIREBASE_PROJECT_ID=demo-terra-test npm run dev`.
Con `VITE_AUTH_EMULATOR=127.0.0.1:9099` también se inicia sesión contra el
emulador de Authentication; con
`firebase emulators:start --only functions,firestore,auth --project demo-terra-test`
corren además los jobs del backend. La cuenta y su perfil en `users` se crean en
los emuladores, y conviene pasar también las demás `VITE_FIREBASE_*` con valores
de demo (como en `vitest.config.e2e.js`).

Los tests marcados `[bug conocido]` fijan el comportamiento **actual** de algo que
parece estar mal, con el porqué en un comentario. No son la conducta deseada: si
arreglas uno, el test se cae y eso es la señal de actualizar los dos.

## Despliegue / Deploy

- Desplegado en GitHub Pages en: `https://serviciosagricolashp.github.io/TeRRaAdmin/`
- El path base `/TeRRaAdmin/` está en **dos archivos** — ambos deben coincidir:
  - `vite.config.js` → `base`
  - `src/App.jsx` → `<BrowserRouter basename="/TeRRaAdmin">`
- La URL anterior (`/adminAgrofrutos/`) la sirve un repo aparte con ese nombre, en la misma organización: un stub que redirige a `/TeRRaAdmin/`. **GitHub no redirige las URLs de Pages de un repo renombrado** (solo las de git y web).

### Flujo de trabajo Git / Git workflow

- **Día a día en `develop`.** `main` es producción y solo recibe merges vía Pull Request.
- **`docs/data-model.md` acompaña a cada cambio de modelo.** Una colección nueva, un campo nuevo, uno que cambia de tipo o de significado, o uno que se deja de escribir se documenta en el mismo commit; una colección nueva también va en `MAIN_COLLECTIONS` (Consola admin). Antes de un push se revisa que los commits que tocaron entidades lo hayan actualizado.
- `.github/workflows/ci.yml` — corre en push/PR: `npm run lint` (**no bloqueante**, `continue-on-error`: el lint tiene ~65 errores sin resolver) y `npm run build` (**sí bloqueante**). Este build en Linux es lo que caza los imports con casing incorrecto que Windows esconde.
- `.github/workflows/deploy.yml` — push a `main` → build → publica `dist/` en la rama `gh-pages`.
- **Los secrets son obligatorios para el build de deploy**: las 6 `VITE_FIREBASE_*` viven en *Settings → Secrets and variables → Actions* del repo y se inyectan como `env` del paso de build. `.env` está gitignoreado, así que sin ellas el bundle sale con la config vacía y producción cae con `auth/invalid-api-key`.
- **`fetch-depth: 0`** en el checkout del deploy: sin el historial completo, el conteo de commits de `vite.config.js` no encuentra su punto de partida y la versión del header queda pegada en `.0`.
- **Cloud Functions quedan fuera del pipeline** — se deployan a mano (ver `functions/README.md`).
  - **El backend no se invoca por HTTP: se le escribe un documento.** La app crea un job en `functionJobs` y un **trigger de Firestore v2** lo levanta, lo ejecuta y escribe el resultado en el mismo doc; la UI lo mira con un `onSnapshot`. Del lado de la app, `services/functionJobsService.js` crea el job (`enqueueJob`) y espera el resultado (`waitForJob`).
  - **No hay funciones callable.** *(a)* Una callable **v2** corre sobre Cloud Run y necesita un binding IAM `allUsers`, que la org policy del proyecto prohíbe: responde **403 con cuerpo HTML** antes de llegar al código. *(b)* Cloud Functions **v1** no existe en `southamerica-west1`, y esa región tampoco tiene App Engine, que gen1 necesita para el staging. *(c)* Un **trigger de Firestore v1** solo dispara sobre la base `(default)`, que en este proyecto no existe. Un trigger v2 lo invoca Eventarc con una service account, sin invoker público.
  - **Lo programado va con `onSchedule` (v2)**, que Cloud Scheduler invoca con una service account: tampoco necesita invoker público. Es el caso del aviso diario de Cheques y pagos (`commitmentsDaily`), en `us-central1` como el resto.
  - **Región `us-central1`, y no es negociable**: `hpdatabase` está en **`nam5`** (multi-región de EE.UU.) y un trigger de Firestore tiene que vivir en la ubicación de la base. Ver la nota de `nam5` en Arquitectura.
  - **`database: "hpdatabase"` en el trigger.** La base no es `(default)`. Si no coincide, la función queda suscrita a una base inexistente y **nunca dispara, sin dar error** — el peor modo de falla del diseño.
  - **La autorización está en las reglas**: la regla de Firestore decide quién crea un doc en `functionJobs` (`firestore.rules`, ver Tests). El `create` exige que lo pida un admin, con `status == "pending"` y `requestedBy == request.auth.uid`, y nadie edita ni borra un job desde el cliente (la función escribe con el admin SDK, que no pasa por reglas).
  - **`npm run functions:verify` antes de cada deploy** — ver `functions/README.md`. Iterar deployando cuesta minutos de Cloud Build por vuelta; el emulador da lo mismo en segundos. **Pero no prueba el enrutamiento por base**: el emulador de Firestore no soporta bases múltiples, así que sirve una sola y el nombre le da igual. Eso solo se verifica en producción, y es para lo que está el botón de ping.

## Stack

React 19 · Vite 7 · Tailwind CSS 4 · Firebase (Firestore + Auth) · ag-grid · React Router 7 · ExcelJS (lazy) · Recharts (lazy) · jsPDF (lazy) · html-to-image · ESLint flat config

- **Solo JavaScript** (no TypeScript).
- **React Compiler** habilitado via `babel-plugin-react-compiler`.
- Variables de entorno con prefijo `VITE_`.
- `exceljs` se importa **lazy** (`await import("exceljs")`) solo al exportar — chunk separado de ~937 KB.
- `recharts` idem, vía `React.lazy` sobre `components/DashboardCharts.jsx` — chunk separado de ~372 KB. El chunk principal ya está sobre el límite de Vite, así que toda librería pesada nueva va lazy.
- `jspdf` + `jspdf-autotable` también se importan lazy, solo al descargar el PDF del Informe de deudas.

## Arquitectura / Architecture

```
src/
  main.jsx              ← punto de entrada / entry point
  App.jsx               ← router (react-router-dom)
  firebase.js           ← Firebase init (Firestore db = "hpdatabase")
  components/           ← UI compartida (Layout, ProtectedRoute, Modal, ConfirmDialog, RowMenu, TransportsModal, WorkerEditModal, WorkerSummaryModal, etc.)
  hooks/                ← hooks que usan varias pantallas (useIsMobile)
  screens/              ← componentes de ruta / page-level route components
                        (Dashboard, Faenas, CycleDetail, Workers, Transports, Payroll, Advances,
                         InterestLinks, Calendar, AdminConsole, Users, NoAccess, MigrateWorkers,
                         CleanupPaidWorkdays)
    payroll/            ← las piezas de Nómina (ver "Componentes y archivos")
    transports/         ← las piezas de Transportes
  contexts/             ← AuthContext, ThemeContext, CatalogsContext, CarriersContext
  services/             ← capa de datos (Firestore CRUD + caché + auditoría)
                        firestoreBase, transportsService, carriersService,
                        workersService, payrollsService, advancesService, logger
  utils/                ← helpers de dominio (rutUtils, banks, payroll, cosechaCombos,
                        agGridLocale, similarity, etc.)
```

### Componentes y archivos

El código de la interfaz se organiza **por funcionalidad** (*feature folders*): las carpetas llevan el nombre de lo que hace la app (`payroll/`), no del tipo de archivo (`modals/`, `helpers/`). Cada pieza vive lo más cerca posible de donde se usa (*colocation*), y la interfaz, la lógica, el cálculo y los datos van en capas separadas. Vale para todo lo que se crea y para lo que se toca.

Un componente se ubica según quién lo usa:

| Tipo | Dónde va |
|---|---|
| **Pantalla**: el componente de una ruta | `screens/<Pantalla>.jsx` |
| **Pieza**: lo usa una sola pantalla | En la carpeta de su pantalla: `screens/<pantalla>/<Pieza>.jsx` |
| **Compartido**: lo usan dos o más pantallas, o es la estructura de la app (`Layout`, `ProtectedRoute`) | `components/<Componente>.jsx` |

- **La carpeta aparece cuando hay piezas que separar.** Una pantalla o un componente que cabe en un archivo no lleva carpeta (`Login.jsx`, `Modal.jsx`).
  - Cuando la lleva, la carpeta va al lado del archivo y se llama como él, con la primera letra en minúscula (`Payroll.jsx` → `payroll/`). El archivo conserva el componente principal.
  - Una pieza con piezas propias repite el esquema dentro de la carpeta de su pantalla.
- **Una pieza cambia de lugar cuando cambia quién la usa.** Si otra pantalla la necesita, pasa a `components/`. Un componente de `components/` que usa una sola pantalla va en la carpeta de esa pantalla.
- **El resto del código:**
  - `hooks/`: los hooks que usan dos o más pantallas. Los de una sola pantalla van en su carpeta, o en el archivo de la pantalla si no la tiene.
  - `utils/`: cálculo puro, sin React ni Firestore, con su `*.test.js` al lado.
  - `services/`: las lecturas y escrituras de Firestore.
- **Un componente por archivo `.jsx`**, con el nombre del componente en PascalCase. Los helpers chicos que solo él usa van en el mismo archivo, sin exportar.
  - Componentes chicos (unas 50 líneas o menos) e intrínsecamente relacionados pueden compartir archivo, exportados o no: `PayStatePill.jsx` reúne las insignias del estado de pago y `WorkerDetail.jsx` guarda su `MetricCard`. El archivo lleva el nombre del principal.
  - Un componente más grande va en su propio archivo, aunque lo use uno solo.
- **Lo que no es componente va en `.js`**: helpers compartidos, constantes, hooks y las impresiones en HTML. Si un `.jsx` exporta algo más que componentes, Fast Refresh recarga la página entera en vez del componente (`react-refresh/only-export-components`).
- **Un componente dibuja; la lógica va aparte.**
  - El estado y los efectos que forman una unidad (un flujo, una carga, una edición) van en un hook `use<Algo>.js`. El prefijo `use` es obligatorio: el linter de hooks y React Compiler reconocen los hooks por él.
  - El cálculo sin estado va en `utils/`, con tests.
  - Los datos, en `services/`.
- **El estado vive en el componente más bajo que lo necesita**, y sube al padre solo si lo comparten dos hermanos. El buscador o los filtros de una sección son estado de esa sección: si viven arriba, cada tecla vuelve a dibujar el componente entero.
- **Un componente no se define dentro de otro.** Se crea de nuevo en cada render, y React lo desmonta y lo vuelve a montar: pierde su estado y el foco.
- **Tamaños de referencia:** un archivo de más de ~800 líneas o un componente de más de ~400 está haciendo varias cosas. Una sección, un modal o un flujo nuevo que caería en uno así va en un archivo propio de la carpeta.
- **Más de ~10 props desde el padre indican un mal corte**: el estado que usa la pieza debería vivir en ella, o la lógica compartida en un hook o un contexto.
- **Las piezas se importan desde su archivo**, sin un `index.js` que reexporte la carpeta. `services/index.js` es la excepción: reúne los servicios.
- **Dos archivos de una carpeta no difieren solo en mayúsculas** (`workerDetail.js` y `WorkerDetail.jsx`): Windows resuelve `./WorkerDetail` al que encuentre primero.
- **La mayúscula de un import tiene que ser exacta.** Windows no distingue mayúsculas en las rutas, pero el build de Linux del CI sí: un import con la mayúscula equivocada compila local y falla en CI. La carpeta es `components/`, en minúscula.
- **Separar un archivo va en un commit aparte.** El código se mueve tal cual y solo cambian imports y exports, así el diff se revisa como movimiento. Un cambio de lógica va en otro commit.
- **Las piezas de cada pantalla se listan en su sección de este archivo**, agrupadas por área (ver Nómina). Un archivo nuevo en una de esas carpetas se suma a la lista.

### Dónde viven los datos

La base se llama **`hpdatabase`** y **no existe la `(default)`** — varias APIs de
Google asumen `(default)` en silencio, así que hay que declararla en todos lados
(`getFirestore(app, "hpdatabase")` en el cliente, `database:` en los triggers).

Está en **`nam5`**, el multi-región de Estados Unidos: toda lectura de la app
cruza a EE.UU. Lo que corre en el servidor y lee mucho (backups, agregaciones)
va en `us-central1`, pegado a la base. En Santiago quedaría cerca de los
usuarios y lejos de los datos.

Se consulta con `firebase firestore:databases:get hpdatabase`.

### Auth

- Firebase Email/Password.
- Perfiles en colección `users` de Firestore (doc id = Firebase uid).
- Roles: `admin` y `user`; cualquier otro valor cuenta como usuario (`roleLabel` en `utils/userAccounts.js`).
- `ProtectedRoute` envuelve rutas autenticadas; prop `adminOnly` restringe a admins.
- `Login` redirige a la app cuando `user` ya está cargado en `AuthContext`.
- **Sin perfil, o con `disabled: true`, la cuenta no entra.** `user.access` vale `"none"` o `"disabled"` y `ProtectedRoute` muestra `NoAccess` con el correo de la cuenta, que es lo que necesita un admin para darle acceso desde Usuarios. Si leer el perfil falla, la app entra igual como usuario y las reglas deciden qué datos ve.
- Al abrir la app, `AuthContext` guarda en el perfil el `email` de la cuenta y `lastSeenAt` (`userPrefsService.recordVisit`). Es lo que muestra Usuarios: el navegador no puede listar las cuentas de Authentication.
- **`AuthContext` vuelca el doc `users/{uid}` entero en `user`**, así que cualquier campo que se le agregue queda disponible en toda la app sin pagar una lectura extra.

### Saludos personalizados / easter eggs

- `utils/greetings.js` — `GREETING_SLOTS` (los nombres de las ranuras) y `greeting(user, slot, fallback)`.
- **El texto nunca va en el código.** Vive en `users/{uid}.greetings[slot]`, se carga desde Usuarios → Saludos, y cada usuario solo lee el suyo. Hardcodearlo deja el mail de una persona real en el repo, y fuera de contexto un chiste interno puede leerse como cualquier otra cosa.
- Cuesta **0 lecturas**: el doc ya viene con el perfil. No hay colección aparte ni consulta al abrir el modal.
- Un texto vacío o en blanco cuenta como "sin saludo" — borrar el easter egg es vaciar el campo, no eliminarlo del documento.
- Ranuras en uso: `workerAlreadyInLabor` (tag del trabajador ya agregado, en `WorkerPickerModal`), `profileHover` (tooltip del nombre en el header), `notFound` (la 404) y `removeDayBlocked` (línea extra al final del aviso que impide quitar un día del ciclo, por jornadas o por vueltas de transporte). Para sumar otra: declararla en `GREETING_SLOTS` y describirla en `GREETING_FIELDS` (el editor de Usuarios), leerla con `greeting()` donde toque, y cargar el texto desde Usuarios.

### Servicios / Services

- `services/firestoreBase.js` exporta `createService(entityName, collectionName)` — factory CRUD.
- Servicios invalidan caché en memoria y escriben logs de auditoría via `services/logger.js`.
- `list()` soporta `cache: true` con TTL (60s default); `persist: true` guarda en `localStorage`.
- Para batched updates usar `writeBatch(db)` directo (chunks de 450 — el límite Firestore es 500).
- **`update`, `upsert` y `remove` cuestan una lectura además de la escritura**: hacen un `getById` interno para armar el `before` del log de auditoría. `create` no lee.
- **`remove` de un documento que ya no existe no borra ni escribe log**: un log de `delete` siempre trae el `before`, y de ahí sale su `meta`.
- **`upsert(id, data, { before })`** deja pasar el documento que el llamador ya leyó y se saltea ese `getById`. `undefined` = "no me lo pasaron, leelo"; `null` = "lo leí y no existe". La diferencia decide si el doc se crea con `createdAt`/`createdBy`, así que **no se puede colapsar en un chequeo de verdad/falsedad** — escrito `knownBefore ? …` el ahorro desaparece sin que nada falle a la vista. Fijado en `tests/e2e/upsert-before.test.js`, que lo observa pasando `null` sobre un doc que sí existe (única forma de ver desde afuera si la lectura ocurrió).
- **`countedList(service, opts)`** (en `services/cache.js`) envuelve un `list()` y devuelve `{ data, reads }`, con `reads: 0` cuando salió de la caché. Es lo que alimenta los contadores de lecturas de Dashboard, Calendario y Pesajes QR. Las opciones que se le pasan tienen que ser **exactamente** las de la llamada real: reconstruye la clave `collection::{wheres,order,take}`, así que si divergen el contador miente en vez de avisar.
- Nuevos servicios: agregar a `services/index.js` exports si son consumidos transversalmente.

### Caché aditiva

- `firestoreBase` soporta `additive: true` en `create`/`update`/`upsert`/`remove` — en vez de invalidar la entrada de caché correspondiente, la **muta in-place** (append / patch / filter). Útil cuando una colección se lista entera (sin `wheres`) y la queremos mantener fresca sin pagar el costo de re-leer todos los docs.
- `workersService` (en `services/index.js`) está envuelto para usar `additive: true` por defecto en todas las mutaciones — alta de trabajador no invalida la lista en caché.
- Helpers internos: `mergeListItem`, `removeListItem` (sólo tocan claves de caché con `wheres` vacío).

### Contexts

- Orden en `App.jsx`: `ThemeProvider` → `AuthProvider` → `CatalogsProvider` → `CarriersProvider` → `BrowserRouter`.
- `CarriersProvider` precarga transportistas; expone `carriers`, `activeCarriers`, `addCarrier`, `updateCarrier`, `softDeleteCarrier`, `restoreCarrier`.
- `CatalogsProvider` precarga tablas de lookup usadas en las pantallas.

## Convenciones / Conventions

- Organización de componentes, hooks y archivos: ver "Componentes y archivos" en Arquitectura.
- ESLint: variables sin usar empezando con `A-Z_` son ignoradas.
- **Idioma.** Los textos de la interfaz, los comentarios y las descripciones de los tests (`describe`/`it`) van en español neutro, sin voseo. Los identificadores, nombres de archivo, claves y valores técnicos y los campos nuevos de Firestore van en inglés, aunque el código de alrededor use nombres en español. Los campos ya guardados (`faenaId`, `padron`) conservan su nombre.
- **Los comentarios y la documentación describen lo que hace el código, como si siempre hubiera sido así.** No cuentan la historia (el error que motivó un cambio, la versión anterior, lo que se descartó), ni planes o estados transitorios, ni fases o tareas por nombre. Si el código ya lo dice, no se comenta. Una restricción se escribe como comportamiento ("compara el rol sin distinguir mayúsculas"). Vale también para este archivo y los README.
- **Mayúsculas de lo que se escribe a mano** (`utils/textCase.js`, con tests). Se corrigen al guardar, no mientras se escribe:
  - **Nombres de registros como título** (`toTitleName`): faena, ubicación, subfaena, labor y su agrupación, quincena, transportista (nombre y alias), centro de costo, alias de empresa, ficha de Información y Cuentas, faena, labor y lugar del Libro de Precios, y la nota de anticipos y bonos. Los conectores van en minúscula ("Poda y Amarre de Parrones") y los artículos solo después de "de"/"del" ("Fundo Los Robles", "Quincena de la Cosecha"). Lugar y destino de las vueltas pasan por `titleCase` en `transportsService`.
  - **Notas libres**: `unshout` solo las corrige si vienen **enteras en mayúsculas** (pasan a oración). Si tienen alguna minúscula, se respetan. Cubre las notas de faena, subfaena, ciclo, día del ciclo, transportista, vuelta, abono, resumen, quincena, factura y pago de factura, ficha y Libro de Precios.
  - **Quedan fuera a propósito**: la razón social (es el nombre legal del SII), el titular y el giro de las fichas (se copian al banco y al SII), el alias de los vehículos (las vueltas lo guardan como texto y dejarían de calzar), los líderes de grupo (se comparan como texto: `CHILENOS`, `EXTRANJEROS`) y los nombres de trabajadores (`toProperName`, con su propio flujo).
  - Al editar un ciclo, el prefijo "Faena/Subfaena/" de su etiqueta se reconoce sin distinguir mayúsculas, porque un ciclo antiguo puede traerlo en mayúsculas.
- **Un formulario en un modal avisa antes de perder cambios.** `Modal` recibe `dirty`: con cambios sin guardar, cerrar por el ✕, Escape o el clic afuera muestra "Cambios sin guardar" (Seguir editando / Descartar cambios), y cerrar o recargar la pestaña muestra el aviso del navegador. El "Cancelar" del formulario es un `ModalCloseButton`, que pasa por el mismo aviso; un `onClick={onClose}` directo se lo salta.
  - `dirty` sale de `hasChanges(cómoSeAbrió, valoresActuales)` (`utils/formChanges.js`, con tests), que compara lo que se ve: vacío, `null`, `false` y una fila en blanco valen lo mismo, y `150000` es igual a `"150000"`. Lo que no es dato del formulario va en `ignore` (el tipo elegido en un alta, respaldos internos como los `bd_prev*` de la ficha del trabajador).
  - Mientras se guarda, `dirty` va en `false`: el modal lo cierra quien guardó.
  - El modal no guarda la copia inicial: la arma cada formulario, con `useState(valores)` en el primer render, desde las props, o en el mismo efecto que llena el formulario.
  - Escape cierra solo el modal de arriba, y el clic afuera cuenta solo si también empezó afuera: arrastrar una selección desde un campo hasta el fondo no cierra.
  - Conectado en las fichas y formularios de edición: trabajador (y el alta desde el selector de trabajadores), Cheques y pagos, anticipos y bonos, faena, subfaena, ciclo y labor, anotación del día, bonos, configuración del día y líderes por defecto de la grilla, vuelta, transportista, quincena, gasto informal, notas de una factura, prefijo QR, pesaje, ficha de Información y Cuentas, link, Libro de Precios, cuenta nueva, saludos, perfil e indicadores. En la grilla móvil del ciclo cada campo se guarda al salir de él, así que solo avisa por lo que se está escribiendo.
- **La fecha de hoy (`YYYY-MM-DD`) sale de `localIsoDate()`** (`utils/dates.js`), nunca de `toISOString().slice(0, 10)`: esa da la fecha en UTC, y en Chile desde las 20 o 21 h ya es el día siguiente. Una marca de tiempo completa (`paidAt`, `createdAt`) sí va con `toISOString()`, porque es un instante y no un día.
- **Las imágenes que se copian o descargan salen siempre en el tema claro**, sea cual sea el tema de quien las genera: `captureFullWidthBlob` / `captureFullWidthDataUrl` (`utils/imageCapture.js`) le ponen al clon fondo blanco y redefinen las variables `--color-*` con `LIGHT_PALETTE`. Esa lista es copia de `:root` en `index.css`, y un test (`imageCapture.test.js`) falla si se separan.

## Tipos de Labor / Labor Types

Definidos en `src/utils/laborTypes.js` (`LABOR_TYPES`). Viven ahí y no en `CycleDetail.jsx` porque el form de crear ciclo también necesita la lista: importarla desde la pantalla del ciclo arrastraría ese módulo entero —más de 6.000 líneas, ag-grid incluido— al chunk de Faenas, que es justo la pantalla que se abre al entrar a la app. Cada labor tiene un campo `type` que determina columnas del grid, entrada de datos y métricas:

| Tipo / Type | Etiqueta / Label | Comportamiento del grid / Grid behavior | Forma de datos / Data shape |
|------|-------|---------------|------------|
| `main` | Pago al día | 1 columna/día, monto `$` directo | `workdays: { amount }` |
| `supervision` | Supervisión | Igual que main / Same as main | Igual / Same |
| `extra` | Adicional | Igual que main / Same as main | Igual / Same |
| `cosecha` | Cosecha | Multi-columnas por día (calidad × envase); toggle detalle/resumen | `workdays: { qualityX, containerY, qty, amount }` |
| `trato` | A trato | Multi-precio por día (`t0`, `t1`, ...); toggle `/unid` vs `/día` por tier; toggle detalle/resumen | `dayPrices: { t0: { price, mode }, t1: ... }`, `workdays: { qty, amount, tiers? }` |
| `tratoHE` | Jornadas con horas extras | Columnas: D, HE, M, S, X, `$`; toggle detalle/resumen | `workdays: { qty, overtimeHours, hasManejo, hasSupervision, extras, amount }` |

El tag `main` se renderiza como **"al día"** en métricas y tabs.

### trato — multi-precio por día

- Precios almacenados como `dayPrices[laborId][date]` = `{ t0: { price, mode }, t1: ... }`.
- Legacy `{ price, mode }` o `{ "0_0": { price, mode } }` se normaliza automáticamente al cargar.
- Workdays con tiers: `wd.tiers = { t0: { qty, amount }, t1: ... }`. Helper `getTratoTierTotals(wd)` suma todos los tiers.
- Toggle `/unid` (qty × precio) vs `/día` (precio fijo) por tier — botones segmentados.

### tratoHE

- `baseDayDefault`, `bonusManejo`, `bonusSupervision`, `overtimeRate` en la definición de labor.
- Config por día: `{ price, mode: "normal"|"overtimeOnly", isHoliday }`.
- `effectiveDayPrice` usa `||` (no `??`) para que `price: 0` herede del `baseDayDefault`.

### cosecha

- Combos = calidad × envase, almacenados como `dayPrices[laborId][date]` con claves `${x}_${y}`.
- Catálogos globales para `qualities`, `containers` — editables via ⚙ Catálogos.
- **Unidad mostrada en métricas** sale del envase del catálogo, no de un literal "kg". Helper `cosechaUnit(catalogs, containersSet)` en `utils/cosechaCombos.js`: si todos los workdays del scope usan el mismo envase (`Saco`, `Kilo`, `Caja`…) devuelve su label; si hay mezcla cae a `"Unid."`. Aplica en Calendar, CycleSummaryModal, WorkerSummaryModal y los comprobantes de Payroll.
- **Unidad mostrada para trato** sale de `catalogs.tratoTypes` via `tratoTypeLabel(catalogs, labor.tratoType)` — ej. una labor a trato configurada como "Poda" muestra `4.737 poda` en vez de `4.737 trato`. Si una grilla mezcla varios `tratoType` en el mismo ciclo cae al genérico "Trato".

### tratoEtapas — qué ve el trabajador vs qué cuenta la empresa

`counts` decide qué unidades se le **facturan al cliente**: una unidad física se
cobra una sola vez, por etapas o como completo. **No decide qué produjo la
persona.**

- **Vistas del trabajador** (resumen de producción, comprobante de efectivo,
  detalle de pago): muestran el `qty` de **todas** las etapas, con desglose por
  etapa y **solo el nombre** — nunca el rótulo `(no cuenta)`. Es una distinción
  de facturación de la empresa, y al lado de la producción de alguien se lee
  como que su trabajo no vale. El rótulo del helper vive en `stageTag`.
- **Vistas de la empresa**: ahí `counts` manda y se rotula. `getEtapasTotals`
  devuelve `unidades` solo de las etapas que cuentan; el resumen por faena de
  `CycleSummaryModal` (`formatRowMetric`) marca `(no cuenta)`; el tooltip de la
  grilla del ciclo también. Igual el conteo de personas del
  `ProductionSummaryModal` y el resumen por día de la barra de precios.

La regla vive en un solo lugar, los helpers `describeStage` y `stageTag`
(`utils/tratoEtapas.js`), que usan todas estas vistas.

### Piso (bono para trato/cosecha)

Bono adicional configurable por día para trato y cosecha. Pensado para compensar a los trabajadores cuando la producción del día fue baja. Siempre **suma** al monto de producción, no lo reemplaza (no es un floor en sentido estricto).

- **Opt-in por día, sin default a nivel labor.** En el panel de Precios cada día tiene un botón discreto **"+ piso"** que solo está visible si el día no tiene piso configurado. Al click pasa a modo edición; al guardar muestra inline el monto con acciones ✎ editar / ✕ quitar. Mantiene la UI limpia: días sin piso no tienen ruido.
- **Persistencia del default por día**: `dayPrices[laborId][date].piso: number`. Helper: `getDayPiso(dayPrices, laborId, date)`, `effectivePiso(labor, dayPrices, date)` (este último solo lee el día — no hay fallback a labor).
- **Persistencia del workday**: workday separado con `comboKey: "_piso"` y `pisoOnly: true`. `qty: 0`, `amount: pisoAmount`. Un doc por (worker × date × labor). Hereda el `payrollId` como cualquier otro workday — al borrar la nómina, queda disponible nuevamente.
- **Asignar el piso a todo un día de una**: junto al monto del piso, en el panel de Precios, un botón **👥 a todos (N)** con el contador de quiénes tienen producción y todavía no tienen el bono. **Pide confirmación** con el monto por persona, cuántas son y el total — es plata que se suma a cada una. Escribe exactamente los mismos workdays `_piso` que apretar los toggles uno por uno; queda deshabilitado cuando no falta nadie.
- **Quién cuenta como "tiene producción"**: `pisoTargets(workdaysDeLaLabor, date)` en `utils/cosechaCombos.js`. Alcanza con que **exista** el workday, sin mirar `qty` ni `amount` — es el mismo criterio que habilita el toggle de la grilla, y un día en cero es justamente el caso que el piso compensa. Que las dos vías usen la misma regla es lo que hace que el botón sea equivalente a apretar todos los toggles habilitados; si divergen, el botón hace algo que no se puede replicar a mano. Un piso sin `pisoOnly` se detecta por la clave del mapa.
- **Quitar el piso del día se lleva también los bonos ya asignados.** El ✕ (y dejar el monto en cero) **pide confirmación** con cuántos bonos se eliminan y por cuánto.
- **Los bonos que ya se llevó una nómina no se tocan**, ni por el ✕ ni por el toggle individual: borrar un workday con `payrollId` le descuadra el total a algo que ya se pagó. El diálogo dice cuántos quedan en pie y por qué; el toggle avisa por toast. El reparto lo hace `pisoAssigned(workdaysDeLaLabor, date)` → `{ libres, liquidados }`. Es el único chequeo de `payrollId` de la pantalla: para todo lo demás, el corte es el cierre del ciclo (ver más abajo).
- **El piso NO se bloquea en labores sincronizadas por QR**: es un bono manual, vive en un workday aparte (`comboKey: "_piso"`) y la sincronización escribe combos de producción, así que nunca lo pisa.
- **UI grilla**: la columna "P" 🪙 al final del día solo se renderiza cuando ese día tiene piso configurado en `dayPrices` **o** algún trabajador tiene un workday `pisoOnly` para ese día (computado en `daysWithPiso`). Días sin piso quedan sin columna extra. Click en el toggle crea/borra el workday `_piso` con el monto efectivo. El toggle está deshabilitado si no hay workday de producción todavía para ese (worker, date).
- **Cálculo**: total del trabajador = producción + suma de pisoAmount. Reflejado en row.total del grid, métricas de la labor, CycleSummaryModal, WorkerSummaryModal, drawer del Calendar, comprobantes de Payroll.
- **En Cobrar (CycleSummaryModal mode=cobrar)**: el piso NO se factura al cliente (es bono al trabajador). Se muestra en la tabla pero no entra al subtotal a cobrar.
- **En `aggregateWorkerAmounts`**: el monto del piso fluye naturalmente porque `wd.amount` ya carga el valor; no requiere lógica especial.

## Faenas / Ciclos / Cycles

- Jerarquía: Faena → Subfaena → Ciclo → Labors → Workdays.
- Label de ciclo = prefijo bloqueado `Faena/Subfaena/` + sufijo editable.
- Estados: `open` | `closed`. Se permiten **múltiples ciclos abiertos** por (faena, subfaena) — útil para correr varios frentes en paralelo o para "carve off" temporales.

### Alta encadenada: subfaena → primer ciclo → primer día

- **Crear una subfaena ofrece crear su primer ciclo** (modal "¿Crear el primer ciclo?", cancelable con "Después"). Una subfaena sin ciclos no tiene dónde anotar jornadas, así que quedarse ahí no es un estado útil.
- **El ciclo nace con la fecha de inicio como primer día** (`days: [startDate]`), así la grilla abre con una columna. Mismo criterio en `createNextCycle` (el ciclo que se encadena al cerrar el anterior).
- **La primera labor: se elige el tipo**, no siempre `main`. Más un checkbox para sumar de una una labor de **Supervisión**, que es la combinación habitual. El checkbox se deshabilita si el tipo elegido ya es `supervision` — si no, el ciclo nacería con dos labores idénticas.
- El plan lo arma `initialLaborPlan({ type, withSupervision })` (`utils/laborTypes.js`), que devuelve descriptores **sin `id`**: el id lo pone quien crea el ciclo, que es el que ya tiene el generador. El nombre sale del tipo, salvo `main`, que se llama **"Principal"**.
- Los trabajadores que se pasen van **solo en la primera labor**; la de supervisión arranca vacía.
- El bloque del tipo de labor **no se muestra con la importación activa**: ahí las labores salen del ciclo origen y elegir un tipo no tendría efecto.
- **Un solo botón de alta de subfaena por estado**: el del encabezado de la faena (y el del estado vacío, que viene con la explicación).
- `CycleRow` permite **✏ Renombrar**, abrir, cerrar y eliminar.

### Ciclo cerrado = congelado

- **Cerrar un ciclo es la señal de "esto ya está pagado y revisado": queda de solo lectura para todos, admin incluido.** Para corregir algo hay que **reabrirlo** con el botón del encabezado — un cambio de estado visible, con confirmación, y que queda en el log de auditoría.
- **El corte es el cierre del ciclo, NO el `payrollId` del workday.** Se paga a mitad de ciclo y después se sigue trabajando ahí para revisar detalles y generar diferencias; bloquear por "ya pagado" rompería ese paso. Por la misma razón el cierre es manual y no se dispara solo al pagar.
- **Toda escritura de `CycleDetail` pasa por `cycleWrite` / `wdWrite`**, dos envoltorios locales que llaman a `assertOpen()` antes de tocar Firestore. El guard vive en un solo punto y no repartido por los ~40 llamados al servicio: basta uno que se olvide para que el candado sea un adorno. **Lanza** en vez de devolver en silencio, porque los llamadores actualizan el estado local justo después de escribir — si dejara seguir, la pantalla mostraría un cambio que nunca se guardó.
- Quedan fuera del guard a propósito, y son las únicas cuatro: las dos escrituras de normalización del loader (corren al montar, no son edición del usuario) y cerrar/reabrir el ciclo, que es el gesto que levanta el candado.
- Banner 🔒 sobre la grilla explicando que está congelado y cómo reabrirlo. La línea del encabezado dice `🔒 ciclo cerrado (solo lectura)`, sin distinguir rol.
- **Reabrir no está restringido a admin**: cualquiera que vea el botón levanta el candado. El cierre evita ediciones por accidente; no es un permiso.
- **Cerrar de una vez lo ya pagado** (desde Nómina, `screens/payroll/CloseCyclesModal.jsx`): al marcar una nómina pagada, si alguno de sus ciclos quedó pagado por completo se ofrece cerrarlo ahí mismo; y en Generar, "🔒 Cerrar pagados (N)" junta todos los ciclos abiertos en esa situación. Vienen todos marcados y se puede destildar.
  - **Pagado por completo** (`settledOpenCycles`, `utils/cycleClosing.js`, con tests): algo pagado, nada pendiente, y todo lo que entró a nómina está en nóminas pagadas. Sale de los totales que Nómina ya calcula por ciclo (`takenByPayroll` + `splitTaken`), sin lecturas extra.
  - **Un ciclo que sigue en una nómina sin pagar no se ofrece**: si después se sacara de esa nómina, su plata volvería a quedar pendiente dentro de un ciclo cerrado, que Generar ya no muestra. Se ofrece al marcar esa nómina pagada.
  - Cerrar escribe lo mismo desde las tres pantallas (Faenas, el ciclo y Nómina): `closedCyclePatch`, el estado y las fechas de lo trabajado.

### Importar desde otro ciclo abierto

Al crear un ciclo nuevo, si en la misma subfaena hay al menos un ciclo abierto, el form muestra una sección **"Importar desde un ciclo abierto"**. Es opt-in:

- **Ciclo origen**: select con los ciclos abiertos del ámbito (más reciente primero).
- **Labores a clonar**: checkboxes — copia config completa de cada labor seleccionada (incluyendo tratoType, modos, baseDayDefault, overtimeRate, etc.) con un nuevo `id`.
- **Días a importar**: chips toggleables con las fechas de `cycle.days[]` del origen (default todos). Definen tanto la `days[]` del nuevo ciclo como el filtro de fechas para mover workdays / copiar precios.
- **Copiar precios por día** (opcional): copia las entradas de `dayPrices` re-keadas por el nuevo `laborId` y filtradas por días seleccionados.
- **Mover jornadas** (opcional, destructivo): para cada (labor seleccionada × día seleccionado), lee los workdays del origen y los re-crea en el nuevo ciclo con el nuevo `docId` (que encodea cycleId+laborId), luego borra los originales. Workdays con `payrollId` se saltan para no romper snapshots de nómina ya generadas — el usuario recibe un alert con el count de skipped.

Implementación en `submitCycle` (Faenas.jsx). El mapeo `oldLaborId → newLaborId` vive en un `Map` que sirve para re-keear tanto `dayPrices` como los `docId` de workdays movidos.

### CycleDetail — grid

- **Undo (Ctrl+Z)**: stack en memoria (`undoStackRef`), pushea cada edición de celda, revierte y re-graba en Firestore.
- **Navegación tipo Excel**: `singleClickEdit: false`. Flechas mueven el foco entre celdas; **Enter** entra a editar; al confirmar, salta a la fila siguiente (`enterNavigatesVertically*: true`).
- **Secciones colapsables** persistidas en `localStorage` para liberar espacio vertical: métricas (`cycleDetail.metricsCollapsed`), precios (`cycleDetail.pricesCollapsed`), sidebar global (`layout.sidebarOpen`).

### Alto de las listas / grids

- **Regla**: la lista va `min-h-0 flex-1` dentro del `flex h-full flex-col` de la raíz y toma el alto que queda libre (Advances, Workers). Sin alto fijo ni control para arrastrarlo.
- Si la lista tiene algo debajo, eso va con `shrink-0` y un `max-h` propio, y la lista lleva además un alto mínimo para que no desaparezca en pantallas bajas: es el caso de la vista previa de Nómina, con el panel de efectivo abajo (`min-h-[240px] flex-1`). Cuando no cabe, desplaza el `<main>`.
- **Anotación por día**: click sobre el header de la fecha → modal que edita `cycle.dayNotes[date]`. Hover sobre el header muestra el texto. Compartida entre todas las labores del ciclo.
- **Trabajadores temporales**: alta sin RUT (`isTemp: true` dentro de `labor.workers`). Aparecen con badge "T" y botón "Asignar RUT" que los reemplaza por el RUT real preservando los workdays.
- **Sueldo mensual por trabajador-ciclo**: toggle "M" en la fila de la labor → guarda `monthly: true` en `labor.workers[i]`. Las celdas pasan a checkbox de asistencia (`amount: 0`, `attendanceOnly: true`); excluidos de la nómina; badge verde "M".
  - Disponible en las labores al día (`main`, `supervision`, `extra`) y en `tratoHE` (`allowsMonthly` en `CycleDetail`, mismo criterio en el modal del teléfono). En `tratoHE` tampoco se pagan horas extras ni bonos: el día es solo asistencia, igual que en las demás.
  - Una fila mensual no recibe montos por ningún camino: ni edición, ni rellenar hacia abajo, ni pegar, ni deshacer (`dispatchCellChange`).
  - **Marcar mensual a alguien que ya tiene días con monto pide confirmación** (`toggleMonthly` → `monthlyConfirm`). Si no, la grilla mostraría ✓ en esos días y sus montos se seguirían pagando sin que se note. El diálogo ofrece pasar a asistencia en $0 los días que todavía no están en una nómina (base, HE y bonos en cero en `tratoHE`) o dejar los montos. Los días que ya tienen `payrollId` no se tocan: cambiarlos descuadra una nómina generada.
  - `toggleMonthly` lee las jornadas de `workdaysRef` y no del estado: las columnas de la grilla guardan el handler de un render anterior.
- **Personas por día en las labores al día**: cada tarjeta de "Precios por día" muestra cuántas personas tienen jornada ese día, contando la asistencia de los mensuales.
- **`rutToName`**: las celdas del grid muestran el nombre desde un map derivado del cache de workers, no desde el snapshot del ciclo — editar el nombre en `/workers` se refleja sin recargar.
- **Loader de workdays trato**: `ck` se deriva del docId, no del payload. 5 segmentos → `ck = parts.slice(4).join("__")`; 4 segmentos + labor trato → `"t0"`; resto → `makeComboKey(qualityX, qualityY)`.
- **Diálogos**: nunca usar `window.prompt/confirm/alert` dentro del grid — usar `<Modal>` + `<ConfirmDialog>` para mantener el estilo.
- **Trabajadores huérfanos**: un workday cuyo `workerRut` no está en `labor.workers[]` (porque el trabajador fue removido de la labor pero el workday quedó vivo) se inyecta en la grilla con badge "Huérfano" en la celda del nombre, para que se vea y se pueda corregir desde la misma vista en lugar de quedar invisible pero contando en métricas/payroll.
- **Doble click sobre la celda del RUT** abre `WorkerEditModal` para editar los datos del trabajador sin salir del ciclo. Filas temporales (`_isTemp`) y de header se ignoran.

## Transports / Transporte

- Pantalla: `src/screens/Transports.jsx` (el componente de la ruta y sus pestañas) — 5 pestañas:
  1. **Transportistas** — gestión de carriers. Click en una tarjeta abre la pestaña Vueltas filtrada por ese transportista (cualquier ciclo), donde sus vueltas se editan o eliminan con `TripEditModal` reutilizado (con input de fecha libre cuando se invoca sin lista `days`). Ahí se filtra por transportista, estado, ciclo, faena y desde qué fecha (por defecto, los últimos 90 días). Las vueltas pagadas no permiten editar/eliminar (consistente con `tripsService.update`/`remove`).
  2. **Vueltas** — listado y CRUD.
  3. **Pago por faena** — selecciona ciclos activos + rango de fechas → genera un `paymentSummary` por transportista con sus vueltas pendientes.
  4. **Resúmenes / Pagos** — historial; marcar pagado, revertir, imprimir uno a uno **y también imprimir varios en lote** (botón `🖨 Imprimir varios` → modal `PrintMultipleModal` con filtros estado/fechas/transportistas/faena-subfaena y dos acciones: 🖨 imprimir todos en una ventana con `page-break-after`, o 📦 descargar ZIP con un PNG por resumen vía `jszip` + `html-to-image`). En `PaymentDetailModal` el `Valor` **no** se edita inline: se edita la vuelta completa (qty/tarifa) con el lápiz, que abre `TripEditModal` — así el monto nunca queda desincronizado de N° vueltas × tarifa. La columna **Vehículo** está incluida en el `PrintableSummary`. Si el resumen tiene **abonos**, el `PrintableSummary` los lista al pie de la tabla (fecha, monto y nota) y cierra con el **PENDIENTE** (total de las vueltas − abonos), o "PAGADO" si el resumen ya se pagó: es lo que copia, descarga o imprime el transportista. En `PaymentDetailModal` recibe los abonos del estado local, así cambia apenas se agrega, edita o quita uno. Cada abono se corrige con ✏️ (monto, fecha y nota) mientras el resumen siga pendiente: `paymentsService.updateAbono` conserva su `id` y su `createdAt`/`createdBy` y suma `updatedAt`/`updatedBy`.
  5. **Quincenas** — agrupan varios resúmenes (`transportPayments`) en un payroll (`transportPayrolls`) para pagar en bloque. Modal **+ Nueva quincena** (`PayrollCreateModal`): se eligen fechas y chips de faenas, y auto-lista los transportistas que tienen vueltas sueltas (sin `paymentId`, status `pending`) en el rango — todos vienen tildados por default y se puede destildar individualmente; sección aparte para **importar resúmenes existentes sueltos** (status no pagado, sin `payrollId`) que se superpongan con el rango. Al confirmar crea un `payment` por cada carrier nuevo y llama a `transportPayrollsService.create({ paymentIds: [...nuevos, ...importados] })` que tagea cada resumen con `payrollId`. El nombre de la quincena se guarda como título (`toTitleName` en el servicio, al crear y al renombrar): "quincena 16-31 de octubre" → "Quincena 16-31 de Octubre". **Vista tabla** en `PayrollDetailModal`: `PrintablePayrollTable` (off-screen) renderiza `# | Transportista | Vueltas | Período | Estado | Total` + fila de totales en verde estilo Excel — capturada por `html-to-image` para los botones 📋 Copiar / 📥 PNG / 🖨 Imprimir. La tabla visible incluye columna `Acciones` (💰 Pagar / ✕ Quitar / ↶ Revertir) ocultable según el estado de la quincena.
- Sus piezas, en `src/screens/transports/`:
  - **Transportistas:** `CarriersTab` y `CarrierEditModal`.
  - **Vueltas:** `TripsTab`.
  - **Pago por faena:** `FaenaBatchTab`.
  - **Resúmenes:** `PaymentsTab`, `BalanceSummary` (balance general), `PaymentSection` (la lista por transportista), `PaymentDetailModal`, `UnifiedSummaryModal`, `GenerateSummaryModal`, `PrintMultipleModal` y `PrintableSummary`.
  - **Quincenas:** `PayrollsTab`, `QuincenasBalanceSummary`, `CarrierSummariesModal`, `PayrollCreateModal`, `PayrollDetailModal`, `PayrollMetaEditModal`, `PrintablePayrollTable` y `TypeToConfirmModal` (confirmar un pago o su reversión escribiendo una palabra).
  - **Comunes:** `transportPayrolls.js` (`compactDate`, `paymentSplit`, `comparePayrollPeriod`), `printStyles.js` (celdas de las tablas imprimibles) y `historyRange.js` (los 90 días por defecto de las listas).
- **Balance de quincenas** (`QuincenasBalanceSummary`, arriba de la pestaña Quincenas) — pivot de transportistas × quincenas. Dos filtros independientes: las **columnas** dejan fuera las quincenas pagadas enteras (`status: "paid"` o sin ningún item pendiente), y las **filas** dejan fuera, por default, a los transportistas que ya cobraron todo lo suyo. El toggle **☐ Todos los resúmenes** levanta el segundo: una quincena con aunque sea un item pendiente se muestra completa, con los que ya cobraron incluidos. El de las columnas no cambia — una quincena cerrada no aparece en ningún modo.
  - Sirve para cuadrar una quincena antes de cerrarla ("cómo viene"), no para decidir a quién pagar ("qué falta"), que es el default. Persistido en `localStorage` (`transports.quincenasBalance.showAll`).
  - **El título cambia con el modo** (`Balance de quincenas pendientes` ↔ `activas`) y viaja al PNG, a la impresión y al nombre del archivo. No es cosmético: una imagen rotulada "pendientes" con filas ya pagadas adentro es como un transportista termina cobrando dos veces.
  - En modo "todos" se muestran las filas con $0 pendiente. En los dos modos queda afuera el transportista sin pendiente *ni* pagado: son los resúmenes en $0 (vueltas sin costo de transporte propio), que, si no, saldrían como filas en blanco.
  - **Click en el nombre del transportista → `CarrierSummariesModal`**: todos sus resúmenes agrupados por quincena, con pendiente/pagado por grupo, o sea de dónde sale el monto de cada celda. Incluye los resúmenes **sueltos** (sin `payrollId`), que en el balance no aparecen, y rotula "Quincena eliminada" cuando el `payrollId` apunta a una quincena que ya no existe.
  - **`paymentSplit(p)` decide cuánto de un resumen está cobrado**, y vive suelto porque lo usan la tabla y el modal: si cada uno lo calculara a su manera, el modal contradiría a la fila que lo abrió. Un `paid` está cerrado entero; si sigue pendiente, los abonos cuentan como cobrado (capados al total) y el resto es deuda.
  - **Mobile (`< md`) no muestra el pivot: muestra una lista ordenada por deuda.** Con el nombre y el total fijos (265 px), a 412 px entra una sola columna de quincena. Cada tarjeta abre el mismo modal que el nombre en desktop, así que el desglose por quincena no se pierde.
    - El pivot queda `hidden md:block`. Ese `display: none` **no rompe las exportaciones**: `captureFullWidth*` clona el nodo de `printRef` y lo cuelga de su propio contenedor, así que lo que le pase al padre le da igual. Los botones 📋/📥/🖨 andan desde el teléfono y sacan la tabla completa.
  - **Objetivo de ancho (desktop): que entren 8 quincenas sin desplazarse** (`QUINCENA_COL_W` 92 + `CARRIER_COL_W` 150 + ~115 del total ≈ 1.000 px). **El ancho lo decide el contenido del encabezado, no el `minWidth`**: `compactDate` muestra el rango como `16-04-26` en dos líneas (en ISO, `2026-04-16 → 2026-04-30` ocupa ~145 px en una línea) y el nombre se envuelve.
  - **Columnas fijas** (`stickyLeft`/`stickyRight`): el nombre y el Total quedan quietos al desplazar el pivot. Tres detalles: el fondo de la celda fija es **opaco** (si no, se transparenta lo que pasa por debajo) y **de color** (en blanco se lee como un hueco); la línea de corte es un `box-shadow` y no el borde, porque con `border-collapse: collapse` el borde es compartido y se va con la celda que se mueve; y `printRef` lleva `minWidth: max-content`, si no el bloque blanco mide lo que el contenedor y la tabla se sale por la derecha.
  - Las celdas fijas no afectan las exportaciones: la captura clona a `width: max-content` con `overflow: visible`, así que sin contenedor de scroll se comportan como cualquier otra.
  - **🖨 Imprimir de este balance imprime la captura PNG, no el `outerHTML`** — es la excepción al patrón del resto de la pantalla: el navegador no pagina de costado, y un pivot más ancho que la hoja perdería las quincenas de la derecha. Reusar `captureFullWidthDataUrl` hace que las tres salidas muestren lo mismo; se pierde el texto seleccionable del PDF y se gana que salga completo. **Siempre una hoja y apaisado**: `max-height: 100vh` escala la imagen al área de página en vez de desbordar a una segunda, y el `@page { size: landscape }` va al nivel superior y no dentro de `@media print` porque anidado hay navegadores que lo ignoran. Partir el balance en dos hojas obliga a cruzar transportistas de una con quincenas de la otra, que es lo que la tabla existe para evitar.
- **Balance general** — sección en la cabecera de la pantalla: rango de fechas + filas por transportista (viajes − pagos). Bumpea `balanceVersion` al pagar/revertir para refrescar. Botón **🖨 Imprimir balance** abre ventana de impresión.
- Modal: `src/components/TransportsModal.jsx` — usado en `CycleDetail` para asignar viajes rápidos. Incluye un sub-modal **+ Nuevo transportista** que crea un carrier inline y lo auto-selecciona junto con su primer vehículo (sin salir del modal de viajes). El selector de transportista del `TripEditModal` es un **combobox searchable** (`CarrierCombobox`) con typeahead sobre alias/nombre/aliases-de-vehículo, sección "RECIENTES" arriba (últimos 6 carriers usados en este ciclo, persistido en `localStorage` `transports.recentCarriers.{cycleId}`), navegación con flechas + Enter, y auto-select del primer (o único) vehículo del carrier elegido.
- Servicios: `services/transportsService.js` exporta `tripsService` (alias `transportsService`) y `paymentsService` (alias `transportPaymentsService`).
- **Totales derivados (invariante)**: `transportPayments.total` y `transportPayrolls.total` son denormalizaciones. El detalle imprimible (`PrintableSummary`) suma las vueltas **en vivo**, mientras que el **Balance de quincenas** (`QuincenasBalanceSummary`) y la tarjeta de la quincena leen el campo guardado — si el `amount` de una vuelta cambia y nadie refresca el campo, las dos vistas muestran montos distintos para el mismo transportista. La propagación vive en el servicio, **no en las pantallas**: `tripsService.create/update/remove` llaman `recalcPaymentTotal()` (que además saca del `tripIds` los IDs de vueltas borradas) y este llama `recalcPayrollTotal()`. `editSummaryTrips`, `updateTotal` y `deleteSummary` también propagan hacia la quincena. Los documentos con `status: "paid"` están congelados y no se recalculan.
  - **Nada queda vacío.** Si al borrar una vuelta su resumen pendiente se queda sin vueltas, el resumen se elimina (salvo que tenga abonos: son pagos ya hechos). Eliminar un resumen lo saca de la lista `paymentIds` de su quincena, y una quincena pendiente que queda sin resúmenes se elimina (`recalcPayrollTotal` con `pruneMissingPayments` y `dropIfEmpty`). Los borrados automáticos quedan en la auditoría con `meta.auto` `"emptySummary"` o `"emptyPayroll"`. "Quitar del resumen" (`editSummaryTrips`) **no** elimina el resumen aunque quede vacío: se hace con el resumen abierto, y ahí mismo se le pueden agregar otras vueltas. Fijado en `tests/e2e/transporte-totales.test.js`.
  - **No agregar recálculos manuales en las pantallas**: todo camino que edita una vuelta (pestaña Vueltas, modal del ciclo, modal del resumen) pasa por el servicio, que ya propaga.
- Contexto: `CarriersContext` precarga transportistas; expone CRUD con soft-delete.
- **Auditoría por transportista**: los logs de `transport` / `transportPayment` llevan `meta.carrierId` denormalizado (helper `carrierMeta()` en `transportsService.js`) — sin eso no se puede preguntar "qué le pasó a las vueltas de este transportista", porque un log de `update` solo guarda el diff y el `entityId` es el de la vuelta. Mismo patrón que `extractRefMeta` (workerRut/cycleId) en `firestoreBase.js`. Lo consume `Audit.jsx → fetchSatelliteLogs`: al elegir un transportista en "Buscar por registro" se suman sus vueltas y resúmenes al historial de la ficha. Los recálculos automáticos de total quedan logueados con `meta.auto = "recalcTotal"`. **Un log sin `meta.carrierId` no aparece** en esa vista.
- Tipos de viaje: `regular` (Vuelta), `approach` (Acercamiento) — definidos en `TRIP_KINDS`.
- Tipos de transportista: `own` (Propio), `contracted` (Contratado) — definidos en `CARRIER_TYPES`.
- Trips: `{carrierId, vehicleAlias, cycleId, faenaId, subfaenaId, date, kind, qty, rate, amount, lugar, destino, personCount, notes, status, paymentId}`.
- Payments: `{carrierId, periodFrom, periodTo, tripIds[], total, status, paidAt, notes}`. Marcar como pagado pone los trips referenciados en `status: paid`.

## Trabajadores / Workers

- Pantalla: `src/screens/Workers.jsx`.
- **Búsqueda client-side sobre la lista cacheada** (única fuente de datos). Al montar la pantalla, `ensureAllForModal()` trae la lista completa via `workersService.list({ cache: true, persist: true, ttl: 2h })` — primera carga ~500-2000 reads, después gratis hasta que vence el TTL. El filtro es substring acentos-insensitive sobre nombre y RUT (sin puntos/guiones), gated por `MIN_SEARCH = 2`. Permite buscar por apellido o dígitos del RUT en cualquier posición. `searchWorkers` (búsqueda por prefijo en el servidor) se usa solo en autocompletes chicos (`Advances`, `GroupSummaryModal`).
- Auto-detect badge **RUT** vs **Nombre** (basado en `detectQueryKind`: empieza con dígito → RUT).
- **Filtros opcionales** (componibles con la búsqueda): dropdown 👥 Líder (con opción "— Sin líder —" + lista única extraída del dataset completo) y chips toggle 💵 Efectivo / 🏦 Transferencia. Los filtros ignoran el gate de `MIN_SEARCH` — activar cualquiera muestra resultados aunque la query esté vacía. Al editar/eliminar/togglear banco desde la grilla, `refreshCache()` re-trae la lista para reflejar el cambio.
- Acciones por fila: 📊 Resumen, Editar, ✕. La forma de pago se muestra como **indicador informativo** (`💵 Efectivo` / `🏦 Transferencia`) — no es toggle. El cambio de banco se hace adentro de `WorkerEditModal`, que tiene un botón **🆔 Asignar Cuenta RUT** que setea Banco Estado + Cuenta RUT en un click usando el RUT del trabajador.
- **Click sobre un RUT lo copia al portapapeles**: el del trabajador, y en escritorio también el RUT de pago. Va con puntos y guion, el mismo formato que copia Información y Cuentas. En el teléfono el RUT de la tarjeta lleva 📋 para que se note que se puede tocar.
- **Los IDs QR son de solo lectura en la ficha del trabajador** (`WorkerEditModal`, que también se abre desde la grilla del ciclo). Se asignan en Cosecha QR con `assignQrCode`, que le quita el código a quien lo tenía y actualiza el padrón de `qrPrefixes` con que la app de escaneo resuelve un QR sin señal. Al guardar, la ficha no escribe `idQr`: viene de la caché de 2 h y podría pisar una reasignación hecha en Cosecha QR. Un trabajador nuevo nace con `idQr: []`.
- **Doc id = RUT con que se creó la ficha**, y es el id estable (`workerId`). El RUT vigente está en el campo `rut`, que puede diferir si se corrigió una cédula (ver `docs/data-model.md`).
- **Se cruza por el id y se muestra siempre `worker.rut`.** Una jornada, un item de nómina o una entrada de labor guardan el RUT del momento en que se crearon, y ese valor sigue siendo la clave de los cruces. Para mostrarlo se pasa por `currentRutResolver(workers)` (`utils/workerRut.js`), que lo traduce al vigente con la lista de trabajadores ya cargada, sin lecturas extra. Lo usan Nómina (vista previa, detalle, impresiones, XLSX y Pagos anteriores, que además agrupa por `workerId`), la grilla del ciclo (`_displayRut` en las filas) y Pesajes QR.
- Bank details = `[paymentRut, accountNumber, accountType, bankCode]` (orden importante).
- `services/workersService.js` expone `findWorkerByRut`, `createWorker`, `deleteWorkerSafe`, `searchWorkers` (server-side prefix), `detectQueryKind`.

### Líder de grupo — estricto

- `worker.groupLeader` es un array (historial); `groupLeader[0]` es el líder actual.
- Lista curada en la colección **`groupLeader`** (`groupLeadersService`) — `{ name, habilitado }`. La idea es no dejar que la lista crezca con valores ad-hoc.
- Edición del trabajador (`WorkerEditModal`): el **dropdown** ofrece los líderes que ya tienen asignados los trabajadores (`groupLeader[0]` de la lista cargada), no la colección `groupLeader`, más la opción "+ Crear nuevo líder", que requiere acción explícita. La colección curada la usa la agrupación por líder de la grilla del ciclo (`loadEnabledLeaders`).
- Al guardar: si el valor no está en la lista de líderes existentes y no se eligió "crear nuevo", error.
- En Payroll preview el líder es **read-only** (estrictamente lo del worker).

## Nómina / Payroll

- Pantalla: `src/screens/Payroll.jsx` (el componente de la ruta y el paso Generar). Ruta `/payroll`.
- Sus piezas, en `src/screens/payroll/`:
  - **Generar:** `CycleSelector`, `PreviewTable`, `PayConfirmModal`, `InstallmentConfirmModal`, `ProgressOverlay` y `CloseCyclesModal` (cerrar los ciclos ya pagados).
  - **Historial:** `HistoryList`, `PayStatePill` (con `PaymentDatesLine` y `PortalBadge`) y `payState.js`.
  - **Detalle:** `PayrollDetailModal`, sus filtros (`FilterChips`) y sus modales (`AddCyclesModal`, `AddWorkerDaysModal`, `RecalcModal`, `CashEstimationModal`, `RenamePayrollModal`). El detalle de pago de una persona: `WorkerDetailRow`, `WorkerPaySummaryCards` y `WorkerPaidDetailTables`, con `workerDetailLabels.js`.
  - **Pagos anteriores:** `WorkersHistory` (con `FaenaFilterPopover`), `WorkerDetail` y `WorkerPayrollDetailModal`.
  - **Impresiones en HTML:** `printCommon.js`, `printReceipts.js` (comprobantes de efectivo y detalle de pago) y `printSummaryTable.js`.
  - **Comunes:** `helpers.js` (formatos de fecha y de cuenta, RUT vigente).
- Servicio: `services/payrollsService.js` (colección `payrolls`).
- Helpers: `utils/payroll.js` — `aggregateWorkerAmounts`, `splitBankAndCash`, `groupCashByLeader`, `validateAccountNumber`, `downloadBchileXlsx`, `downloadNominaOnlyXlsx`.

### Flujo

1. **Generar** — selector de ciclos activos agrupados por faena. Cada ciclo muestra lo pendiente, lo **🕓 en nómina** (en una nómina generada que todavía no se marca pagada) y lo **✓ pagado** (en nóminas marcadas pagadas), calculados desde workdays. **Estar en una nómina no es estar pagado**: `taken`/`takenByPayroll` es lo que entró a cada nómina, y `splitTaken` (`utils/cycleClosing.js`) lo separa según el estado de cada una. Al chequear un ciclo con más de una labor, debajo aparece **"Labores a pagar"**: una fila por labor con su casilla, las personas y lo pendiente de esa labor (`unpaidByLabor` de `cycleStats`). Destildar una la saca de la nómina, y el monto del ciclo pasa a ser lo de las elegidas, con "de $X" debajo. Default: todas seleccionadas. Workdays de labores excluidas quedan disponibles para una nómina futura (no se taggean). Si el usuario destilda todas las labores, el ciclo se marca con "⚠ Sin labores seleccionadas", no aporta workdays al preview y no entra a la nómina. La elección se guarda en `cycleDetails[].laborIds` para que Recalcular no traiga después lo que quedó afuera (ver "Agrandar una nómina pendiente").
   - **Personas sueltas** ("+ Agregar persona"): los días puntuales de alguien, elegidos en el mismo modal que en el detalle de una nómina. Se suman a lo que traen los ciclos, así que una nómina se puede armar solo con personas, o con personas además de ciclos y labores. Los días que ya entran por un ciclo elegido se ven incluidos y sin casilla. Un ciclo que entra solo por estos días queda con `laborIds: []`, y solo si la persona quedó incluida en la vista previa. Los ciclos de la nómina los arma `newPayrollCycleDetails`.
   - **Los días de las personas se releen al continuar** (`workdaysForNewPayroll` en `payrollsService`): el modal pudo quedar abierto un rato y otra nómina pudo tomar alguno. Lo que la relectura muestra tomado queda afuera —aunque la caché de un minuto de los ciclos lo diera libre— y se avisa.
   - **🔒 Cerrar pagados (N)**: aparece cuando hay ciclos abiertos pagados por completo, y los cierra de una vez (ver "Ciclo cerrado = congelado"). Marcar una nómina pagada ofrece lo mismo para sus ciclos.
   - **La selección de ciclos se guarda entre sesiones (`localStorage`) y la de labores no.** Un ciclo marcado sin entrada en el mapa de labores cuenta con todas, y así se muestra. Un ciclo marcado que después se cerró ya no entra, porque no aparece en la lista para poder desmarcarlo.
2. **Preview** — agrega por trabajador, cruza con `worker.bankDetails`, busca anticipos pendientes y los aplica.
   - Filtros: 🏦 Banco, 💵 Efectivo, ⚠ Datos faltantes, ⚠ Cuenta sospechosa, 👥 \<líder\>.
   - Bulk actions sobre el subset visible: incluir/excluir, → Efectivo / → Banco.
   - Columnas: Bruto (read-only), Anticipo (editable), A pagar (= bruto − anticipo, override manual), Pago (toggle banco/efectivo).
3. **Generar y guardar** — crea la nómina, etiqueta workdays con `payrollId`, marca anticipos como `applied`, y escribe un **snapshot JSON** inmutable en `payrollSnapshots/{payrollId}`. El archivo no se descarga al generar: se baja cuando se quiere desde 📥 Descargar → JSON, en el detalle.

**El período de cada ciclo en la nómina** (`cycleDetails[].firstDay/lastDay`, la columna Período de los resúmenes y del XLSX) va del primer al último día que la nómina le paga, sacado de sus jornadas (`withPaidPeriods`, `utils/payrollItem.js`), no del ciclo entero: un ciclo que se paga en dos nóminas muestra en cada una sus propios días. Se arma al generar y se pone al día al recalcular y al agregar ciclos o personas, donde solo crece. El snapshot acompaña.

**Recalcular también trae los nombres vigentes** de cada ciclo: su etiqueta y los nombres de su faena y subfaena (`withLiveNames`), en `cycleDetails`, `cycleLabels` y el snapshot. La vista previa muestra lo que cambió en "Ciclos actualizados" (`cycleDetailChanges`), y eso solo ya cuenta como cambio. Los nombres que se editan en "📝 Editar encabezados" (`cycleLabelOverrides`) no se tocan. La etiqueta sale del ciclo, y renombrar una subfaena no cambia la de sus ciclos ya creados: el prefijo "Faena/Subfaena/" sigue con el nombre anterior hasta que se edita el ciclo.

### Snapshot JSON (`payrollSnapshots`)

- Colección separada de `payrolls` para no inflar los docs del historial.
- Lo escribe `payrollSnapshotsService` en el mismo flujo de "Generar y guardar".
- Se baja desde el detalle de la nómina: **📥 Descargar → JSON**.
- El schema es **contrato externo** con el portal público de trabajadores (otra app, ver "Portal de trabajadores"): cambiarlo coordinadamente.
- **Escribir, borrar y releer el snapshot viven en `services/payrollSnapshots.js`** (`saveSnapshot`, `deleteSnapshot`, `readSnapshot`). Los `catch` silenciosos son deliberados: el snapshot es un derivado y que falle no puede tumbar la generación ni el borrado de la nómina, que son las operaciones que mueven la plata. `readSnapshot` saca el `id` que inyecta Firestore (el JSON es contrato externo) y, si el doc no existe, lee el campo `snapshot` embebido en la nómina. También viven ahí las formas de ciclo, jornada y anticipo (`snapshotCycleOf`, `snapshotWorkdayOf`, `snapshotAdvanceOf`), que usan todos los caminos que escriben el JSON, y los ajustes al achicar, agrandar o recalcular la nómina (`pruneSnapshot`, `extendSnapshot`, `syncSnapshotAfterRecalc`). Renombrar sigue en `Payroll.jsx` como llamada directa al servicio.

### Portal de trabajadores

- El portal (repo `portalTrabajadoresHP`, GitHub Pages) muestra **una nómina por vez**: cada trabajador ingresa su RUT y ve su detalle de pago.
- **Se publica desde el detalle de una nómina: 🌐 Publicar en portal**, en el encabezado del detalle (solo admin). El historial marca con **🌐 Portal** la nómina publicada, y el botón dice **🌐 Actualizar en portal** cuando ya lo está. Sirve para volver a publicarla después de editarla.
- Lo hace el job `publishPortal` (`functions/portal.js`), que lee el snapshot de `payrollSnapshots` (o el embebido en la nómina) y el nombre y estado vivos de `payrolls`. Escribe:
  - **una ficha por trabajador** en `portalPayslips/{rut}`, con el RUT normalizado (`12345678-9`) como id;
  - la cabecera en `portalMeta/current`;
  - y borra las fichas de quienes no están en la nómina nueva.
- Cada ficha es el JSON de la nómina **recortado a esa persona**: sus jornadas (ligadas también por `workdayIds`, por si guardan un RUT anterior), sus anticipos y bonos, y los ciclos donde trabajó (sin `dayPrices`). No trae correo ni RUT de pago, y de la cuenta solo los últimos 4 dígitos (`buildPortalPayslips`).
- **Reglas**: las dos colecciones se leen sin sesión y de a un documento (`get`). Listar queda para un admin, que es lo que usa la Consola para contarlas. Nadie las escribe desde la app: solo la función, con el admin SDK. Así el portal no expone la nómina entera, como pasaba con el `data.json` estático.
- El portal las lee con la API REST de Firestore, sin SDK ni API key. Una ficha cuyo `payrollId` no es el de la cabecera cuenta como "no encontrado".

### Anticipos en comprobantes

- En el resumen **individual** del comprobante (no en el resumen por grupo), si **algún** trabajador del grupo trae `advance > 0`, se renderiza una columna **Anticipo** entre los ciclos y el TOTAL.
- Filas: monto en color tierra `#b45309` con signo "−" o "—" cuando es 0.
- Subtotal: suma de anticipos del grupo, mismo formato.
- Gate: `groupHasAdvance = g.items.some((it) => Number(it.advance) > 0)` — si nadie del grupo descontó, la columna no se renderiza.
- Aplica tanto en modo "cash" (`rows`) como en modo "detail" (`rowsNoSign`).

### Anti doble pago

- Workday lleva `payrollId`, `payrollTaggedAt`, `payrollTaggedBy`, `paidAt`, `paidBy`.
- **Los días en $0 entran a la nómina**: `aggregateWorkerAmounts` los mete en
  `workdayIds`, así quedan etiquetados y las cifras de "pagado / pendiente" del
  ciclo cierran. Es el caso de los días de asistencia de un **sueldo mensual**
  (`attendanceOnly: true, amount: 0`), que se marcan como pagados aunque no
  generen transferencia. Las dos salidas los filtran solas: `buildBchileRows` por
  `amount > 0`, y el comprobante de efectivo saca a los de bruto **y** neto en
  cero — el corte es por bruto, así que quien produjo y quedó en cero porque un
  anticipo se llevó todo SÍ aparece en la hoja que firma el líder.

### Pago en dos tiempos (transferencias / efectivo)
Para cuando salen las transferencias y el efectivo queda debiéndose para la vuelta siguiente.
- **🏦 Solo transferencias** (`markBankPaid`) sella `paidAt` **solo en los workdays de banco** y escribe `bankPaidAt`/`bankPaidBy`. La nómina **sigue `pending`** — no está pagada entera — así que ninguna comparación `status === "paid"` de la app cambia de significado. Revertible con `revertBankPaid`.
- **La deuda no se guarda**: se deriva siempre con `pendingCashOf(payroll)` / `pendingCashItemsOf(payroll)` (exportadas por `payrollsService`). Devuelven 0/[] si la nómina está pagada entera **o si no tiene el flag** — una nómina recién generada tiene `cashTotal > 0` pero eso no es deuda vencida. **No agregar un booleano `cashPending`**: sería derivable y podría quedar desincronizado de los items.
- **`cashPaidRuts`** registra a las personas de efectivo que cobraron sueltas (toggle por persona y por líder en `PayrollDetailModal`). Se descuentan de la deuda pero **no** estampan `paidAt` en sus workdays: ese campo significa "la nómina se marcó pagada" y darle un segundo significado obliga a un camino de des-estampado. `markPaid` los sella a todos al final.
- **`markPaid` sobre una nómina con el flag** sella solo los workdays de efectivo (re-estampar los de banco les pisaría la fecha real de la transferencia). `bankPaidAt` **no se borra** al pagar: queda como registro. `markPending` sí lo borra, junto con `cashPaidRuts`.
- **Guards**: con `bankPaidAt` puesto la nómina no se puede editar ni eliminar (`assertEditable` en el servicio + chequeo en `onDelete`). Sacar un trabajador de banco liberaría sus días y le restauraría anticipos a alguien que ya tiene la plata en la cuenta.
- **Dónde se ve**: pill de 3 caras y filtro "💵 Efectivo pendiente" en el Historial, con el día en que salieron las transferencias (`bankPaidAt`) y el del pago final (`paidAt`), y lo mismo en el encabezado del detalle (la barra de totales cuenta como pendiente solo lo realmente adeudado); "Falta entregar" en el tile 💵 del detalle; línea informativa en **Generar → paso 1**; y el `CashEstimationModal` puede sumar el efectivo pendiente de otras nóminas para que el conteo de billetes y sencillo cuadre, igual que la tabla del Resumen del detalle (con el selector de efectivo pendiente). Una nómina ya pagada no ofrece ninguna de las dos: ya entregó su efectivo. **Los sobres y detalles NO se fusionan** — cada nómina imprime lo suyo.
- Workdays con `payrollId` se filtran del preview (no entran a otra nómina).
- Eliminar nómina → `untagWorkdaysFromPayroll` + `restoreAdvancesFromPayroll`. Workdays vuelven a estar disponibles. Achicarla (sacar ciclos, labores o un trabajador, recalcular) tiene sus propias reglas — ver la sección siguiente.
- Marcar pagada → sello `paidAt` en los workdays. Revertir → quita `paidAt`.

### XLSX (BChile)

Generado con ExcelJS (lazy import). Cuatro hojas:

1. **Nomina** — formato BChile (RUT con DV pegado, nombre limpio sin acentos, cuenta, código banco, monto, JUV/CTD/AHB). Es la **primera hoja** porque es la que el portal del banco ingiere.
2. **Resumen** — Transferencias / Efectivo / Total general por ciclo.
3. **Transferencias** — `RUT | NOMBRE | <Ciclo1> | ... | TOTAL` con totales por ciclo.
4. **Efectivo** — agrupado por líder con paletas de color por grupo (8 paletas alternadas) y subtotales.

Al pie del detalle de una nómina, junto al total, van dos menús (el mismo `RowMenu` del historial con un botón propio): **🖨 Imprimir** (detalle de pago y comprobantes de efectivo; no aparece si no hay nada que imprimir) y **📥 Descargar** (XLSX completo, Sólo Nómina y JSON). El detalle abre con el resumen desplegado y los ciclos plegados (se despliegan solos con "✂ Editar contenido"); los dos se pliegan y despliegan con un clic. Los filtros son un buscador, el medio de pago y un panel "Filtros" con Grupo y Ciclo, cuyos filtros activos se ven como etiquetas con ✕ aunque el panel esté cerrado. La sección "Ciclos de esta nómina" lleva en cada ciclo un enlace **Abrir ciclo ↗** a `/cycles/:id`.

Descargas e impresiones:
- **🏦 Sólo Nómina** → `downloadNominaOnlyXlsx` (1 hoja, para subir al banco).
- **📥 XLSX completo** → 4 hojas.
- **🧮 Estimar efectivo** (bajo el efectivo del resumen del detalle) → `CashEstimationModal`: cuántos billetes y monedas hay que llevar. Se marcan los disponibles (billetes de $20.000, $10.000, $5.000, $2.000 y $1.000; monedas de $500, $100, $50 y $10); por defecto, $10.000, $5.000, $1.000, $500 y $100 (`DEFAULT_AVAILABLE`). Cada monto se arma con la menor cantidad de piezas disponibles y, si no calza justo, sube al siguiente que sí se puede armar (`estimateCashBreakdown`, `utils/cashBreakdown.js`, con tests). La elección no se guarda: cada vez abre con los de por defecto. Se copian, como texto o como imagen, el resumen y la lista **por trabajador** (cuánto recibe cada uno y con qué billetes y monedas, por líder, con el total de piezas al pie). Los dos dicen de qué nómina son y, si incluyen efectivo pendiente de otras nóminas, cuánto y de cuáles; esas personas van en la lista en un grupo aparte por nómina.
- **🖨 Imprimir → Comprobantes efectivo** → ventana de impresión, una página por líder con tabla firmable (RUT, Nombre, Monto, Firma) + líneas de firma final.
- **🖨 Imprimir → Detalle de pago** → ventana de impresión más completa. Abre con un **Resumen por subfaena** (filas = subfaena, columnas `Faena | Subfaena | Con cuenta RUT | Efectivo | TOTAL`, la faena se imprime sólo en la primera fila del bloque); luego el **resumen por grupo** estructurado como 2 tablas grandes (`Con cuenta RUT` y `Otros grupos`) con columnas `Líder | Faena | TOTAL` y subtotal al pie de cada una; finalmente la tabla por líder con el detalle de producción por ciclo. En el header de cada grupo se incluye el nombre del líder con un `h1` más grande para que el inicio de cada grupo se vea claramente al imprimir.
- **Catálogos en el detalle imprimible**: los precios bajo el día y los breakdowns de celda usan labels del catálogo (no `Q1/E2` ni `/jorn.`). Para cosecha: `Premium / Saco: $1000` (o `$1000/saco` en single-combo). Para trato: `$10000/poda` (la unidad = `tratoTypeLabel`). Para `tratoHE` no se muestra precio sugerido en el header del día (el monto del día lo define la planilla). `byCombo` se indexa por clave estructural `"x_y"` y el label visible se computa al render con `comboLabel(catalogs, x, y)`.
- **paymentRut vs RUT del trabajador**: la hoja `Nomina` BChile usa **`it.paymentRut`** (de `bankDetails[0]`), no el RUT de la persona. `paymentRut` puede diferir cuando el pago va a una cuenta de un familiar; el portal del banco lo valida contra la titularidad. Preservado en `cleanItems` y en el snapshot.
- **Email default BChile**: si el trabajador no tiene email se completa con `remuneracionesis@gmail.com` (constante `BCHILE_DEFAULT_EMAIL` en `utils/payroll.js`). El banco rechaza filas sin email.
- **Identificador alfa-numérico**: la columna identificador del BChile usa `A001..A999` (zero-padded) y los nombres se ordenan alfabéticamente con `localeCompare("es", { sensitivity: "base" })`. Filas con `amount === 0` se filtran (el banco rechaza transferencias de $0).
  - **Las filas se arman en `buildBchileRows(items)`, aparte de ExcelJS** (`utils/payroll.js`, exportada). `buildBchileSheet` solo las escribe y estiliza. Así se prueban sin el workbook las tres reglas que deciden a dónde va la plata: el filtro de cero-neto, el orden alfabético que hace **estable** el correlativo entre corridas, y el `paymentRut || rut`. Cubiertas en `utils/bchile.test.js`, que nombra los índices de columna — una fila corrida manda la transferencia a otra cuenta y el archivo igual se sube sin error.

### Achicar una nómina pendiente (sacar ciclos, labores o un trabajador, recalcular)

**La regla: la nómina tiene que quedar igual que si se hubiera armado sin lo que se le sacó, y cada anticipo tiene que reflejar exactamente lo que esa nómina le descuenta.** Sin registros nuevos, sin anticipos marcados como cobrados por una nómina que no los retuvo. La lógica vive en `utils/payrollItem.js`, con tests en `utils/payrollRefit.test.js` y `tests/e2e/sacar-ciclo-anticipos.test.js`.

- **Sacar ciclos o labores es recalcular sin ellos.** En el detalle, con "✂ Editar contenido", la sección de ciclos muestra cada ciclo con sus labores, las personas, las jornadas y lo que paga cada una (`payrollCycleBreakdown`; los montos por labor salen de las jornadas del snapshot). Se destildan ciclos enteros o labores sueltas, varios a la vez, y nada se escribe hasta "🔄 Recalcular sin esto": la barra de abajo dice cuánto bruto se saca. El recálculo muestra la vista previa con lo que se saca primero.
  - Lo sacado llega como `removed`: Map(cycleId → `true` o un Set de labores). Sus jornadas no entran al recálculo aunque estén etiquetadas (`isRemovedFromPayroll`), y el recálculo las suelta. Destildar todas las labores de un ciclo es sacarlo entero.
  - `cycleScopeAfterRemoval` deja los ciclos al día: el ciclo entero sale de `cycleIds`, `cycleLabels` y `cycleDetails`; a uno que pierde labores le queda la lista de las otras en `laborIds`, así un Recalcular posterior no las vuelve a traer.
  - No deja la nómina sin ciclos ni sin nadie: para eso se elimina la nómina.
  - El botón "🔄 Recalcular" de arriba hace lo mismo: si hay algo destildado, lo saca.
- **El cálculo y la escritura viven en `services/payrollRecalc.js`**, no en la pantalla: `planPayrollRecalc(payroll, { cycles, workers, removed })` arma la vista previa sin escribir, y `applyPayrollRecalc(payrollId, plan)` la guarda (`assertEditable` incluido). Así el camino que usa la pantalla es el mismo que prueban los e2e.

- **Quien se queda con bruto 0 sale entero** (`planRecalcExisting`). El corte es por bruto y no por las claves de `byCycle`, que guarda una entrada por **cada** ciclo de la nómina aunque esté en $0: es el mismo criterio que usa "Generar" (`a.total > 0`), y eso deja el resultado "como si se hubiera armado sin eso". Suelta todos sus anticipos **y bonos** de esa nómina (el bono se paga en la nómina donde sí tenga producción) y todas sus jornadas, incluidas las de $0 de otros ciclos.
- **Quien sigue re-encaja lo ya aplicado en su bruto nuevo** (`refitAppliedAdvances`): bonos enteros, anticipos del más viejo al más nuevo topeados por `bruto + bonos` — el mismo orden que `allocateAdvances`, así que se achica primero el más nuevo. Lo que no cabe **vuelve al mismo anticipo**, con su fecha y su plan de cuotas originales.
  - **Solo achica, nunca agranda.** Cada monto ya se validó contra el saldo del anticipo al aplicarlo, así que bajarlo siempre es válido sin mirar cuotas. Si la producción sube, lo ya aplicado no crece solo; un anticipo pendiente lo toma el resto del recálculo como anticipo nuevo.
  - El neto sale como `bruto − anticipos + bonos` **sin ningún `Math.max`**: los anticipos ya se toparon, y un tope ahí haría figurar como cobrado algo que no se retuvo.
- **La fuente de verdad de "cuánto descontó esta nómina" es el `payments[]` del anticipo** (`readPayrollApplications`), no la copia en el item. Es lo mismo que leen el borrado de la nómina y la pantalla de Anticipos. Si el documento del anticipo ya no existe se respeta lo que dice el item (marcado `missing`, no se escribe): descontar de menos por algo que no se puede verificar es peor.
- **`setPayrollAdvanceAmounts(payrollId, targets)`** fija cuánto descuenta UNA nómina de cada anticipo sin tocar lo de otras nóminas; es lo que permite descontar una parte (`restoreAdvancesFromPayroll` solo suelta entero). Reescribe la entrada **en su lugar y con su `paidAt` original** —el hint "última cuota hace N días" sale de ahí, y achicar no es un pago nuevo— y topea contra el saldo que dejan las otras nóminas. Con 0 equivale a restaurar.
- **Recalcular**, además de aplicar los cambios de producción, re-reparte a quien tenga más descontado del que su bruto respalda (`isOverApplied`) y saca a quien quedó con bruto 0.
- **Recalcular etiqueta exactamente las jornadas de los items** y suelta las que le quedaron etiquetadas sin estar en ninguno.
- **Sacar un ciclo o una labor también suelta sus jornadas de $0.**
- **El snapshot acompaña** (`services/payrollSnapshots.js`): sacar un trabajador (`pruneSnapshot`) o recalcular (`syncSnapshotAfterRecalc`) deja el JSON sin quien salió, sin sus jornadas y sin sus anticipos, con la cabecera de totales al día; si se sacó un ciclo, también sin ese ciclo.
- **El modal de detalle sigue a la nómina editada.** Un filtro de Grupo o Ciclo que apunta a algo que ya no está se ignora al filtrar (`activeLeaderFilter` / `activeCycleFilter`). El resumen "Con labores" queda atado al `payroll` para el que se calculó y se recalcula después de cada edición.
- **Limitación conocida**: sacar un ciclo o una labor y volver a agregarlo no siempre deja la nómina igual que antes. Un anticipo que se soltó entero vuelve a aplicarse al agregar (ver la sección siguiente), pero uno que quedó aplicado en parte no crece: lo que se soltó queda pendiente para la próxima nómina en vez de volver a descontarse acá. No se pierde plata; se descuenta después.

### Agrandar una nómina pendiente (agregar ciclos, labores o personas)

Misma regla que achicarla, al revés: **la nómina tiene que quedar como si se hubiera armado con eso adentro.** La cuenta vive en `planAddWorkdays` (`utils/payrollItem.js`) y la escritura en `addWorkdaysToPayroll` (`services/payrollsService.js`): primero el documento, después las jornadas y los anticipos. Tests en `utils/payrollAdd.test.js` y `tests/e2e/agregar-a-nomina.test.js`.

- **Qué labores le pertenecen a la nómina: `cycleDetails[].laborIds`.** Sin el campo, el ciclo entero (por ejemplo, un ciclo agregado con todas sus labores); una lista, solo esas; `[]`, ninguna — el ciclo está solo por días agregados a mano. Lo escriben "Generar" (también por sus personas sueltas), "+ Agregar ciclo" y "+ Agregar persona". `mergeCycleDetails` suma las labores de un ciclo que ya estaba en vez de repetirlo. "Entero" se guarda **sin** el campo: Firestore rechaza `undefined`.
- **Recalcular respeta ese alcance** (`inRecalcScope`): trae lo etiquetado con la nómina, más lo pendiente de las labores que abarca. Las labores destildadas al generar no vuelven a entrar.
- **"+ Agregar ciclo"** elige labores, igual que "Generar". Un ciclo que ya está con algunas labores aparece con las que le faltan; uno que está entero no aparece.
- **"+ Agregar persona"** busca a alguien en el catálogo, carga sus días de ciclos abiertos —de cualquier faena, estén o no en la nómina— y deja elegir cuáles sumar. Los días que ya están en una nómina se ven sin casilla. Antes de confirmar, el pie muestra el bruto, los anticipos que se descuentan y el neto. Un ciclo que entra solo por estos días queda con `laborIds: []`. El mismo modal elige las personas sueltas al generar (ver "Flujo"), sin el pie de anticipos: ahí el reparto sale en la vista previa, junto con lo que la persona traiga de los ciclos.
  - `asPayrollWorker` junta los días y anticipos de la persona bajo la clave que tiene en la nómina: sus jornadas pueden guardar un rut anterior, y sin eso entraría partida en dos items.
  - Los días se **releen al confirmar**: si otra nómina tomó alguno mientras el modal estaba abierto, queda afuera y el aviso lo dice.
- **Quien ya está** suma bruto, jornadas (también las de $0) y su `byCycle` **sumado, no pisado**: el ciclo puede estar ya con otras labores u otros días. Además **se le aplican los anticipos y bonos pendientes que esta nómina todavía no le tocaba**, con el mismo reparto incremental que Recalcular.
- **Quien no está** entra con el reparto completo si su bruto es mayor que 0. Sin bruto no entra, y sus días de $0 siguen pendientes, igual que al generar.
- **Lo que esta nómina ya descuenta de un anticipo no crece** al agregar: re-encajar hacia arriba obligaría a revisar cuotas. Mismo criterio que Recalcular ("Solo achica, nunca agranda").
- **El snapshot acompaña** (`extendSnapshot`): suma ciclos, jornadas y anticipos sin repetir y deja la cabecera al día. `laborIds` **no viaja** al JSON (`snapshotCycleOf` lo saca): es interno y el JSON es contrato externo.
- Los dos modales se montan solo mientras están abiertos, así arrancan con el estado limpio sin un `useEffect` que lo resetee.

### Historial

- Filtros: estado, mes, búsqueda. Totales (Pendiente / Pagado) en header.
- **Una acción principal según el estado** ("✓ Marcar pagada", o "💵 Pagar efectivo" si las transferencias ya salieron; una nómina pagada no lleva) y el resto en el menú ⋯ (`components/RowMenu.jsx`, el mismo de Cheques y pagos): solo transferencias, revertir transferencias, marcar como no pagada, mover a Diferencias, renombrar y eliminar (con cascade que limpia workdays y restaura anticipos).
- Eliminar se ve siempre en el menú: apagado, dice qué hay que hacer antes.
- Toda la fila (en el teléfono, la tarjeta) abre el detalle, que es donde están las descargas. La fecha de creación va bajo el nombre y el efectivo que falta entregar, bajo el estado. El día en que se marcó pagada (`paidAt`) o, en un pago en dos tiempos, el de las transferencias y el del pago final, van en una sola línea en la última columna, junto a las acciones; en el teléfono, bajo el estado de la tarjeta. El encabezado del detalle repite esas fechas.
- El menú ⋯ sigue al botón al desplazar: tocar una fila que se ve a medias desplaza la lista, y si el menú se cerrara con eso no se podría abrir.

## Anticipos / Bonos

- Pantalla: `src/screens/Advances.jsx`. Ruta `/advances`. Nav label: "Anticipos / Bonos".
- Servicio: `services/advancesService.js` (colección `advances`).
- Una colección con discriminador `type: "anticipo" | "bono"`. El valor `"adelanto"` se normaliza a `"anticipo"` al leer (vía `LEGACY_TYPE_MAP`) — no hay tipo separado. Helpers: `ADVANCE_TYPES`, `normalizeAdvanceType`, `advanceSign`, `isBono`, `advanceTypeMeta`.
- **Signo**: anticipo = `-1` (descuenta del bruto), bono = `+1` (suma al bruto). Mismo flow / lifecycle, distinto signo.
- Estados: `pending` | `partial` | `applied` | `cancelled`. `partial` = `amountPaid > 0 && amountPaid < amount` (la siguiente nómina sigue aplicando contra el saldo pendiente).
- Documento: `{type, workerRut, workerName, amount, date, note, status, amountPaid, payments[], appliedPayrollId, appliedAt, appliedBy, installments}`.
- UI: filtros por tipo (todos / anticipo / bono), búsqueda, status. El filtro "Pendientes" agrupa `pending` + `partial` (mismo criterio que `listPendingForWorkers()`) — un parcial sigue debiendo saldo, el badge "Parcial" lo distingue visualmente dentro del mismo bucket, no hay pestaña separada. Dos botones de creación (🪙 + Anticipo, 🎁 + Bono). Cada fila muestra el badge de signo correspondiente.
- Modal de creación con `searchWorkers` para autocompletar trabajador.
- **Lock de Editar/Eliminar**: `applied` (totalmente aplicado) → ambos bloqueados. `partial` → Editar habilitado, Eliminar bloqueado.
- **"Perdonazo" de saldo en parciales**: editar un `partial` permite bajar `amount` hasta `amountPaid` para cerrar la cuenta — el status se recalcula al guardar (`newAmount ≤ amountPaid` → `applied`; `>` → sigue `partial`). El modal muestra banner con Pagado/Resta, bloquea `type` y `worker` (no se pueden reasignar pagos existentes), y valida que `newAmount ≥ amountPaid`. El doc + `payments[]` quedan intactos para auditoría.
- **Cuotas** (`installments: {count, amount, cadence} | null`, solo `type: "anticipo"`): plan de pago en cuotas, elegido al crear (N° de cuotas; el sistema calcula `amount = Math.ceil(total/count)`) y **fijo para siempre** — no editable después (borrar y recrear si hace falta cambiarlo, solo mientras sigue `pending`). `cadence` (`porPago`/`quincenal`/`mensual`) es una **etiqueta informativa para el admin, no un gate automático por fecha** — no hay cron en la app, así que nada se salta solo; ver "Integración con Nómina" abajo. Helpers en `advancesService.js`: `hasInstallmentPlan`, `computeCuotaAmount`, `advanceDueNow`, `installmentProgress`, `cadenceMeta`, `daysSinceLastCuota`.

### Integración con Nómina

- Al construir preview, `listPendingForWorkers(ruts)` carga anticipos y bonos `pending`+`partial` de los trabajadores.
- **Orden: BONOS PRIMERO, anticipos después.** Los bonos se aplican completos (nunca tienen plan) y **engrosan la base** contra la que se descuenta el anticipo: el tope es `bruto + bonos`, no el bruto pelado. Con el orden invertido, un bono deja el anticipo sin liquidar por **exactamente el monto del bono**: el trabajador recibe el bono en la mano y la deuda pasa a la nómina siguiente en vez de cerrarse (bruto 376.000 + bono 24.000 contra un anticipo de 400.000: en este orden queda saldado y neto 0; al revés quedarían 24.000 debiendo y 24.000 pagados). La plata que desembolsa la empresa es la misma en los dos órdenes; lo que cambia es si la deuda queda cerrada.
- Anticipos oldest-first, capados por `bruto + bonos` (no pueden dejar el neto negativo); si el anticipo tiene plan de cuotas, el tope por default es el monto de la cuota (`advanceDueNow`), no el saldo completo — con cuotas un bono puede igualmente no alcanzar a liquidarlo, y está bien.
- **La lógica vive en un solo lugar: `utils/payrollItem.js` → `allocateAdvances`**, y la usan los cuatro caminos que arman o cambian una nómina: armar nómina, agregar ciclos, recalcular (`services/payrollRecalc.js`), y anticipos nuevos sobre una nómina ya creada. El cuarto caso —el incremental, donde la persona ya está en la nómina— es la misma función con `alreadyAdvanced` / `alreadyBonused`. Está cubierta por `utils/payrollItem.test.js`, incluido el caso de bruto 376.000 + bono 24.000 contra anticipo de 400.000.
- Fórmula del item: `amount = grossInt − anticiposTotal + bonosTotal`.
- Preview muestra columnas separadas **Bruto**, **Anticipo**, **Bono**, **A pagar**. Hint visual `↩ liquidado por anticipo` cuando `amount = 0 && advance > 0` (caso retiro con anticipo del valor total — el worker pasa a nómina como cero-neto pero los workdays/anticipos se marcan como pagados). El override manual de la celda Anticipo puede superar la cuota sugerida hasta el saldo real del anticipo (`maxAmount` en `anticipoApplications`, ver `updatePreview`).
- **Confirmación de cuotas**: si hay anticipos-con-plan entre los trabajadores incluidos, al hacer clic en "Generar nómina" aparece `InstallmentConfirmModal` listando cada cuota candidata (marcada por defecto) antes de persistir nada — el admin decide a mano cuáles aplican esta corrida. Solo cubre el flujo principal de generación; "agregar ciclos"/"recalcular" aplican la cuota sugerida directo, sin modal.
- Al crear nómina: `applyAdvancesToPayroll(advanceIds, payrollId)` cambia status a `applied`/`partial` según corresponda (para ambos tipos).
- **`payments[]` guarda lo descontado, no lo pedido.** `amountPaid` se capa con
  `Math.min` contra el total del anticipo; si a `payments[]` va el monto pedido,
  los dos dejan de cuadrar y `restoreAdvancesFromPayroll` —que recalcula el saldo
  **desde `payments[]`**— devuelve un anticipo tocado por dos nóminas con menos
  deuda de la real. `applyAdvancesToPayroll` devuelve `{ sobrantes }` con las
  aplicaciones recortadas y las escribe en el log (`meta.sobrantes`): al
  trabajador se le retuvo lo pedido pero la deuda solo bajó lo aplicado, y esa
  diferencia hay que devolvérsela a mano.
- Al eliminar nómina: `restoreAdvancesFromPayroll(advanceIds)` recalcula el status hacia atrás (`pending`/`partial`) — también recalcula sola la fecha base del hint "última cuota hace N días", que se deriva de `payments[]` en vez de guardarse aparte.

## Bancos

- `src/utils/banks.js` define `BANKS`, `ACCOUNT_TYPES`, helpers (`bankName`, `isCashBank`, `defaultBankDetails`, `isCuentaRut`).
- Banco "Efectivo" tiene `code: "EFE"` (constante `CASH_BANK_CODE`). Filtrado del XLSX BChile.
- `bankDetails = [paymentRut, accountNumber, accountType, bankCode]`.
- `defaultBankDetails(rut)` → Cuenta RUT (Banco Estado).

## Resúmenes / Summary modals

- `components/CycleSummaryModal.jsx` — modos **Pagar** y **Cobrar**, day-by-day por labor. Las tarifas de cobro y los títulos editables se guardan en Firestore (`cycleSummaries/{cycleId}`, ver `docs/data-model.md`) **compartidos entre usuarios**; localStorage es un espejo local, y si un ciclo no tiene doc en Firestore, al abrirlo se migra desde ahí. Después del resumen general agrega una **infografía por labor con grilla `Trabajador × Días`** (`LaborWorkerGrid`): nombre+RUT, una columna por fecha con qty grande + monto chico, totales `Total qty` y `Total $` por trabajador, fila `Total día` al pie. Cada labor tiene sus propios botones `📋 / 📥 / 🖨` (capturan solo esa sección via `ref` propio); los botones globales del modal capturan todo (general + grillas). El CSS de impresión incluye `thead { display: table-header-group }` para que el encabezado se repita en cada hoja nueva cuando la tabla excede una página. Sólo se rinden las grillas en modo `pagar` (cobrar es por tarifa pactada).
  - **Columnas del `LaborTable` (resumen por faena)**: además de Detalle/Fecha/Métrica/Valor/Valor total/Transporte/Total, al final se agrega `Personas` (cantidad de trabajadores únicos del día) para todas las labores. Para **tratoHE** la columna "Valor" se reemplaza por **`Total HE`** = `HE_hrs × labor.overtimeRate` (informativa, no editable), y al final se agrega **`Bonos`** = `amount − base − HE×tarifa` (derivado, incluye manejo + supervisión + extras agregados de todos los trabajadores del día). Sat/Dom + feriados del labor en rojo + bold en la columna Fecha (sólo tratoHE; usa `isRedDay` + `getDaySingle(dayPrices, ...)`).
  - **Modo Cobrar editable inline**: cada fila de `LaborTable`/`TransportTable` muestra inputs editables (`<input type=number>`) en las celdas de Cantidad/HE/Valor/Valor total. El `Total HE` y `Bonos` no son editables (son derivados). Los overrides se persisten por ciclo en `cobrar.labors[laborId].rowOverrides[date] = { qty?, overtimeHours?, rate?, amount? }`. Vaciar un input vuelve al valor base. También se pueden **agregar filas manuales** ("+ Agregar día / ajuste manual") que se guardan en `cobrar.labors[laborId].extraRows[]` con un `id` único; arrancan con `qty/rate/amount = ""` (no `0`) para que el `computedAmount = qty × rate` se aplique en cuanto el usuario tipea — si arrancaran en `0`, el override `amount=0` bloquea la multiplicación y la fila queda en `$0`. Aparecen mezcladas en la tabla con badge `(ajuste)` y botón `✕` para eliminar. Para labores `trato`, las filas extra **heredan la `unit` dominante** del labor (la más frecuente entre las filas regulares) para que `formatRowMetric` muestre "X saco" en vez de solo "X". Mismo modelo para transportistas (`cobrar.carriers[carrierId].rowOverrides/extraRows`). El `grandTotalCobrar` usa `chargedTotals.amount` (con los overrides aplicados).
  - **Candado 🔒 Bloqueado / ✏️ Editando (solo modo Cobrar)**: control segmentado en la barra superior; `editMode` **arranca en `false`** (bloqueado). Bloqueado = el resumen no se toca: sin inputs por fila, sin botones `+`/`✕`, y los paneles "Personalizar títulos", "Editar tarifas cobro" e "Importar ciclos anteriores" ni se muestran. En Editando se renderiza una **marca de agua "EDITANDO — NO ENVIAR"** (componente `EditingWatermark`) *dentro* del nodo `printRef`, para que marque cualquier screenshot manual, y **📋 Copiar imagen / 📥 Descargar PNG / 🖨 Imprimir quedan bloqueados**: abren un `ConfirmDialog` con acción "Bloquear y copiar/descargar/imprimir" que apaga `editMode` y recién después captura (espera dos `requestAnimationFrame` — capturar en el mismo handler sacaría el DOM viejo, con los inputs). **📊 Excel no se bloquea**: se arma desde los datos, no del DOM. En modo Pagar no existe el candado.
  - **Observaciones por día (solo pagar)**: anexo al pie del printable con las anotaciones que en la grilla del ciclo solo se ven pasando el mouse por el encabezado de cada fecha. Agrupadas por día y, dentro del día, una línea por labor. Va **después del total** a propósito: es contexto de la jornada, no parte del cálculo.
    - **En cobrar NO se muestra, y es deliberado**: son apuntes internos ("se cortó la luz", "llegó tarde el camión") y el resumen de cobrar es el que se manda al cliente. Si alguna vez se lleva a cobrar, conviene que sea con una lista aparte y no con estas notas.
    - El nombre de la labor se imprime **solo si el ciclo trae más de una labor**. Con una sola es ruido: no hay otra cosa a la que la observación pueda referirse.
    - Itera `laborsData` (todas las labores del ciclo), no `cobrarLabors`: en pagar no existe el tildado por labor del cobro.
    - La fuente son los dos campos que lee `CycleDetail`: `cycle.dayNotesByLabor[laborId][date]` (por labor) y `cycle.dayNotes[date]` (compartido entre labores; la app solo lo lee). El compartido se emite **una vez por día**, rotulado "Todas las labores", y no una vez por labor — si no, el mismo texto se repetiría tantas veces como labores tenga el ciclo.
    - Se listan también los días que tienen nota pero no tienen producción. Esconder una observación que alguien escribió es peor que mostrar una fila de más.
  - **📥 Importar ciclos anteriores (solo cobrar, en Editando)**, en dos pasos: los ciclos de la misma subfaena (`ImportCyclesModal`) y después cuáles de sus labores traer (`ImportLaborsModal`). **Cada labor importada entra como labor propia**, de cualquier tipo, sin emparejarse con las del ciclo: se guarda una copia en `cobrar.importedLabors` (definición + filas diarias, ver `docs/data-model.md`) y `importedLaborsData` la suma a `cobrarLabors`, así se dibuja con su propia tabla, acepta tarifas, ajustes y "Juntar con", y suma al total a facturar. No aparece en modo Pagar.
    - Es una **copia**: si después cambian las jornadas del ciclo de origen, el resumen no se entera. Para actualizarla se quita (✕ Quitar en el editor de tarifas) y se vuelve a importar.
    - Lleva su ciclo de origen en el nombre, que se cambia en "Personalizar títulos". En tratoHE guarda los días en rojo calculados con los feriados del ciclo de origen.
    - **No va al 📊 Excel**: su desglose por combo o tier se arma releyendo las jornadas del ciclo actual.
    - Lo ya importado se detecta por ciclo + labor, en `cobrar.importedLabors` y en las filas extra que traen `sourceCycleId`. Una fila extra con ciclo y sin labor de origen bloquea ese ciclo entero, para no duplicar.
    - Las jornadas del origen se indexan con `workdayMapKey` + `workdayComboKeyOf`, las mismas claves de la grilla, que es lo que `buildDailyRows` lee para separar tiers y etapas.
  - **🔗 Juntar labores en una sola tabla (solo cobrar)**: en el editor de tarifas, "Juntar con" pone `mergeInto` en una labor y esta se muestra dentro de la tabla de la otra, con un subtotal único. Es **solo presentación**: cada labor conserva sus overrides y filas extra, y cada fila fusionada lleva `_laborId` para que la edición vuelva a su labor. El total a facturar no cambia. Reglas en `utils/cobrarMerge.js` (con tests): mismo tipo de familia, destino incluido y sin cadenas. La cantidad del subtotal solo se suma si todas las labores miden lo mismo. **El Excel consolidado sigue armando una hoja por labor**: la fusión se ve en pantalla, en la imagen y en la impresión.
  - **Total a facturar + IVA**: en el printable de cobrar el grand total se rotula **TOTAL A FACTURAR** y debajo se muestran dos filas: **Valor IVA (19%)** = `round(total × 0.19)` e **IVA incluido** = `round(total × 1.19)`. La hoja `Total` del XLSX las reproduce con fórmulas vivas (`ROUND(C*0.19,0)` y `=C+C`).
  - **XLSX consolidado** (botón **📊 Excel** del footer): genera un workbook con **una hoja por labor** (cosecha/trato con desglose multi-combo, tratoHE con tarifa HE editable + fórmulas, main/sup/extra plano) + **una hoja por transportista** + una hoja **`Total`** que referencia los subtotales con fórmulas `='<sheet>'!$X$N`. Layout obligatorio: col A vacía width 6, fila 1 vacía, datos desde B2 (ver `memory/project_xlsx_layout_constraints.md`). En modo cobrar refleja los overrides (escribe valores literales en lugar de fórmulas que apuntan a una tarifa única).
- `components/WorkerSummaryModal.jsx` — multi-ciclo activo, day-by-day, títulos editables (`worker_summary_titles_${rut}`). Carga **anticipos pendientes** via `listPendingForWorkers([rut])` y renderiza una sección **"Anticipos y Bonos pendientes"** con tipo, fecha, monto, aplicado, saldo y nota. Cuando hay saldo, el bloque de totales lo desglosa en `Saldo anticipos pendientes` (resta) y `Saldo bonos pendientes` (suma) para llegar al `NETO ESTIMADO`, en lugar del simple `TOTAL GENERAL`. Toggle de vista **📂 Por ciclo / 📜 Lineal**: el modo Lineal aplana todos los días de todos los ciclos en una sola tabla cronológica con columna `Ciclo`, con sus propios botones 📋 Copiar / 📥 PNG / 🖨 Imprimir y título editable (`linear: { main, subtitle }` dentro del localStorage de títulos). Soporta rango de fechas e incluye ciclos cerrados en el filtro.
- Ambos: logo desde `${import.meta.env.BASE_URL}logo.png`, modo foto (copiar imagen, descargar PNG, imprimir con `print-color-adjust: exact`).
- **Headers/totales reflejan el catálogo, no literales**: la columna principal y los "Total" se etiquetan con `cosechaUnit(catalogs, containersDelCiclo)` para cosecha y `tratoTypeLabel(catalogs, labor.tratoType)` para trato. Si un ciclo mezcla varios tipos cae al genérico ("Trato", "Unid.").

## Calendario / Calendar

- Pantalla: `src/screens/Calendar.jsx`. Ruta `/calendar`.
- Vista mensual. Cada celda lista las subfaenas que trabajaron ese día como barras de color (color estable derivado de un hash del nombre + paleta).
- Dos interacciones:
  1. Click en una **barra** → `DayDetailDrawer` con detalle por labor + transportistas del día/subfaena. Métricas heterogéneas (kilos solo de cosecha, jornadas solo de los tipos que aportan jornada, trato/HE solo donde aplica). Las tarjetas con valor 0 se ocultan.
  2. Click en la **celda** (zona blanca) → `DayExpandedModal` con todas las subfaenas del día. Click en una subfaena dentro de este modal pasa a `DayDetailDrawer` con `from: "all"` para que al cerrar el drawer se vuelva al modal del día (cadena de modales).
- **Cache de sesión por mes**: `sessionStorage` con TTL 5 min, key `af.calendar.{year}.{month}`. Reduce reads al navegar atrás/adelante.
- **Estrategia de lecturas**: lee todos los workdays del rango del mes (~3k lecturas en un mes pico, ~US$0.02). `fetchWorkdaysInRange(start, end)` es el único punto que los lee: si el volumen pasa de ~5k workdays/mes o la carga de 2 s, ahí se puede combinar un snapshot agregado de los ciclos cerrados con los abiertos sin tocar el resto de la UI.
- **Workers**: además de workdays/trips, el Calendar pre-carga la lista completa de trabajadores con `workersService.list({ cache: true, persist: true, ttl: 2h })`. Mismo cache que usa la pantalla Trabajadores → 0 reads extra si ya está vivo. Necesario para mostrar nombres (no solo RUT) en los breakdowns por trabajador del drawer. El TTL de 2 h hace que las ediciones de bancos/datos de un colaborador le aparezcan al otro en la misma jornada.
- **DayDetailDrawer — fila expandible por labor**: cada fila de la tabla "Por labor" es clickeable (▸/▾). Al expandir se muestra:
  - Para **cosecha**: cards con `qualityLabel / containerLabel · kg · %` por combo (calidad×envase) — sale del catálogo, no `Q1/E2`.
  - **Trabajadores** que participaron: nombre + RUT + producción (kilos / tratoQty / jornadas / HE / piso) + monto, ordenados por monto desc. Estado expandido en memoria (no persistido).
- **Métricas tratoHE separadas**: en la tabla "Por labor" del drawer y en el breakdown de trabajadores, jornadas y HE se renderizan apilados (`{n} jorn.` arriba, `{h} HE` abajo) en lugar del string mezclado `"100 j + 17,5 HE"`. Misma convención que `LaborTable` y `LaborWorkerGrid`.
- **Sat/Dom en rojo**: el número del día en la grilla del mes y el título de la fecha en `DayDetailDrawer` / `DayExpandedModal` se muestran en `#dc2626` cuando es finde. El título usa formato humano `"vie 16-may-2026"` (helpers `humanDate`, `isWeekendDate` en el mismo archivo). Feriados a nivel labor no se cubren acá — están en `dayPrices` y el calendar no los carga.

## Dashboard

- Pantalla: `src/screens/Dashboard.jsx`, ruta `/dashboard`. **La home (`/`) redirige a `/faenas`**, no acá: abrir la app es la acción más frecuente del día y montar Faenas cuesta ~21 lecturas contra ~270 del Dashboard (medido con los conteos reales de septiembre 2026). El ahorro es real solo si no se entra igual al Dashboard — `faenas`, `cycles` y `payrolls` comparten clave de caché entre las dos pantallas. Tres bloques de KPIs (plata pagada a trabajadores, operación, transporte) + gráficos + dos tablas accionables. Selector de período global: mes actual / 3 meses / 12 meses.
- **La restricción de diseño es el costo de lecturas.** Nada acá escanea `workdays`, `logs`, `transports` ni `dteDocuments`. El truco es que casi todo ya viene pre-agregado:
  - Los docs de `payrolls` traen `total`/`bankTotal`/`cashTotal`/`workerCount`/`advanceTotal` ya sumados → toda la serie de "pagado por mes" sale de ahí.
  - `transportPayments.total` y `transportPayrolls.total` están denormalizados por el servicio.
  - `cycles.summaryTotals` (ver `docs/data-model.md`) da el margen por ciclo.
  - La actividad por mes sale de `getCountFromServer`: 12 consultas de recuento = 12 lecturas para el año entero, contra decenas de miles si se trajeran las filas. Se piden una vez por sesión (no dependen del selector de período) y alimentan tanto la tarjeta de jornadas como su gráfico.
- **Las opciones de `list()` están copiadas literal de otras pantallas a propósito**: la clave de caché es `collection::{wheres,order,take}`, así que `faenas` comparte clave con Faenas/Nómina, `cycles` con Transportes y `payrolls` con Nómina. Si cambia el `order` o el `take` de acá, dejan de compartir caché y el Dashboard paga esas lecturas.
- Contador de lecturas visible solo para admin en el subtítulo (`· N lecturas` / `· desde caché`), mismo criterio que el de Calendario. Es lo que hace verificable la restricción.
- **Cheques y pagos** (`CommitmentsWeek`): una dona con lo que se paga y está atrasado o por vencer —vencido sin marcar, aplazado y lo que vence en los próximos 7 días—, con el total de cada grupo al lado y la suma en el centro, más la lista de esos vencimientos, que lleva a la pantalla. No incluye cheques recibidos ni protestados. La dona (`CommitmentsDonut`) vive en el chunk lazy de Recharts; los montos se ven aunque todavía no haya cargado. Se carga aparte de lo demás (si falla, el tablero se muestra igual) y con las opciones de `listCommitments`, así comparte la caché con Cheques y pagos.
- **Tabla "ciclos abiertos sin movimiento"**: ciclos `open` cuyo último día en `cycle.days[]` quedó a más de 14 días. Sale gratis de la lista de ciclos y es lo más accionable del tablero.
- Gráficos en `src/components/DashboardCharts.jsx` (Recharts, lazy). Ocho, en este orden: pagado por mes (barras apiladas banco/efectivo, el tooltip suma el total), deuda con transportistas en el tiempo, actividad por mes (área, 12 meses fijos), ciclos abiertos por faena, composición de lo devengado (dona con la leyenda al costado, con monto y porcentaje por categoría), gasto por transportista, gasto de transporte por mes (ventana fija de 6 meses) y compras vs ventas por empresa.
  - **Compras vs ventas**: barras agrupadas mes a mes (6 meses) de una empresa a la vez, elegida en un selector de la propia tarjeta. Carga sola con la primera empresa y se rehace al cambiar. Suma el campo `total` (IVA incluido) y **resta las notas de crédito** (tipos 61/112, mismo `CREDIT_NOTE_TYPES` que Facturación) para que los números calcen con esa pantalla. Va por `dteDocumentsService` con `cache+persist` a 10 min.
    - Acotar a una empresa no es cosmético: `dteDocuments` es la colección más grande del sistema y mezcla todas las empresas y todos los períodos. **El costo no se le muestra al usuario** — eso es información de desarrollo y vive en el contador admin del encabezado.
    - La query cruza `companyId` (igualdad) con `periodo` (`in`), o sea **dos campos**: puede requerir un índice compuesto. No hay `firestore.indexes.json` en el repo (los índices se manejan en la consola), así que si falta, falla en runtime con `failed-precondition`. Está contemplado: la tarjeta muestra un mensaje corto y el link para crear el índice queda en la consola del navegador.
  - **Deuda con transportistas**: la unidad de deuda es el **resumen** (`transportPayments`), no la quincena — la quincena solo agrupa resúmenes, así que sumar las dos cosas duplicaría los montos. La deuda nace con `createdAt` del resumen y baja por dos vías: cada abono parcial en su propia fecha (`abonos[].date`) y el remanente cuando el resumen se marca pagado (`paidAt`). Lo anterior a la ventana de 12 meses se acumula en un saldo inicial para que la línea sea el saldo vigente y no solo el flujo. El tooltip muestra cuántos resúmenes se generaron y cuántos se saldaron ese mes, y dice explícitamente si se pagó más o menos de lo generado.
  - Los resúmenes de transporte se traen **siempre por 12 meses** y todo lo que depende del selector de período se filtra en cliente, así cambiar de período cuesta 0 lecturas y la curva de deuda tiene el histórico que necesita.
  - **Atribución de mes**: un resumen se cuenta en el mes del **período que cubre**, no en el de `createdAt` — el resumen de la segunda semana de agosto suele armarse recién en septiembre, y fecharlo por creación corre el gasto de mes. `paymentPeriodDate()` toma el punto medio de `[periodFrom, periodTo]`, que cuando el período cruza el cambio de mes cae en el mes con la mayoría de los días (28-ago a 3-sep → 31-ago → agosto); si el resumen no trae período, cae a `createdAt`. Los pagos y abonos **no** se reatribuyen: van por su fecha real, que es cuando la plata se movió.
  - Limitación conocida: los resúmenes se piden por `createdAt` de los últimos 12 meses, así que una deuda más vieja que eso y todavía impaga no entra en el saldo inicial de la curva.
  - Los colores salen de `var(--color-*)`; **no hardcodear verde como "bueno"** — el accent es naranja en donDiego y violeta en sheridan/aetiskPastel. Gradientes y sombras se declaran en `<defs>` con id prefijado por gráfico (los ids de SVG son globales al documento).
- `src/components/MetricCard.jsx` es la tarjeta de KPI compartida. Facturación (`SummaryCard`), Payroll (`MetricCard`) y Calendar (`Stat`) tienen versiones locales propias.
- `src/utils/format.js` centraliza `fmtCurrency`/`fmtNumber`/`fmtPercent`/`fmtMonthKey`. El código nuevo usa este módulo; varias pantallas tienen copias locales (~11).

## Consola admin / AdminConsole

- Pantalla: `src/screens/AdminConsole.jsx`. Ruta `/admin/console` (solo admin).
- Secciones para inspección barata: conteos por colección, workdays por mes (12 reads para todo un año), workdays por rango, workdays por ciclo, más los backfills y el diagnóstico del rol admin.
- **`MAIN_COLLECTIONS` lista las 36 colecciones de la app**, agrupadas por área. Es una lista a mano: al agregar una colección nueva hay que sumarla acá o queda invisible. El botón **📋 Copiar** baja los conteos ya ejecutados separados por tab, listos para pegar en una planilla.
- **🧪 Ping al backend**: encola un job en `functionJobs` y espera la respuesta. No llama ningún endpoint porque no hay ninguno invocable (ver Despliegue); ejercita el mismo camino que usa cualquier job. Distingue los tres modos de falla a propósito, porque cada uno se arregla en otro lado: `permission-denied` es que las reglas publicadas no dejan crear el job (o quien aprieta no es admin), el timeout de 45 s es la función sin desplegar o mirando otra base, y un job en `error` es la función corriendo y fallando adentro. Es además el **único** chequeo que prueba que el trigger esté suscrito a `hpdatabase` — el emulador no puede.
- Usa `getCountFromServer` de Firestore — 1 read por cada 1000 docs vs N con `getDocs`. Permite estimar costos sin descargar la colección.
- **Composición de logs** (`LogsBreakdownSection`): desglosa `logs` por entidad (~1 lectura por entidad) y mide cuántos documentos borraría un TTL de 6/12/24 meses (3 lecturas), para decidir la retención con números. `LOG_ENTITIES` es una lista a mano: una entidad nueva que no se agregue queda invisible, y la fila "sin clasificar" del total es la que lo delata.

## Usuarios / Users

- Pantalla: `src/screens/Users.jsx`. Ruta `/admin/users` (solo admin). Colección `users`.
- Lista los perfiles (1 lectura por perfil) con correo, alias, rol, estado y último ingreso. El correo y el último ingreso los escribe cada cuenta al abrir la app (ver Auth): un perfil de alguien que todavía no entra sale "Sin correo todavía".
- Acciones por cuenta: **Hacer admin / Quitar admin**, **Suspender / Reactivar** (`disabled`), **Contraseña** (el correo de Firebase para elegir una nueva, en español) y **Saludos** (ver Saludos personalizados).
- **Límites**, los mismos en `firestore.rules` y en `utils/userAccounts.js`, con tests en los dos lados:
  - Nadie cambia su propio rol ni suspende su propia cuenta. Por eso siempre queda al menos un admin: el que actúa no puede quitarse el rol.
  - Un admin no se suspende: primero se le quita el rol.
  - Una cuenta suspendida no pasa a admin: primero se reactiva.
- El rol y la suspensión pasan por `usersService.update`, así que quedan en la auditoría.
- **+ Nueva cuenta** usa el job `createUser` (Cloud Functions): crea la cuenta en Authentication con una contraseña al azar que no se guarda, y el perfil con el mismo UID, y lo registra en la auditoría. Después la app envía el correo para elegir contraseña (opción marcada por defecto).
  - Si el correo ya tiene cuenta (por ejemplo, de la app Calendario), la función responde `errorCode: "account-exists"` y la pantalla pide confirmación antes de darle acceso a esa cuenta (`params.useExisting`): quien conozca su contraseña va a poder entrar.
  - La función vuelve a comprobar que quien pide sea admin, leyendo su perfil, además de la regla de `functionJobs`.
  - Listar las cuentas de Authentication sin perfil, y desactivar o borrar una cuenta, están como TODO en `functions/index.js`.

## Auditoría / `logs`

`logs` es la colección más grande del sistema (49.132 docs en septiembre 2026, el 72% de la base) y conviene entender por qué antes de tocarla.

- **Nada la borra, nunca.** No existe un solo `logsService.remove` en el repo: es append-only y crece con cada escritura de cualquier colección, porque `logAction` lo llama `firestoreBase` en todos los `create`/`update`/`upsert`/`remove`.
- **El conteo y el peso no vienen del mismo lado.** `diff()` (`services/logger.js`) compara por clave de **primer nivel**, así que cambiar un elemento de un array guarda **dos copias completas** de la estructura. Medido sobre un ciclo realista (3 labores × 80 personas, 30 días × 4 combos): **~30 KB por log de `cycle`** contra **~0,1 KB por log de `workday`**. Agregar un trabajador a una labor escribe 30 KB. Las entidades pesadas son `cycle` (`labors[]`, `dayPrices{}`), `payroll` (`items[]`, `workdayIds[]`), `payrollSnapshot` (el snapshot entero, que además es contrato externo), `qrPrefix` (`padron{}`, un código por trabajador) y `catalog` (`entries[]`). Ese blob **no se lee**: la UI lo pinta como JSON crudo en un `<pre>`.
- **Desde la app, un log solo se agrega.** `firestore.rules` no deja editarlo ni borrarlo, ni siquiera a un admin. Una poda o un backfill sobre `logs` va en un job de Functions, con el admin SDK.
- **Pérdida silenciosa**: si un log supera el límite de 1 MiB, `addDoc` lanza, `logAction` lo atrapa y solo hace `console.error`. El registro del cambio más grande es justo el candidato a perderse sin rastro.
- **Cada mutación espera su log**: `firestoreBase` hace `await logAction(...)` después de escribir, así que editar una celda de la grilla son tres viajes en serie (leer el doc, escribirlo, escribir el log).
- **Casi nada es consultable.** Solo hay tres formas de llegar a un log, y ninguna filtra por usuario ni por acción (la sesionización es en cliente): rango de fechas con tope de 5.000 (`HARD_CAP` en `Audit.jsx`), `entity + entityId`, y `entity + meta.workerRut|carrierId` — estas dos **sin tope ni límite de fecha**. Por eso un TTL le recorta el historial a la ficha por registro en silencio.
- Las consultas de logs necesitan cuatro índices compuestos (`entity+entityId`, `entity+meta.workerRut`, `entity+meta.carrierId`, `entity+meta`). No hay `firestore.indexes.json` en el repo, así que no hay registro de cuáles existen.

## Facturación / Billing

- Pantalla: `src/screens/Facturacion.jsx`. Ruta `/facturacion`. Nav label: "Facturación" (icono 🧾). Acceso para todas las cuentas.
- Servicios: `companiesService` (colección `companies`) + `dteDocumentsService` (colección `dteDocuments`) en `services/index.js`. TTL del list = **10 min** (`ttl: 600_000`) — las mutaciones locales (status, notas, pagos, import) actualizan el state en memoria, así que el TTL solo afecta al re-entrar a la pantalla.
- **Multi-empresa**: el sistema soporta N empresas (probado con 3). Cada empresa tiene `{ rut, razonSocial, alias, enabled }`. CRUD inline desde el modal **🏢 Empresas**. Los DTE quedan namespaceados por `companyId` así no se colisionan folios entre empresas (mismo proveedor puede facturar a varias empresas con el mismo folio).
- **Empresa elegida persiste en localStorage** (`facturacion.selectedCompanyId`). Si la empresa guardada fue borrada, cae a la primera.
- **Solo lectura e import.** La emisión se hace en el portal del SII; la app no se integra con ningún emisor. Cada documento lleva `source: "sii_import"`.
- **Flujo de import**: el usuario exporta CSV del **Registro de Compras y Ventas (RCV)** desde el portal SII. En la app: 📥 Importar → elegir empresa + **uno o varios archivos** (Ctrl/Cmd+click) → preview multi-file con stats, warnings de RUT mismatch, exclusiones togglables → Confirmar → escribe a Firestore.

### Parser CSV (`src/utils/siiCsvParser.js`)

Exporta: `parseSiiRcvCsv(buffer, { companyRut })`, `dteTypeLabel(tipo)`, `normalizeRut(raw)`, `rutNumeric(raw)`, `extractRutFromFilename(name)`, `buildDteDocId({ companyId, kind, tipo, folio, rutEmisor, rutReceptor })`.

- Auto-detecta **kind** (ventas vs compras) por headers (`Rut cliente` vs `Rut Proveedor`).
- **IVA**: suma `Monto IVA Recuperable` + `Monto IVA No Recuperable`. El fallback
  `"monto iva"` es para los exports con una sola columna. Como `colIdx` matchea
  por *contiene*, el fallback se descarta si cae en la misma columna que la No
  Recuperable; si no, el IVA se sumaría dos veces.
- Encoding **UTF-8 con BOM o ISO-8859-1** — intenta UTF-8, fallback a latin-1 si detecta U+FFFD.
- Fechas en YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY → normalizadas a ISO.
- Montos con miles `.` y decimal `,` o sin separadores.
- RUTs con/sin guión y puntos, normalizados a `12345678-9`.
- `extractRutFromFilename` saca el RUT del nombre del archivo (el SII suele incluirlo en exports del RCV) para detectar mismatch con la empresa elegida → warning en el preview.

### Doc shape + replace por período

```
{
  id,                     // companyId_V_tipo_folio  (ventas)
                          // companyId_C_rutProvNumeric_tipo_folio  (compras)
  kind: "venta"|"compra",
  tipo: 33|34|39|56|61|112|...,
  tipoLabel, folio,
  rutEmisor, razonSocialEmisor,
  rutReceptor, razonSocialReceptor,
  fechaEmision, periodo: "YYYY-MM",
  exento, neto, iva, otrosImpuestos, total,
  companyId, companyAlias,
  source: "sii_import", sourceFile,
  importedAt, importedBy,
  paymentStatus: "unpaid"|"paid"|"net_only"|"factored"|"cancelled",
  paymentStatusSetAt, paymentStatusSetBy,
  notes,                  // glosa interna editable
  payments: [{ id, date, amount, kind, notes, recordedAt }],
  amountPaid,             // denormalizado: sum(payments.amount)
}
```

- **Doc id determinístico por `companyId`**: reimportar el mismo período es **idempotente** (setDoc + merge sobreescribe sin duplicar). El preview cuenta cuántos sobreescriben antes de confirmar.
- **Replace por período**: confirmar el import agrupa por `(companyId, kind, periodo)` y para cada scope (a) lee los existentes, (b) calcula **huérfanos** (existían antes, no vienen en el nuevo CSV) y los **elimina**, (c) escribe los nuevos/actualizados. Preserva `paymentStatus` existente al reimportar — solo setea `"unpaid"` para docs nuevos. Bulk write: `writeBatch(db)` con chunks de 450 (límite Firestore 500).
  - **La persistencia vive en `services/dteImportService.js` (`importDteRecords`), no en la pantalla**, así se prueba sin React. `tests/e2e/facturacion-import.test.js` fija las tres propiedades que importan: reimportar es idempotente, el estado de pago y las notas cargadas a mano sobreviven, y el borrado de huérfanos **no** cruza de período, de `kind` ni de empresa. El borrado no pide confirmación: el test fija ese comportamiento, no lo aprueba.

### UI

- Tabs **📤 Facturas** (kind=venta), **📥 Compras**, **📑 Retenciones**, **📊 Resumen** (resumen anual + balance de IVA).
- **Vista default = mes actual** (`periodoFilter`); el selector de período cambia de mes. Buscar por texto ignora el período y muestra todos los de la empresa.
- Filtros: período, tipo de DTE, **estado de pago** (chips: Todos / No pagado / Pagado / Solo neto / Solo IVA / Anulada), búsqueda libre con `<datalist>` autocomplete de contrapartes únicas.
- Cards de totales: Documentos, Neto, IVA, Total. **NCs (tipos 61/112) restan con signo** en los totales y se cuentan aparte en una card específica. Para vista normal: cards adicionales de No pagado del período / Solo neto / Cedidas. Para Retenciones: Facturas con retención / IVA retenido / Total facturado.
- **Tabla principal sortable**: click en cualquier header (Fecha, Tipo, Folio, Cliente/Proveedor, RUT, Neto, IVA, Total, Abonos, Estado) alterna asc/desc con flecha ▲/▼. Default `fechaEmision desc`. Sort sobre "estado" empuja NCs al final (clave virtual `zz_anulada`).
- **Columna Estado solo para Facturas (ventas)**: en Compras se oculta (header, celda, chips de filtro de pago y export) porque ahí no hay control de pago real. El control de cobros vive en ventas.
- **Tipo sin código numérico en pantalla**: la columna Tipo muestra solo el label (Factura / Nota de Crédito / etc.), no el número de tipo DTE. Las NCs van con chip rojo.
- **Columna Abonos**: muestra el monto pagado + sub-text "Saldo $X" (warning) o "✓ N abonos" (success) cuando está totalmente pagada. NCs: "—".

### Estados de pago (`PAYMENT_STATUSES`)

5 estados manuales para facturas/boletas afectas, expuestos como `<select>` por fila. Las NCs (61/112) **no usan estos estados** — chip fijo "Anulada" rojo.

| Estado | Significado |
|---|---|
| `unpaid` | Pendiente de cobro/pago (default al importar) |
| `paid` | Completo |
| `net_only` | Cliente solo pagó NETO — retuvo IVA (típico de servicios). Aparece en tab Retenciones |
| `factored` | Factura cedida vía factoring (queda "solo IVA" en libros) |
| `cancelled` | Anulada por NC |

El select nativo lleva colores explícitos `var(--color-surface)` / `var(--color-text)` en sus `<option>` porque el dropdown nativo hereda el fondo del chip y en dark mode los soft colors hacen ilegibles los items.

### Autodetección de NC anulada (sugerencia)

- Helper `findCancellingNcs(dteDoc, allDocs)`: matchea NCs con misma `companyId + kind + RUT contraparte + total exacto`, con NC fecha ≥ factura. Memo `cancellingByDocId` precalcula el mapa.
- **No auto-cambia** el estado — solo sugiere. En la fila aparece un badge **⚠ NC?** al lado del select; click abre el `DocDetailModal` con un banner rojo listando las NCs candidatas + botón **"Marcar como Anulada"** que en un click setea `cancelled` y agrega `[Anulada por NC tipo-folio (fecha, monto)]` a las notas como auditoría.

### Pagos / abonos (`payments[]`)

- Sección dentro del `DocDetailModal` (oculta para NCs). Lista pagos con fecha/tipo/monto/notas + botón × por fila.
- Tipos (`PAYMENT_KINDS`): `abono` / `neto` / `iva` / `total` — categorización para auditoría.
- Indicador **Pagado** / **Saldo** con color (verde si cerrada, warning si queda saldo).
- Form inline para agregar: fecha (default hoy), tipo, monto, notas. Al cambiar tipo, el monto se autocompleta: `total` = saldo pendiente, `neto` = factura.neto, `iva` = factura.iva, `abono` = vacío.
- **Validación estricta**: `amountPaid + nuevo ≤ total` — si excede, alerta con desglose y bloquea. Monto > 0, fecha obligatoria. El botón "+ Registrar pago" se deshabilita cuando saldo ≤ 0.
- Persistencia: `saveDocPayments(dteDoc, payments)` escribe `payments` + `amountPaid` denormalizado.
- `paymentStatus` es independiente de los pagos — es la etiqueta de alto nivel; los pagos son el detalle/auditoría temporal.

### Retenciones (tab + exports)

Tab **📑 Retenciones** muestra todas las facturas con `paymentStatus === "net_only"` agrupadas por contraparte (sin restricción de kind). `retencionesByContraparte` agrupa por RUT, suma neto/iva/total, ordena por IVA desc. Lista expandible (▸/▾) en `RetencionesView`.

**Exports** (4 botones en toolbar global, mismo set por contraparte individual):
- 📋 Copiar (toBlob al clipboard como PNG)
- 📥 PNG (toPng + download)
- 🖨 Imprimir (ventana print landscape con color-adjust: exact)
- 📊 XLSX (ExcelJS lazy, layout convención col A vacía width 6 + fila 1 vacía)

**`PrintableRetenciones`** (general): banner amarillo destacado con **IVA Retenido total del período** (font 22, weight 800), tabla resumen por contraparte, y sección **Detalle de facturas** agrupada por contraparte con subtotales por grupo + total general. Sin columna `Tipo` (solo `Documento` con el label) — el número de tipo es ruido visual.

**`PrintableRetencionesGroup`** (individual): un printable por contraparte renderizado off-screen, mismo estilo pero limitado a una sola contraparte. Cada grupo en la vista tiene su propia toolbar de 4 botones (📋📥🖨📊) con `stopPropagation` para que no expanda el grupo. Filename: `Retencion_{empresa}_{contraparte}_{periodo}`.

**XLSX por grupo**: una hoja con banner explícito de IVA retenido (fila 4 destacada amarilla con monto grande) + tabla de facturas + total con fórmulas SUM. Las celdas IVA llevan `bold: true`.

### Ver pendientes (modal global)

Botón **⏳ Ver pendientes**, con badge contador. Abre `PendientesModal` con las **ventas** (kind=`venta` — no compras, son flujo distinto) de la empresa seleccionada **(cualquier período)** que tengan saldo pendiente, categorizadas:

| Categoría | Criterio |
|---|---|
| `full` (Factura completa) | status `unpaid` sin abonos → debe el total |
| `partial` (Abono parcial) | status `unpaid` con abonos → debe `total - amountPaid` |
| `iva` (IVA pendiente) | status `net_only` → debe `iva - max(0, paid - neto)` |

Skip: NCs, `paid`, `cancelled`, **`factored`** (Solo IVA / cedida — se considera pagada porque el factor ya pagó el neto al emisor; el IVA es una obligación tributaria separada que se gestiona en el F29, no acá). Helper: `pendingFor(d)` devuelve `{ category, amount }` o null.

UI: summary cards por categoría + tabla agrupada con sub-headers de color (`#ffd6d6`/`#fff2cc`/`#dde9ff`), subtotales por grupo, total general destacado al final. Cada fila tiene ℹ para abrir el detalle. Misma toolbar de 4 exports.

**`PrintablePendientes`** off-screen replica el layout para captura. **XLSX** baja workbook con secciones por categoría, subtotales con fórmulas y total general en verde.

### Exports de Facturas / Compras + centro de costo

Las tabs Facturas y Compras tienen la misma toolbar de 4 exports (📋📥🖨📊) que Retenciones, capturando el listado **tal cual filtrado y ordenado** (`sortedFiltered`). Título de print/export: `{kindTitleLabel} — {empresa} — {Mes Año}` (ventas = "Ventas/Facturas", compras = "Compras"). `PrintableDocList` (forwardRef) renderiza off-screen. La columna Estado solo aparece en ventas (`showEstado={kindTab === "venta"}`).

- **Toggle 🗂 Centro de costo** (`groupByCostCenter`, persistido en `localStorage`): agrupa por contraparte. **Afecta tanto el export como el grid en pantalla.** Helper `groupDocsByCostCenter(docs, kind)`:
  - **Combustibles** (cualquier doc con `otroImpuestoCategory === "combustible"`) se juntan en un grupo virtual único **⛽ COMBUSTIBLES**, ordenado por fecha, que va **primero** (centro de costo agregado, no por proveedor).
  - El resto se agrupa por contraparte (rutEmisor en compras / rutReceptor en ventas), ordenado por total desc.
  - Cada grupo lleva header + filas de docs + **fila Subtotal** (Neto/IVA/Total). Total general al final. En XLSX agrupado los totales son **precomputados** (no fórmulas SUM) para no doble-contar las filas de subtotal.

### Detección de combustibles (Otros Impuestos del SII)

`siiCsvParser.js` lee el campo **`Codigo Otro Impuesto`** del RCV. Mapa `OTRO_IMP_CODES` + categorías `OTRO_IMP_CATEGORIES`; códigos **28 / 35 / 271 / 272 = combustible**. El doc queda con `otroImpuestoCodigo` (number) y `otroImpuestoCategory` (string). En la tabla se muestra un `OtroImpChip` y alimenta el agrupado por centro de costo. Helpers: `otroImpuestoLabel(code)`, `otroImpuestoCategory(code)`.

### Resumen anual (tab + balance de IVA)

Tab **📊 Resumen**: vista que **cruza los 12 meses** de un año para la empresa seleccionada, con **selector de año propio** (`resumenYear`, default año actual; opciones derivadas de los períodos de la empresa). Ignora el filtro de mes; en esta tab se ocultan Ver pendientes, los sub-filtros y las cards operativas.

- Memo `resumenData`: por mes acumula ventas/compras **con signo** (NCs restan) separando **IVA Débito** (ventas) de **IVA Crédito** (compras). El IVA de facturas "Solo neto" (`net_only`) **se suma normalmente** al débito/crédito que corresponde — no se trackea aparte.
- **Métricas explícitas (KPI cards)**: IVA Débito, IVA Crédito, **IVA a pagar (año) = débito − crédito** (highlight; si es negativo → "IVA a favor (remanente)" en verde), + Ventas netas / Compras netas / Documentos.
- **Tabla mensual** (Ene–Dic + TOTAL): Ventas Neto · IVA Débito · Compras Neto · IVA Crédito · **IVA a pagar del mes**. Meses sin actividad atenuados.
- Exports: misma toolbar 📋📥🖨📊. `PrintableResumen` (forwardRef) off-screen. XLSX respeta la convención col A vacía width 6 + fila 1 vacía, con el balance de IVA en el encabezado. Filename `Resumen_{empresa}_{año}`.

### Proyección de flujo de caja (tab, solo admin)

Tab **📈 Proyección**, visible solo con `isAdmin`: proyectar plata a futuro es una decisión, no operación del día. Estima una temporada escalando la anterior — **ingresos** de los 12 meses previos, **mes a mes**, por un porcentaje (75% por default).

- **La ventana son 12 meses desde el mes elegido**: "Septiembre 2026-2027" = sep-2026 … ago-2027, y su base es sep-2025 … ago-2026. Las dos etiquetas usan la misma convención, así que nunca se superponen. Una ventana que no cruza de año se rotula "Enero 2026" a secas: `2026-2026` se lee como un error de la app.
- **Mes a mes y no un total anual repartido en doceavos.** El punto de un flujo de caja es saber *cuándo* entra la plata, y acá la temporada es estacional — el promedio parejo esconde justo eso. Cada mes proyectado se cruza contra **el mismo mes** del período anterior.
- **Un mes de la ventana que ya tiene ventas cargadas NO se proyecta: vale su dato real.** A mitad de temporada media ventana ya ocurrió, y estimar un mes que se puede leer del RCV es cambiar un número cierto por uno inventado. Cada fila lleva `esReal` y el resumen separa `totalReal` de `totalProyectado`: un total que mezcla lo facturado con lo estimado sin distinguirlos no se puede defender frente a nadie.
  - **El corte es que HAYA documentos (`count > 0`), no que el neto dé distinto de cero.** Un mes facturado y anulado con NC cierra en $0 y ese cero es el dato real; con un corte por monto volvería a estimarse en positivo y la temporada saldría inflada por algo que se anuló. Fijado en los tests.
  - En el XLSX el mes real va como **valor literal, nunca como fórmula**: si colgara de `C4`, mover el supuesto en Excel movería un número ya facturado. La celda de base queda vacía y el `SUM` de la columna suma solo las bases que sí se usaron.
  - La pantalla avisa cuando un mes real es **el mes en curso**: su dato puede estar incompleto (el RCV del mes recién cierra después) y arrastra el total para abajo.
- **Solo entran ventas.** Las compras son salidas y no tienen nada que hacer en una proyección de entradas. Las **NC restan**, y van al detalle con signo: si se filtraran, el Excel mostraría un total que sus propias filas no dan.
- **El ingreso de un documento no es su neto ni siempre su total** — lo decide `cashInOf(d)`:
  - Con **IVA retenido** (factura de compra 45/46, o cualquier documento al que el cliente le retuvo el IVA): **solo el neto**. Ese IVA no es plata que entre.
  - El resto: el **Monto Total** del SII (neto + el IVA que sí se cobra; en un documento exento, el exento).
  - **Una NC sobre una factura de compra tiene que restar con la misma regla que el documento que reversa**, o el par no cierra en cero: restarle el total a esa NC dejaría un ingreso negativo que nunca existió.
  - **La retención se deduce de los montos, no de la columna `NCE o NDE sobre Fact. de Compra` del RCV**: `neto + exento + iva` que no da el `total` **es** la retención. Así funciona con cualquier documento importado y cubre también las facturas normales a las que el cliente les retuvo el IVA. El margen de 1 peso absorbe el redondeo del SII.
  - El detalle del XLSX lleva **Neto, IVA, Total SII e Ingreso** en columnas separadas, con la celda de Ingreso resaltada cuando hubo retención: sin el desglose, una factura de compra que aporta menos que neto + IVA parece un error de la planilla.
- **El redondeo va por mes y el total es la suma de los meses redondeados**, no el redondeo de la suma. El Excel imprime la columna, así que el total al pie tiene que ser el de la columna o no cuadra a ojo.
- **Cuesta 0 lecturas**: sale entero de `docs`, que ya tiene la colección completa en memoria (TTL 10 min).
- **Lógica pura en `utils/cashFlowProjection.js`** (`projectCashFlow`, `netSalesByPeriod`, `groupByCounterparty`, `shiftPeriod`, `periodWindow`, `windowLabel`), con tests en `cashFlowProjection.test.js`. La aritmética de meses va con **enteros, nunca con `Date`**: un período es la etiqueta `YYYY-MM` del RCV, no un instante, y con `Date` una zona horaria corre un documento al mes de al lado.
- **`CREDIT_NOTE_TYPES` vive ahí** y `Facturacion.jsx` lo importa. La proyección y la pantalla tienen que coincidir en que una NC resta; si divergen, la base sale inflada. `Dashboard.jsx` tiene su propia copia, que tiene que coincidir con esta.
- **Export XLSX de dos hojas**: `Ventas netas` (banner con el neto de la base, bloque **por cliente** ordenado por monto, y el detalle documento por documento con fecha/período/tipo DTE/folio/cliente/RUT/neto, NC en rojo) y `Proyección` (12 filas mes a mes + total). El bloque por cliente muestra de dónde viene la base: una proyección sostenida por dos clientes no se lee igual que una repartida entre veinte.
- **El porcentaje va en UNA celda (`C4` de la hoja `Proyección`) y las filas la referencian** con `ROUND(D7*$C$4,0)`. Quien recibe el archivo mueve el supuesto en Excel y ve la temporada entera recalcularse, en vez de pedir otra corrida por cada escenario.
- **`isAnalysisTab`** (`resumen` + `proyeccion`) apaga filtros, tarjetas y tabla del listado. La usan los cuatro lugares que dependen de eso, así un tab de análisis nuevo se suma solo ahí.

## Cheques y pagos / Commitments

- Pantalla: `src/screens/Commitments.jsx`. Ruta `/cheques-pagos`, para todas las cuentas. Servicio `services/commitmentsService.js`, lógica pura en `utils/commitments.js` (con tests). Colecciones `commitments`, `commitmentSeries`, `commitmentConfig/main` y `commitmentNotifications` (ver `docs/data-model.md`).
- **Próximos** agrupa lo vencido, los cheques protestados, los próximos 7 días, el **próximo mes** (de ahí hasta el mismo día del mes siguiente, `upcomingMonthEnd`) y lo que viene más adelante (`groupUpcoming`). **Más adelante** llega hasta una fecha que se elige en su título, por defecto el 31 de diciembre del año siguiente (`nextYearEnd`); lo de después se resume en una línea con cuántos son y por cuánto, y vaciar la fecha lo muestra todo. El total de cada grupo es lo que falta pagar.
- **Un documento por vencimiento**: cheque emitido, cheque recibido, pago comprometido, cuota de crédito o deuda personal. Los cheques recibidos son plata que entra y el resumen no los suma con lo que se paga.
- **Un solo botón de alta, + Agregar documento**: el tipo se elige dentro del modal (cheque emitido, cheque recibido, pago comprometido, deuda personal, crédito en cuotas o pago recurrente). La **deuda personal** es un pago único por defecto; con más de una cuota se crea como un crédito (`createInstallmentPlan` con `kind: "personalDebt"`) y sus cuotas siguen siendo `personalDebt`, así el informe la rotula "Deuda personal en N cuotas". Es el mismo `CommitmentModal` que edita; lo escrito se conserva al cambiar de tipo, y las dos series muestran los vencimientos que van a crear antes de confirmar.
- **La contraparte se autocompleta** con las ya usadas, de la más usada a la menos usada (`counterpartyOptions`). Si lo escrito se parece a una de ellas sin ser igual ("Bancoestado" y "Banco Estado"), el modal ofrece usar esa (`similarCounterparty`): el informe agrupa lo suelto por contraparte, y dos variantes del mismo nombre saldrían como dos deudas.
- **Ajustar una serie** (menú ⋯ de cualquier vencimiento de un crédito, una deuda personal en cuotas o un pago recurrente → `SeriesEditModal`): la fecha y el monto de cada vencimiento abierto, a mano o con herramientas que se aplican desde un vencimiento en adelante (correr N meses, cambiar el día, poner un monto). Lo pagado y lo anulado no se tocan. Nada se guarda hasta "Guardar", y se escribe solo lo que cambió (`seriesChanges` → `saveSeriesEdit`). Un aplazado o protestado con fecha nueva vuelve a pendiente. En un recurrente, el día y el monto de las herramientas pasan a la serie (`dayOfMonth`, `amount`) y valen para lo que se genere después; `generatedUntil` se adelanta al último vencimiento para no repetir un mes. Los ids no cambian al mover una fecha.
- **Abonos de una deuda personal** (`PartialPaymentModal`, en `partialPayments`): a una cuota, o a toda la deuda, que se reparte de la cuota más antigua a la más nueva (`allocatePartialPayment`) con un `groupId` común. `amount` sigue siendo el monto original; **lo que falta pagar es `remainingOf`** (monto menos abonos), y es lo que suman las tarjetas, Próximos, el informe y el correo. Un vencimiento que los abonos cubren queda pagado con `closedByPartials`, y quitar el abono lo devuelve a pendiente; uno pagado a mano no deja quitar sus abonos sin volverlo antes a pendiente. Al marcar pagado algo con abonos se ingresa lo pagado ahora, y el interés es lo abonado más eso menos el monto.
- **"Vencido" no se guarda**: es un `pending` con `dueDate` pasada (`displayStatus`). Los estados guardados son `pending`, `postponed`, `protested`, `paid` (un cheque se "cobra", lo demás se "paga") y `cancelled`.
- **Aplazado y protestado son deuda abierta sin fecha** (`isOpen`). Aplazado (`canPostpone`): ya venció o vence hoy, se sigue debiendo y no hay fecha de pago. Protestado (`canProtest`): un cheque que el banco rechazó, desde pendiente o desde cobrado. 📅 Reprogramar les pone una fecha nueva y los devuelve a `pending`. En el resumen tienen tarjeta propia solo si hay alguno.
  - **Lo aplazado va con lo que viene**: en Próximos, al principio de "Próximos 7 días" con el chip "Aplazado" y otro con los días desde que venció (`groupUpcoming`; igual en la lista del Dashboard), y en el correo, al principio de la sección "Próximos 7 días", rotulado "ya vencido". **Por sí solo no genera un correo**: se suma al de un día que ya tiene algo que avisar. Aplazar es entonces la forma de dejar de repetir a diario un vencido que se sabe que no se va a pagar todavía, sin que desaparezca de los avisos.
  - Lo protestado tiene su grupo en Próximos y no va en el correo.
- **Créditos y pagos recurrentes** son una serie (`commitmentSeries`) que genera vencimientos normales. Un crédito crea todas sus cuotas de una vez. Un recurrente se genera 60 días hacia adelante y la función diaria lo extiende desde `generatedUntil`, así un vencimiento eliminado a mano no reaparece. "Detener pago recurrente" (desde la edición de uno de sus vencimientos) borra los pendientes posteriores a hoy.
- Las fechas son etiquetas `YYYY-MM-DD` y se calculan con enteros. El día 31 de una serie cae el último día de los meses cortos.
- **Interés = lo pagado de más, y se anota al pagar**: `amount` es el monto original y no cambia. Al marcar pagado se ingresa el monto que se pagó de verdad, y la diferencia queda en `extra` (`extraOf`, `paidTotalOf`). No hay porcentajes ni separación capital/interés al crear: el interés de una cuota pagada atrasada recién se conoce al pagarla. Sirve para cualquier tipo, no solo cuotas. Lo que se debe siempre va por `amount`; lo pagado, por `amount + extra`.
- **📄 Informe de deudas** (`components/PaymentReportModal.jsx`, lógica en `buildPaymentReport`, con tests): **es un documento PDF**, no una imagen. Solo lo que se paga (sin cheques recibidos ni anulados), en este orden: resumen; balance por deuda —cada crédito es una deuda, y lo suelto se agrupa por contraparte— con el próximo pago y la fecha en que **queda pagada** (su último vencimiento pendiente); **próximos vencimientos**, los próximos 7 días y el próximo mes, los mismos grupos de Próximos (`upcoming`); los vencimientos por mes; el detalle de lo pendiente y, si se marca, los pagos hechos en un rango (por fecha de pago), con monto original, interés y total pagado en columnas cuando algún pago tuvo interés.
  - **Lo aplazado va primero en cada lista**: en el balance (una deuda solo aplazada, antes que una protestada y que las que tienen fecha), en los próximos 7 días, en los vencimientos por mes (antes de lo vencido y lo protestado) y en el detalle. Lo aplazado y lo protestado cuentan en el saldo pero no tienen fecha (`debtState`).
  - **Una deuda queda pagada con su último vencimiento aunque tenga pagos atrasados** (vencidos, aplazados o protestados, que conservan su fecha original): la fecha sale igual, con "N cuotas atrasadas" (`behind`), y el resumen dice cuántos pagos atrasados hay en total. Un pago recurrente no tiene término y no cuenta para esa fecha.
  - **El contenido se arma una sola vez** (`reportDocument`: títulos, párrafos y tablas) y lo dibujan igual la vista previa (HTML) y el PDF (`writeReportPdf`, jsPDF + jspdf-autotable, lazy): A4 vertical, texto seleccionable, el encabezado de cada tabla se repite al cambiar de hoja y cada hoja lleva "Página N de M". Helvetica no trae emojis: el texto del documento va sin ellos.
  - Se filtra por empresa y sale como **📄 PDF** o **📊 Excel** (hojas Balance, Por mes, Pendientes y Pagados).
  - **Vencimientos hasta** (por defecto el 31 de diciembre del año siguiente, `dueUntil`): lo que vence después no se detalla. En "Vencimientos por mes" va en una sola fila "Después del …, hasta el …" (hasta su último vencimiento, `laterEnd`) y en el detalle en una línea "Más adelante", así los totales siguen cuadrando. **El balance de cada deuda no se corta**: un crédito largo seguiría mostrando cuándo queda pagado de verdad. Lo vencido, aplazado o protestado entra siempre. La fecha de corte va en el subtítulo, también en la imagen y el Excel.
- **📥 Importar Excel** (solo admin) lee la planilla "Control de Cheques" (`mapExcelRow`): reconoce fechas `Date`, `DD-MM-YY` y `DD-MM-YYYY`, el banco escrito a mano y la empresa por alias. La fecha de la planilla es la del cheque. El id es `chq_{banco}_{N°}` y una fila que ya existe se salta, así reimportar no pisa lo que se marcó en la app.
- **Avisos por correo** (`functions/commitments.js`, función programada `commitmentsDaily`, 8:00 de Chile): un solo correo con lo que vence en los días de `commitmentConfig/main.offsets` (por defecto 3, 1 y el mismo día) más los vencidos sin marcar. Cada correo cierra con **"Próximos 7 días"**, como la vista de la pantalla: los aplazados primero y después lo que vence en la semana sin estar ya avisado arriba. Esa sección no hace salir un correo por sí sola (sin nada que avisar no se envía), salvo el de prueba, que la trae siempre. Lee `status in [pending, postponed]`, un índice de campo único. `commitmentNotifications/{día}` se crea antes de enviar y evita el doble envío. ⚙ Avisos (solo admin) edita destinatarios, días y la cuenta que envía, y 📧 Enviar prueba manda el correo ya mismo por la cola `functionJobs`. La contraseña de Gmail es el secreto `SMTP_PASS` (ver `functions/README.md`).
- La aritmética de fechas del backend es una copia de `utils/commitments.js`: el backend se despliega sin `src/`. Si cambia una, cambia la otra.

## Libro de Precios / PriceBook

- Pantalla: `src/screens/PriceBook.jsx`. Ruta `/price-book`. Colecciones `priceBookEntries` + `priceBookConfig/main`.
- **Registro contable independiente**: no alimenta ni lee `cycles`/`workdays`/`faenas` para calcular nada. Es el histórico de "qué se pagó y qué se cobró por tal labor en tal faena, en tal período".
- Una entrada puede colgar de una **faena real** (`faenaId`) o de una **faena dummy** (`faenaId: null` + `faenaLabel` como texto libre), para faenas que no existen en la app.
- Cada entrada lleva N líneas de precio: `unit` (texto libre), `payPrice` (pago) vs `chargePrice` (cobro), y para unidades de jornada opcionalmente el par de hora extra. Las unidades nuevas se acumulan solas en el catálogo compartido `priceBookConfig/main.units`.
- `priceBookConfig/main.hiddenFaenaIds` esconde del selector faenas reales cuyo nombre no es legible.

## Información y Cuentas / InfoAccounts

- Pantalla: `src/screens/InfoAccounts.jsx`. Ruta `/info-cuentas`. Colección `contactCards`.
- Libreta compartida de contactos (persona o empresa) con datos bancarios listos para copiar/pegar. **Modelo independiente**: no se vincula a `worker` ni a `companies` — el usuario crea sus propias fichas, aunque dupliquen a alguien que ya existe en otra colección.
- Cada ficha tiene N cuentas (`accounts[]`), con la misma convención de `bankCode`/`accountType` que `worker.bankDetails`.
- `favorite` fija la ficha arriba; `includeRut` decide si el RUT viaja junto con los datos copiados (siempre `true` en empresas).

## Pesajes QR / HarvestQr

- Pantalla: `src/screens/HarvestQr.jsx`. Ruta `/harvest-qr`, para todas las cuentas (`/admin/harvest-qr` redirige ahí). Colecciones `harvestWeights` + `qrPrefixes` (CRUD).
- `harvestWeights` la escribe una **app externa de escaneo** y es la fuente de verdad de la producción. Acá se lee para sincronizar hacia `workdays`, y además se puede corregir a mano desde el explorador: agregar o editar un pesaje (`WeightFormModal`, que firma con `supervisor`) y completar el `idQr` de pesajes viejos.
- `qrPrefixes` (docId = el prefijo, ej. `"HP"`) es el puente entre un QR físico y el (faena, ciclo, labor) vigente al que hay que mandar sus pesajes. **Se reapunta a mano cada vez que se abre un ciclo nuevo** — semi-manual a propósito, no hay forma segura de adivinar el ciclo destino.
- La sincronización agrupa los pesajes del rango por (trabajador, día, combo calidad/envase) sumando kilos, y escribe los `workdays` resultantes. Los ejes del combo se mapean con `qualityMap`/`containerMap` del prefijo; sin ellos el mapeo es identidad (los catálogos usan la misma numeración que la app de scan).
- `healthOf()` marca un prefijo como roto si su ciclo/labor apuntado ya no existe, dejó de ser de cosecha **o el ciclo está cerrado**: detecta un prefijo que quedó sin reapuntar. El nivel `red` es el que deshabilita el botón de sincronizar, así que marcar ahí alcanza para bloquear.
- **La sincronización paga una lectura por jornada, no dos.** Lee cada workday para saber si ya está liquidada (`payrollId`) y le pasa ese mismo documento al `upsert` como `before`, en vez de dejar que el servicio lo vuelva a leer. El `Map` `yaLeidas` existe para eso.
- **No se sincroniza contra un ciclo cerrado.** Ese ciclo ya se liquidó o está por liquidarse, y escribirle jornadas por detrás descuadra lo que se pagó. Hay dos chequeos a propósito: `healthOf` apaga el botón, y `run()` vuelve a mirar el `status` del doc fresco porque la lista de ciclos es cacheada y el cierre lo hace otra pantalla.
- **La sincronización lee `harvestWeights` SIN caché, y tiene que seguir así.** De esos documentos salen las jornadas que se pagan; sincronizar sobre pesajes viejos escribe producción incompleta. Lo cacheado es solo el explorador, que es para mirar.

### Costo de lecturas

- **Explorador de pesajes**: el rango de `dateKey` **y el prefijo** van en la query, así elegir un prefijo baja las lecturas. La búsqueda por trabajador es en cliente (es sobre nombre/RUT, no hay campo indexable).
- **El filtro por prefijo depende del índice compuesto `(prefix, dateKey)`**, el mismo que ya usa la sincronización. Si falta, Firestore responde `failed-precondition`: la pantalla lo recuerda, vuelve a pedir sin el filtro y lo aplica en memoria, mostrando un `⚠ filtro en memoria`. No hay `firestore.indexes.json` en el repo (los índices se manejan en la consola), así que ese camino de respaldo no es teórico.
- **TTL largo (2 h) + botón 🔄 Refrescar**, no TTL corto. Los pesajes cambian todo el rato mientras se cosecha, y por eso mismo ningún TTL automático deja la pantalla fresca: solo decide cada cuánto se vuelve a pagar. Con TTL largo la antigüedad queda a la vista ("hace N min") y refrescar es una decisión de quien mira. Los inputs de fecha van con debounce de 400 ms, para no releer el rango en cada tecla.
- El explorador **no persiste** en `localStorage`: cada rango es su propia clave y la lista de trabajadores ya ocupa lo suyo. En memoria alcanza para ir y venir entre pestañas.
- **Contador de lecturas visible solo para admin** en las tres pestañas (`· N lecturas` / `· desde caché`), mismo criterio que Dashboard y Calendario. Es lo que hace verificable todo lo anterior: si un día vuelve a mostrar un número grande donde decía "desde caché", alguien cambió las opciones de un `list()` y rompió la clave compartida.
- Las listas compartidas (`worker` a 2 h, `faenas` a 10 min) usan **las mismas opciones que el resto de la app**. La clave de caché es `collection::{wheres,order,take}` y **no incluye el TTL**, así que el último que escribe sella el vencimiento para todos: bajarlo acá le acorta la caché a Trabajadores, Nómina y Calendario sin que se note. Omitir `cache: true` es peor que un TTL corto — esa llamada no lee la entrada **ni la escribe**, así que paga siempre y encima no deja la caché caliente para las demás pantallas.

### Candado en la grilla del ciclo

- Una labor apuntada por un prefijo QR activo se marca en `CycleDetail` con un chip **📱 \<PREFIJO\>** (en las tarjetas y en la barra de pestañas) y sus **celdas de producción quedan de solo lectura**, con un aviso arriba de la grilla.
- El motivo no es de permisos: la sincronización hace `upsert` sobre el mismo docId, así que **pisa `qty` y `amount`**. Lo que se tipee a mano no queda compitiendo con el scan — desaparece en la próxima corrida sin dejar rastro. Bloquear es más honesto que advertir.
- El **piso sigue editable**: es un bono manual, vive en un workday aparte (`comboKey: "_piso"`) y la sincronización no lo toca.
- La fuente es `qrPrefixes`, **no** el campo `harvestSynced` de los workdays: hay que saberlo antes de que llegue el primer pesaje, que es justo cuando la grilla está vacía y tienta llenarla a mano. Cuesta 4 lecturas cacheadas a 1 h.
- El predicado vive en `utils/harvestSync.js` (`isPrefixSyncing`, `qrLockedLaborsOf`) con tests: decide si se puede escribir en una grilla de la que sale plata. Ojo con `active`: ausente cuenta como **activo**, igual que en la pantalla de Pesajes QR.
- Además de `editable`, el candado se chequea en `fillDown` y `pasteFromClipboard` — son los dos caminos que escriben celdas sin pasar por ahí.

## Links útiles

- Pantalla: `src/screens/InterestLinks.jsx`. Ruta `/links`.
- Servicio: `interestLinksService` (colección `interestLinks`).
- CRUD simple con drag-and-drop nativo (HTML5) para reordenar. El orden se persiste en el campo `order` por documento.
- Helper `normalizeUrl` agrega `https://` si falta; `safeHost` extrae el host para mostrar como subtítulo.

## Layout

- **Sidebar colapsable** (`layout.sidebarOpen` en `localStorage`): un solo botón ☰ funciona como toggle en desktop y abre drawer en mobile (decidido por `matchMedia("(min-width: 768px)")`).
- Nav incluye: Dashboard, Faenas, Calendario, Trabajadores, Transportes, Anticipos / Bonos, Nómina, Facturación, Cheques y pagos, Links útiles. Items admin (Usuarios, Auditoría, Migrar CSV, Limpiar pagados, Consola) se ven solo con `isAdmin`.
- **Versión en el header** — `TeRRA v{mayor}.{menor}.{commits}`, armada en build-time por `vite.config.js` e inyectada como `__APP_VERSION__`. Sirve para diagnosticar caché PWA viejo de un vistazo: si el header sigue mostrando una versión anterior tras un deploy, el SW tiene un bundle stale.
  - **Mayor y menor salen del `version` de `package.json`**; su tercer número no se usa.
  - **El último número son los commits desde el último que cambió esa línea, sin contar merges** (`git log -G'"version":' -- package.json` + `git rev-list --count --no-merges`). Sin merges, cada PR no suma uno de más, y el mismo código muestra el mismo número en `develop` y en producción.
  - **Subir de versión**: `npm version minor --no-git-tag-version` (actualiza `package.json` y el lock) y commit; el conteo vuelve a 0 solo. Un commit que reformatee la línea `"version"` también reinicia el conteo.
  - Ojo en CI: sin `fetch-depth: 0` el conteo da 0.

## Env

- `.env` ignorado en git pero necesita credenciales de Firebase.
- Copiar de un `.env` existente o desde Firebase console del proyecto.

## Rutas / Routes

```
/                              Redirige a /faenas
/dashboard                     Dashboard
/login                         Login (Email/Password)
/faenas                        Faenas / Subfaenas / Ciclos
/cycles/:id                    CycleDetail
/workers                       Trabajadores
/transports                    Transportes
/advances                      Anticipos / Bonos
/payroll                       Nómina
/facturacion                   Facturación (import RCV del SII)
/cheques-pagos                 Cheques y pagos (vencimientos y avisos por correo)
/price-book                    Libro de Precios
/info-cuentas                  Información y Cuentas (libreta de contactos)
/links                         Links útiles
/calendar                      Calendario mensual
/audit                         Auditoría (admin only)
/admin/migrate-workers         Importar trabajadores desde CSV (admin)
/admin/cleanup-paid-workdays   Limpieza de workdays ya pagados (admin)
/admin/console                 Consola admin: Firestore counts (admin only)
/admin/users                   Usuarios: rol, suspensión, contraseña y saludos (admin)
/harvest-qr                    Pesajes QR: explorador y sincronización → workdays (/admin/harvest-qr redirige)
*                              NotFound (catch-all dentro y fuera del Layout)
```

### SPA en GitHub Pages

- `public/404.html` + script en `index.html` (truco rafgraph/spa-github-pages): cualquier ruta desconocida recarga `index.html?/<path>`, el script hace `history.replaceState` y React Router renderiza la ruta correcta. Sin esto, recargar `/cycles/abc` devuelve 404 de GitHub Pages.

### PWA

- Configurada via `vite-plugin-pwa` en `vite.config.js` con `registerType: 'autoUpdate'`. Genera `manifest.webmanifest`, `sw.js` y `registerSW.js` en `dist/` al build.
- **Instalación**: se abre la URL desplegada en Chrome (Android) o Safari (iOS) → el navegador ofrece "Instalar app" / "Agregar a pantalla de inicio" → queda ícono en el escritorio que abre la app en standalone (sin barra de URL).
- **Precache**: solo assets estables, `globPatterns: ['**/*.{ico,png,svg,woff2}']`. JS, CSS y HTML cambian de nombre en cada deploy: un `index.js` precacheado apuntaría a chunks que el deploy nuevo ya borró, así que van por NetworkFirst (`runtimeCaching` en `vite.config.js`). Límite de 5 MB por archivo.
- **Cache de datos**: NO interceptamos las llamadas a Firestore — el SDK de Firebase ya maneja su propio cache offline en IndexedDB. Habilitar `enableIndexedDbPersistence` si queremos offline-first más agresivo.
- **navigateFallback: null** intencional. No queremos que el SW devuelva `index.html` para rutas desconocidas porque romperíamos el truco 404.html → `?/path` de GitHub Pages.
- **Auto-update**: cuando se publica una versión nueva (merge a `main` → Actions, o `npm run deploy` a mano), el SW detecta el cambio en `sw.js` en la próxima navegación y se actualiza sin prompt al usuario (el reload siguiente toma la versión nueva).
- **Dev**: `devOptions.enabled: false` — el SW no corre en `npm run dev` para no pelearse con HMR.
