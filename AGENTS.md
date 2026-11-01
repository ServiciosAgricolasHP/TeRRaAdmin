# AGENTS.md

Las reglas de este repo, para personas y agentes. Lo de una sola pantalla está en `docs/screens/` (ver Documentación por pantalla).

## Cómo trabajar

### Idioma y comentarios

- **Idioma.** Los textos de la interfaz, los comentarios y las descripciones de los tests (`describe`/`it`) van en español neutro, sin voseo. Los identificadores, nombres de archivo, claves y valores técnicos y los campos nuevos de Firestore van en inglés, aunque el código de alrededor use nombres en español, y los términos del negocio se nombran como dice el Glosario (abajo). Los campos ya guardados (`faenaId`, `padron`) conservan su nombre.
- **Los comentarios y la documentación describen lo que hace el código, como si siempre hubiera sido así.** No cuentan la historia (el error que motivó un cambio, la versión anterior, lo que se descartó), ni planes o estados transitorios, ni fases o tareas por nombre. Si el código ya lo dice, no se comenta. Una restricción se escribe como comportamiento ("compara el rol sin distinguir mayúsculas"). Vale también para este archivo, `docs/` y los README.

### Flujo de trabajo en git

- **Tres caminos.** `main` es producción y solo recibe Pull Requests. `develop` junta los hitos de la próxima versión menor. Una rama `hotfix/<nombre>` lleva a producción un arreglo rápido sin lo que está a medio hacer en `develop`.
- **Un hito, un PR; la versión completa, un cambio de versión.** Los hitos de cada versión menor se anotan en el backlog. Cada hito pasa de `develop` a `main` en su propio PR apenas está completo, y el PR del último sube la versión (`npm version minor --no-git-tag-version`, en un commit propio). Entre medio, producción sigue en la versión anterior con el conteo de commits (v1.3.12).
  - El PR lleva todo lo que tiene `develop`: se trabaja un hito a la vez, o el que está a medio hacer espera a que esté completo. Lo que no puede esperar sale como hotfix.
- **Hotfix.** Cuando se pide un hotfix, el arreglo sale de `main` y no lleva nada de lo que está en `develop`:
  1. `git fetch` y `git switch -c hotfix/<nombre> --no-track origin/main`. Lo que haya sin commitear en `develop` se guarda antes (`git stash`) y se recupera al volver.
  2. El arreglo y sus tests, con las mismas reglas de cualquier commit (lint, tests, `docs/data-model.md`, la guía de la ayuda). Después, `git push -u origin hotfix/<nombre>` y el PR a `main`. El encabezado muestra el número siguiente (v1.3.1), porque cuenta los commits desde la última subida de versión.
  3. Mergeado el PR, `main` vuelve a `develop` con un merge (`git switch develop && git merge origin/main`) y la rama se borra. Va con merge, no con cherry-pick: el mismo cambio en dos commits choca en el próximo PR de `develop`.
- **Los conflictos se resuelven en `develop`, antes de abrir el PR a `main`**, nunca en el PR. Si `develop` no tiene algo de `main` (un hotfix sin volver), se mergea `origin/main` primero y se corren lint y tests sobre el resultado.
- **`docs/data-model.md` acompaña a cada cambio de modelo.** Una colección nueva, un campo nuevo, uno que cambia de tipo o de significado, o uno que se deja de escribir se documenta en el mismo commit; una colección nueva también va en `MAIN_COLLECTIONS` (`screens/adminConsole/collections.js`). Antes de un push se revisa que los commits que tocaron entidades lo hayan actualizado.
- `.github/workflows/ci.yml` — corre en push/PR dos jobs, los dos bloqueantes:
  - `build`: `npm run lint`, que falla con cualquier error o aviso (`--max-warnings=0`), y `npm run build`. Este build en Linux es lo que caza los imports con casing incorrecto que Windows esconde.
  - `test`: los tests de unidad, **sin `.env`** (un test que arrastra `src/firebase.js` falla con `auth/invalid-api-key`: se mockea `../firebase`; para reproducirlo, `VITE_FIREBASE_API_KEY= npx vitest run`), los e2e y las reglas, contra el emulador.
- `.github/workflows/deploy.yml` — push a `main` → build → publica `dist/` en la rama `gh-pages`.
- **Cloud Functions quedan fuera del pipeline** y se deployan a mano. La app no las invoca por HTTP: escribe un job en `functionJobs` y un trigger de Firestore v2 lo ejecuta. Van en `us-central1` y declaran `database: "hpdatabase"`; el porqué, la autorización y `npm run functions:verify` antes de cada deploy están en `functions/README.md`.

### Commits

- **Un commit por criterio**, con un mensaje corto en camelCase (`noWritesOnOpeningSummaries`), sin prefijos (`feat:`) ni líneas `Co-Authored-By`. Separar un archivo va en un commit aparte (ver "Componentes y archivos"). `.claude/settings.local.json` es la configuración local de cada quien y no se commitea.
- **Antes de commitear:** `npm run lint` en cero; `VITE_FIREBASE_API_KEY= npx vitest run`, que corre los tests como el CI, sin `.env`; y `npm run build` si cambiaron imports o nombres de archivo. Un cambio de interfaz se prueba en la app contra el emulador (ver Tests), en escritorio y a 412 px.
- **Los datos reales no entran al repo, que es público.** Ni planillas, ni JSON de nóminas, ni contactos, ni el nombre, RUT, cuenta o correo de una persona real en el código, los tests, la documentación o las capturas. Las pruebas usan datos inventados, y los archivos reales que se usan en local van en `.git/info/exclude`.

### Documentación por pantalla

Lo que vale para varias pantallas está en este archivo; lo de una sola, en su archivo de `docs/screens/`. **Antes de tocar una pantalla, sus piezas, su servicio o su cálculo, se lee su archivo.** Un cambio de comportamiento actualiza ese archivo en el mismo commit, y una pantalla nueva suma el suyo y su fila acá.

| Antes de tocar | Leer |
|---|---|
| Faenas, subfaenas y ciclos (`screens/Jobs.jsx`, `screens/jobs/`): crear, cerrar, reabrir, importar o eliminar | `docs/screens/jobs.md` |
| La grilla del ciclo (`screens/CycleDetail.jsx`, `screens/cycleDetail/`) | `docs/screens/cycle-detail.md`, "Ciclo cerrado = congelado" en `jobs.md`, `docs/labor-types.md` y "Candado en la grilla del ciclo" en `harvest-qr.md` |
| El precio o el monto de una jornada según el tipo de labor | `docs/labor-types.md` |
| El resumen del ciclo (`CycleSummaryModal`) o el del trabajador (`WorkerSummaryModal`) | `docs/screens/summaries.md` |
| Transportes: transportistas, vueltas, resúmenes y quincenas | `docs/screens/transports.md` |
| Trabajadores, sus bancos, contratos, honorarios e imposiciones | `docs/screens/workers.md` |
| Nómina: generar, el detalle, achicar o agrandar, el archivo del banco y el portal | `docs/screens/payroll.md` y, si toca anticipos o bonos, `advances.md` |
| Anticipos y bonos, y cómo los descuenta la nómina | `docs/screens/advances.md` |
| Calendario | `docs/screens/calendar.md` |
| Dashboard | `docs/screens/dashboard.md` |
| Facturación | `docs/screens/billing.md` |
| Cheques y pagos | `docs/screens/commitments.md` |
| Pesajes QR | `docs/screens/harvest-qr.md` |
| Agenda y Cuentas | `docs/screens/info-accounts.md` |
| Libro de Precios | `docs/screens/price-book.md` |
| Links útiles | `docs/screens/links.md` |
| Consola admin y respaldos | `docs/screens/admin-console.md` |
| Usuarios y los saludos personalizados | `docs/screens/users.md` |
| Auditoría, `services/logger.js` o la colección `logs` | `docs/screens/audit.md` |
| La barra lateral, el encabezado y la versión | `docs/screens/layout.md` |
| La pantalla de carga | `docs/screens/screen-loader.md` |
| Una colección o un campo de Firestore | `docs/data-model.md` |
| La ayuda (`/ayuda`): sus guías, la búsqueda y las capturas | `docs/screens/help.md` |
| El deploy, la PWA o la URL de GitHub Pages | `docs/deploy.md` |

## Código

### Stack

React 19 · Vite 7 · Tailwind CSS 4 · Firebase (Firestore + Auth) · ag-grid · React Router 7 · ExcelJS (lazy) · Recharts (lazy) · jsPDF (lazy) · html-to-image · ESLint flat config

- **Solo JavaScript** (no TypeScript).
- **React Compiler 1.0** habilitado vía `babel-plugin-react-compiler`.
- Variables de entorno con prefijo `VITE_`.
- `exceljs` se importa **lazy** (`await import("exceljs")`) solo al exportar — chunk separado de ~937 KB.
- `recharts` idem, vía `React.lazy` sobre `screens/dashboard/DashboardCharts.jsx` y la dona `CommitmentsDonut`, en un chunk separado de ~340 KB. El chunk principal ya está sobre el límite de Vite, así que toda librería pesada nueva va lazy.
- `jspdf` + `jspdf-autotable` también se importan lazy, solo al descargar el PDF del Informe de deudas.
- `marked` y `minisearch` van solo en el chunk de la ayuda (`screens/Help.jsx`, cargada con `React.lazy`).

### Arquitectura

```
src/
  main.jsx              ← punto de entrada
  App.jsx               ← las rutas (react-router-dom)
  firebase.js           ← Firebase (Firestore db = "hpdatabase")
  components/           ← UI compartida (Layout, ProtectedRoute, Modal, ConfirmDialog, RowMenu, Pager, TripEditModal, WorkerEditModal, WorkerSummaryModal, etc.)
  hooks/                ← hooks que usan varias pantallas (useIsMobile, useWorkersList, useValuesChanged, useCaptureActions, usePagination)
  screens/              ← un componente por ruta (ver Rutas) y, al lado, la carpeta con sus piezas
                        (jobs/, cycleDetail/, payroll/, transports/…; ver "Componentes y archivos")
  contexts/             ← Auth, Theme, Catalogs, Carriers y Toast: XContext.js + XProvider.jsx
  services/             ← capa de datos (Firestore CRUD + caché + auditoría), reunida en services/index.js
  utils/                ← cálculo y helpers de dominio, sin React ni Firestore (rutUtils, banks,
                        payroll, cosechaCombos, agGridLocale, similarity, etc.)
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
- **Las piezas de cada pantalla se listan en su archivo de `docs/screens/`** (ver "Documentación por pantalla"), agrupadas por área (como en `payroll.md`). Un archivo nuevo en una de esas carpetas se suma a la lista.

### Cálculo del negocio

- **Un cálculo del negocio vive en un solo lugar.** Contar jornadas, sumar montos o calcular un saldo se hace en un helper de `utils/`, con tests, y lo usan todas las pantallas que muestran ese número. Antes de escribir uno se busca si ya existe: con una copia por pantalla, un arreglo en una deja a las demás con el error.

### React y React Compiler

- ESLint: variables sin usar empezando con `A-Z_` son ignoradas. **El lint queda en cero** (el CI falla con cualquier error o aviso): una excepción con `eslint-disable` lleva su motivo al lado.
- **Efectos solo para sincronizar con algo externo.** Ajustar estado cuando cambia una prop (rellenar un formulario al abrir el modal, volver a la página 1 al filtrar) se hace durante el render con `useValuesChanged` (`hooks/`), no con un efecto. Para leer el valor actual de una función o una prop dentro de un efecto sin volver a correrlo, `useEffectEvent`; así también se carga al montar (`const loadOnMount = useEffectEvent(() => load())`). Las dependencias de un efecto se declaran todas: un `eslint-disable` de `react-hooks` hace que React Compiler se salte el archivo entero.
- **Lo que React Compiler no sabe leer no va en un componente ni en un hook**, porque se salta el archivo entero, sin avisar:
  - **Un `try`.** El compilador no acepta `finally`, ni condicionales u operadores lógicos dentro de un `try`. Un error se maneja con `attempt(fn)` (`utils/attempt.js`), que devuelve `{ value }` o `{ error }` sin lanzar: `const { error: err } = await attempt(() => service.update(id, data)); if (err) setError(err.message); setBusy(false);`.
  - **`localStorage`** se lee y escribe con `utils/browserStorage.js` (`readStored`, `writeStored` y sus versiones JSON), que nunca lanza.
  - **Un `import()` dinámico.** Una exportación va en su `write…Xlsx.js`, fuera del componente.
  - **Un `new Set()`, un `new Map()`, una función o un template string como valor por defecto** de una prop o un parámetro. Van en una constante del módulo o se calculan en el cuerpo (``const field = fieldProp ?? `${d}__total` ``).
  - **Una clave calculada con una llamada** (`{ [keyOf(x)]: value }`): la clave va antes en una variable.
  - **Un `for…of` que desestructura un objeto dentro de otro** (`for (const [i, { node }] of list.entries())`): se recorre por índice.
  - **`||=`**, y un `++` sobre una variable que usa una función de adentro.
- **Las columnas de ag-grid dependen solo de la forma de la grilla** (días, combos, vista), con todas sus dependencias declaradas. Las celdas son componentes que llaman a las acciones vigentes desde un ref que se actualiza en un efecto (`actionsRef`, en `WorkersTab` y en `GridCellsContext` de la grilla del ciclo), así cambiar una función no rehace las columnas. Ese ref lo leen las celdas en sus handlers: pasárselo a una función durante el render (`buildColumnDefs({ actionsRef })`) no compila.
- **Un callback que lee una propiedad de algo que puede ser `null` revisa primero que exista**: `onConfirm={() => toDelete && remove(toDelete.id)}`, o `if (!editing) return;` al principio de la función. React Compiler compara `toDelete.id` en cada render para saber si rehace el callback y, con `toDelete` en `null` (un diálogo cerrado), la pantalla se cae.

### Contextos

- **Cada contexto va en dos archivos**: `XContext.js` con el contexto, su hook (`useAuth`, `useToast`…) y lo que exporta además (`ROLES`, `THEMES`), y `XProvider.jsx` con el componente que lo provee. Así cada `.jsx` exporta solo componentes y Fast Refresh no recarga la página entera. Las pantallas importan el hook desde `XContext`; solo `App.jsx` importa los proveedores.
- Orden en `App.jsx`: `ThemeProvider` → `AuthProvider` → `CatalogsProvider` → `CarriersProvider` → `BrowserRouter`.
- `CarriersProvider` precarga transportistas; expone `carriers`, `activeCarriers`, `addCarrier`, `updateCarrier`, `softDeleteCarrier`, `restoreCarrier`. La lista se guarda 30 min también en `localStorage` (`CARRIERS_LIST`, `services/carriersService.js`): lo que se escribe en este navegador la corrige sin releerla, y lo que cambie en otro equipo llega cuando vence.
- `CatalogsProvider` precarga tablas de lookup usadas en las pantallas.

## Datos

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
- `AuthContext` guarda en el perfil el `email` de la cuenta y `lastSeenAt` (`userPrefsService.recordVisit`) al abrir la app y, con la app abierta, al volver a ella o usarla (cambiar de pestaña, un clic, una tecla), como mucho una vez cada 30 minutos (`visitDue`, `utils/userAccounts.js`). Un computador que despierta de la suspensión sigue con la página cargada y no vuelve a iniciar sesión, así que solo el arranque no alcanza. Es lo que muestra Usuarios: el navegador no puede listar las cuentas de Authentication.
- **`AuthContext` vuelca el doc `users/{uid}` entero en `user`**, así que cualquier campo que se le agregue queda disponible en toda la app sin pagar una lectura extra.

### Servicios

- `services/firestoreBase.js` exporta `createService(entityName, collectionName)`, que arma el CRUD de una colección.
- Cada servicio invalida su caché en memoria y escribe el log de auditoría con `services/logger.js`.
- `list()` acepta `cache: true`, con un TTL de 60 s por defecto; `persist: true` la guarda además en `localStorage`.
- Las escrituras en lote van con `writeBatch(db)`, en tandas de 450 (el límite de Firestore es 500).
- **`update`, `upsert` y `remove` cuestan una lectura además de la escritura**: hacen un `getById` interno para armar el `before` del log de auditoría. `create` no lee.
- **`remove` de un documento que ya no existe no borra ni escribe log**: un log de `delete` siempre trae el `before`, y de ahí sale su `meta`.
- **`upsert(id, data, { before })`** deja pasar el documento que el llamador ya leyó y se saltea ese `getById`. `undefined` = "no me lo pasaron, léelo"; `null` = "lo leí y no existe". La diferencia decide si el doc se crea con `createdAt`/`createdBy`, así que **no se puede colapsar en un chequeo de verdad/falsedad** — escrito `knownBefore ? …` el ahorro desaparece sin que nada falle a la vista. Fijado en `tests/e2e/upsert-before.test.js`, que lo observa pasando `null` sobre un doc que sí existe (única forma de ver desde afuera si la lectura ocurrió).
- **`countedList(service, opts)`** (en `services/cache.js`) envuelve un `list()` y devuelve `{ data, reads }`, con `reads: 0` cuando salió de la caché. Es lo que alimenta los contadores de lecturas de Dashboard, Calendario y Pesajes QR. Las opciones que se le pasan tienen que ser **exactamente** las de la llamada real: reconstruye la clave `collection::{wheres,order,take}`, así que si divergen el contador miente en vez de avisar.
- Un servicio nuevo que usan varias pantallas se exporta desde `services/index.js`.

### Registro de lecturas

- **Toda lectura y escritura de Firestore pasa por `services/readMeter.js`**: `getDocs`, `getDoc`, `getCountFromServer`, `onSnapshot`, `setDoc`, `updateDoc`, `addDoc`, `deleteDoc` y `writeBatch` se importan de ahí, con la misma firma que en `firebase/firestore`. El lint impide importarlas directo en `src/`.
- Mientras está encendido (**📈 Registro de lecturas** en la Consola admin, `readLogConfig/main`), cuenta por persona, día, hora y pantalla: las lecturas por forma de consulta, sin los valores de los filtros; lo que ahorró una caché; las visitas, el tiempo con la pantalla visible y las escrituras. Lo manda cada 5 minutos a `readLogs`, un documento por persona y día (ver `docs/data-model.md`). El cálculo, en `utils/readMeterKeys.js`, con tests.
- **Un modal que lee datos por su cuenta lleva `section`** (`<Modal section="Detalle de nómina">`, o `useReadSection` en un modal con overlay propio): mientras está abierto, sus lecturas quedan como `/payroll › Detalle de nómina`, también con modales anidados. El nombre es fijo: nunca el título, que puede llevar el nombre de una persona o un folio.
- La lista de trabajadores anota también lo que ahorra su copia (`recordCacheHit`).
- **📊 Informe de lecturas** (Consola admin) lo muestra por pantalla, consulta, colección, hora y persona, con filtros por persona (o sin los admin) y entorno. El cálculo, en `utils/readLogReport.js`, con tests.

### Caché aditiva

- `firestoreBase` soporta `additive: true` en `create`/`update`/`upsert`/`remove` — en vez de invalidar la entrada de caché correspondiente, la **corrige en su lugar**: agrega, actualiza o quita el documento. Útil cuando una colección se lista entera (sin `wheres`) y la queremos mantener fresca sin pagar el costo de re-leer todos los docs.
- Los servicios de las listas sincronizadas (abajo) están envueltos con `additiveService` (`services/index.js`), que usa `additive: true` por defecto en todas las mutaciones: un alta no invalida la lista guardada.
- **La lista completa de trabajadores se pide con `listWorkers()`** (`services/workersService.js`), nunca con un `workersService.list()` propio. Es una lista sincronizada (abajo) que se lee entera la primera vez del día en cada navegador, así cuesta unas pocas lecturas en vez de una por trabajador. Lo que se escribe sin `updatedAt` (el escáner, la consola de Firebase) y lo que se elimina en otro equipo entran con la carga completa del día siguiente o con Recargar en Nómina.
- Helpers internos: `mergeListItem` y `removeListItem` (solo tocan claves de caché con `wheres` vacío).

### Listas sincronizadas

- **Una colección que se lee entera se guarda en el navegador y se pone al día** con `createSyncedList(service, { order, syncKey, fullEveryDays, checkCount })` (`services/syncedList.js`). La copia no vence: cada vez que se pide, como mucho una vez por minuto, se traen solo los documentos con `updatedAt` desde la marca (1 lectura si no cambió nada) y se juntan con la copia. El cálculo, en `utils/syncedList.js`, con tests.
- Las escrituras de este equipo la corrigen en su lugar (`additive`), y **toda escritura de la colección pone `updatedAt`**: `firestoreBase` lo hace, y un `writeBatch` propio lo escribe a mano.
- **Lo que la consulta por `updatedAt` no ve** (lo escrito sin `updatedAt` y lo que se elimina en otro equipo) entra con la carga completa, cada `fullEveryDays` días, o al borrar la caché de la colección (`service.invalidate()`). Con `checkCount`, cada puesta al día cuenta además los documentos en el servidor (una lectura por cada 1.000) y, si no calzan con la copia, la lee entera: un borrado en otro equipo llega con la siguiente puesta al día.
- `sync()` devuelve la lista y cuántas lecturas costó; `list()`, solo la lista.
- Las usan los trabajadores (`listWorkers`: carga completa diaria, porque el escáner escribe sin `updatedAt`), la agenda telefónica (`listPhoneContacts`) y las faenas, subfaenas y ciclos (`listJobs`, `listSubjobs`, `listCycles`, en `services/jobLists.js`), estas con carga completa semanal y conteo. Los ciclos van sin orden y quien los quiere del más nuevo al más viejo usa `newestFirst` (`utils/syncedList.js`). Un `createdAt` que pasó por `localStorage` queda como `{ seconds, nanoseconds }`, sin `toDate()`: se lee con `millisOf` o `timestampIso`.
- **Una colección con lista sincronizada se pide entera con su función, nunca con un `list()` propio**, y una pantalla que necesita una parte (las subfaenas de una faena) filtra la copia. Otra clave arma otra copia que se vuelve a leer, y con la misma clave su TTL pisa el de la lista. Solo lee directo lo que tiene que estar recién actualizado: el ciclo abierto en la grilla, los ciclos de los que se importa, los de Pesajes QR y lo que se revisa antes de eliminar.

### Escrituras

- **Abrir o mirar no escribe.** Una pantalla o un modal escribe en Firestore solo después de una acción de la persona: guardar, editar un campo o apretar un botón. Un valor calculado que se guarda para otra pantalla (como `cycle.summaryTotals`, que lee el Dashboard) se escribe solo si cambió desde la última escritura. Cada escritura de un servicio cuesta una lectura y deja un log de auditoría a nombre de quien tiene la sesión.

### Fechas

- **La fecha de hoy (`YYYY-MM-DD`) sale de `localIsoDate()`** (`utils/dates.js`), nunca de `toISOString().slice(0, 10)`: esa da la fecha en UTC, y en Chile desde las 20 o 21 h ya es el día siguiente. Una marca de tiempo completa (`paidAt`, `createdAt`) sí va con `toISOString()`, porque es un instante y no un día.

## Interfaz

### Teléfono

- **La app también se usa en el teléfono, y cada pantalla se diseña para los dos anchos desde el principio.** El ancho de referencia es 412 px (Samsung A56). Bajo `md` (`useIsMobile`), las tablas densas pasan a tarjetas; lo que se toca mide al menos 32 px y la página no se desplaza a lo ancho.

### Tablas dentro de un modal

- **El ancho del modal sale de su tabla** (`size` de `Modal`): en escritorio la tabla entra entera, sin desplazarse a lo ancho. Montos, fechas y estados van en una línea (`whitespace-nowrap`), y un correo o un id largo se recorta (`truncate`) con el texto completo en `title`.

### Formularios

- **Mayúsculas de lo que se escribe a mano** (`utils/textCase.js`, con tests). Se corrigen al guardar, no mientras se escribe:
  - **Nombres de registros como título** (`toTitleName`): faena, ubicación, subfaena, labor y su agrupación, quincena, transportista (nombre y alias), centro de costo, alias de empresa, ficha de Agenda y Cuentas, faena, labor y lugar del Libro de Precios, y la nota de anticipos y bonos. Los conectores van en minúscula ("Poda y Amarre de Parrones") y los artículos solo después de "de"/"del" ("Fundo Los Robles", "Quincena de la Cosecha"). Las siglas van en mayúsculas: una palabra sin vocales siempre ("kws" → "KWS"; "Kg" y "Km" no cuentan) y, si el nombre tiene alguna minúscula, la palabra que se escribió entera en mayúsculas ("Ensayo INIA"). Lugar y destino de las vueltas pasan por `titleCase` en `transportsService`.
  - **Notas libres**: `unshout` solo las corrige si vienen **enteras en mayúsculas** (pasan a oración). Si tienen alguna minúscula, se respetan. Cubre las notas de faena, subfaena, ciclo, día del ciclo, transportista, vuelta, abono, resumen, quincena, factura y pago de factura, ficha y Libro de Precios.
  - **Quedan fuera a propósito**: la razón social (es el nombre legal del SII), el titular y el giro de las fichas (se copian al banco y al SII), el alias de los vehículos (las vueltas lo guardan como texto y dejarían de calzar), los líderes de grupo (se comparan como texto: `CHILENOS`, `EXTRANJEROS`) y los nombres de trabajadores (`toProperName`, con su propio flujo).
  - Al editar un ciclo, el prefijo "Faena/Subfaena/" de su etiqueta se reconoce sin distinguir mayúsculas, porque un ciclo antiguo puede traerlo en mayúsculas.
- **Un formulario en un modal avisa antes de perder cambios.** `Modal` recibe `dirty`: con cambios sin guardar, cerrar por el ✕, Escape o el clic afuera muestra "Cambios sin guardar" (Seguir editando / Descartar cambios), y cerrar o recargar la pestaña muestra el aviso del navegador. El "Cancelar" del formulario es un `ModalCloseButton`, que pasa por el mismo aviso; un `onClick={onClose}` directo se lo salta.
  - `dirty` sale de `hasChanges(cómoSeAbrió, valoresActuales)` (`utils/formChanges.js`, con tests), que compara lo que se ve: vacío, `null`, `false` y una fila en blanco valen lo mismo, y `150000` es igual a `"150000"`. Lo que no es dato del formulario va en `ignore` (el tipo elegido en un alta, respaldos internos como los `bd_prev*` de la ficha del trabajador).
  - Mientras se guarda, `dirty` va en `false`: el modal lo cierra quien guardó.
  - El modal no guarda la copia inicial: la arma cada formulario, con `useState(valores)` en el primer render, desde las props, o en el mismo bloque `useValuesChanged` que llena el formulario al abrir.
  - Escape cierra solo el modal de arriba, y el clic afuera cuenta solo si también empezó afuera: arrastrar una selección desde un campo hasta el fondo no cierra.
  - Conectado en las fichas y formularios de edición: trabajador (y el alta desde el selector de trabajadores), Cheques y pagos, anticipos y bonos, faena, subfaena, ciclo y labor, anotación del día, bonos, configuración del día y líderes por defecto de la grilla, vuelta, transportista, quincena, gasto informal, notas de una factura, prefijo QR, pesaje, ficha de Agenda y Cuentas, link, Libro de Precios, cuenta nueva, saludos, perfil e indicadores. En la grilla móvil del ciclo cada campo se guarda al salir de él, así que solo avisa por lo que se está escribiendo.

### Exportar, copiar e imprimir

- **Lo que se exporta es lo que se ve.** Un Excel, una imagen, una impresión o un PDF muestran exactamente lo de la pantalla: las mismas filas, ajustes, columnas y totales. Se arman desde los mismos datos que dibuja la pantalla, sin recalcular por su cuenta; si difieren, el error es del archivo.
- **Las imágenes que se copian o descargan salen siempre en el tema claro**, sea cual sea el tema de quien las genera: `captureFullWidthBlob` / `captureFullWidthDataUrl` (`utils/imageCapture.js`) le ponen al clon fondo blanco y redefinen las variables `--color-*` con `LIGHT_PALETTE`. Esa lista es copia de `:root` en `index.css`, y un test (`imageCapture.test.js`) falla si se separan.
- **Copiar la imagen, descargar el PNG e imprimir pasan por `useCaptureActions`** (`hooks/`). Cada acción recibe el nodo al llamarla, así una pantalla con varias tablas usa un solo hook; `busy` dice qué está en curso, y `run` corre cualquier otra exportación (el Excel) con el mismo aviso si falla. Una pantalla no arma su propio `try`/`finally` para esto.
  - Imprimir abre una ventana aparte con el HTML del nodo (`printNodes`, `utils/printWindow.js`): sin los controles marcados con `data-export-hide`, una hoja por nodo, el encabezado de cada tabla repetido en cada hoja y la orientación en un `@page` al nivel superior, porque anidado en `@media print` hay navegadores que lo ignoran. Las tablas imprimibles llevan su estilo en línea: la ventana no carga el CSS de la app.
  - Las impresiones que arman su propio HTML (los comprobantes y la tabla del resumen de Nómina, el informe de deudas y el mes del Calendario) abren la ventana con `openPrintWindow`. Si el navegador la bloquea, el aviso pide permitir las ventanas emergentes.

### Colores

- **Los colores salen de las variables del tema** (`var(--color-*)`), nunca fijos: el accent es naranja en donDiego y violeta en sheridan y aetiskPastel, así que un verde o un violeta escrito a mano se ve fuera de lugar en los otros temas.

### Ayuda

- **Una pantalla con guía en la ayuda mantiene su guía al día.** Un cambio de interfaz en esa pantalla actualiza el texto de la guía y regenera sus capturas (`HELP_GUIDES=<guía> npm run help:shots`) en el mismo commit; una tarea nueva suma su sección, con sus preguntas de ejemplo. Si el guion de captura falla, la guía quedó vieja. Cómo se escribe una guía: `docs/screens/help.md`.

### Alto de las listas y grillas

- **Regla**: la lista va `min-h-0 flex-1` dentro del `flex h-full flex-col` de la raíz y toma el alto que queda libre (Advances, Workers). Sin alto fijo ni control para arrastrarlo.
- Si la lista tiene algo debajo, eso va con `shrink-0` y un `max-h` propio, y la lista lleva además un alto mínimo para que no desaparezca en pantallas bajas: es el caso de la vista previa de Nómina, con el panel de efectivo abajo (`min-h-[240px] flex-1`). Cuando no cabe, desplaza el `<main>`.

### Páginas

- **Una lista larga se pagina con `usePagination` (`hooks/`) y `Pager` (`components/`)**: el rango que se ve ("Mostrando 51–100 de 1.183"), los números de página con ventana (`pageWindow`, `utils/pagination.js`) y la vuelta a la página 1 al cambiar un filtro o la búsqueda. Los totales y las descargas usan la lista entera, no la página. Paginan así Facturación, el historial de Nómina y la Agenda.

## Referencia

### Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo (HMR) |
| `npm run build` | Build de producción → `dist/` |
| `npm run lint` | ESLint (flat config, `.js` y `.jsx`); falla con cualquier error o aviso |
| `npm run preview` | Vista previa del build |
| `npm test` | Vitest sobre la lógica pura (~2 s, sin red) |
| `npm run test:watch` | Vitest en modo watch |
| `npm run test:e2e` | Ciclos end-to-end contra el emulador de Firestore |
| `npm run test:rules` | `firestore.rules` contra el emulador |
| `npm run test:all` | Los tres anteriores |
| `npm run functions:verify` | Cloud Functions contra los emuladores de functions, firestore, auth y storage, sin deployar |
| `npm run help:shots` | Regenera las capturas de la ayuda contra los emuladores, con datos inventados (`HELP_GUIDES=<id>` para algunas guías) |
| `npm run deploy` | Deploy manual a GitHub Pages (`gh-pages -d dist -t`). Solo si falla el camino normal, que es mergear a `main` y dejar que Actions despliegue |

### Tests

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
  cambian desde Usuarios (ver `docs/screens/users.md`).
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

### Despliegue

- Desplegado en GitHub Pages en: `https://serviciosagricolashp.github.io/TeRRaAdmin/`
- El path base `/TeRRaAdmin/` está en **dos archivos** — ambos deben coincidir:
  - `vite.config.js` → `base`
  - `src/App.jsx` → `<BrowserRouter basename="/TeRRaAdmin">`
- El deploy y sus secrets, la URL anterior, la PWA y el truco del 404 de GitHub Pages: `docs/deploy.md`.

### Glosario

Cada término del negocio tiene un solo nombre en el código. Lo nuevo usa el de esta tabla; un término que no está se agrega acá antes de usarlo.

| En pantalla | En el código | Colección |
|---|---|---|
| Faena / Subfaena | `job` / `subjob` | `faenas` / `subfaenas` |
| Ciclo | `cycle` | `cycles` |
| Labor | `labor` | dentro de `cycles.labors` |
| Jornada | `workday` | `workdays` |
| Piso (bono del día) | `floor` | dentro de `cycles.dayPrices` y `workdays` (guardado como `piso`, `pisoOnly`) |
| Cosecha | `harvest` | tipo de labor (guardado como `"cosecha"`) |
| Trato | `piecework` | tipo de labor (guardado como `"trato"`) |
| Trato por etapas | `pieceworkStages` | tipo de labor (guardado como `"tratoEtapas"`) |
| Jornada con horas extras | `overtimeDay` | tipo de labor (guardado como `"tratoHE"`) |
| Trabajador | `worker` | `worker` |
| Líder de grupo | `groupLeader` | `groupLeader` |
| Nómina | `payroll` | `payrolls` |
| Formato del archivo del banco | `bankFormat` | dentro de `payrollConfig` |
| Cobrar / Pagar (modos del resumen del ciclo) | `charge` / `pay` | `cycleSummaries` (guardado como `cobrar`) |
| Bono de manejo (conducir) | `drivingBonus` | dentro de `cycles.labors` (guardado como `bonusManejo`) |
| Anticipo / Bono | `advance` / `bonus` | `advances` (`type: "anticipo"` o `"bono"`) |
| Transportista | `carrier` | `carriers` |
| Vuelta | `trip` | `transports` |
| Resumen de transporte | `transportPayment` (`payment` dentro de Transportes) | `transportPayments` |
| Quincena | `fortnight` | `transportPayrolls` |
| Pesaje | `harvestWeight` | `harvestWeights` |
| Padrón de un prefijo QR | `roster` | dentro de `qrPrefixes` (guardado como `padron`) |
| Facturación | `billing` | |
| Factura (DTE) | `dteDocument` | `dteDocuments` |
| Nota de crédito | `creditNote` | dentro de `dteDocuments` |
| IVA | `vat` | |
| Retención de IVA | `withholding` | |
| Pendiente de cobro | `receivable` | |
| Otro impuesto | `otherTax` | |
| Contraparte | `counterparty` | |
| Centro de costo | `costCenter` | `costCenters` |
| Gasto informal | `informalExpense` | `informalExpenses` |
| Resumen anual / Proyección (Facturación) | `annualSummary` / `projection` | |
| Empresa | `company` | `companies` |
| Cheques y pagos | `commitment` | `commitments` |
| Tarea del backend (Cloud Functions) | `functionJob` | `functionJobs` |
| Respaldo en JSON | `backup` | `backups` |
| Agenda telefónica / contacto de la agenda | `phoneBook` / `phoneContact` | `phoneContacts` |
| Ayuda / guía de la ayuda | `help` / `helpGuide` | |
| Pregunta sin respuesta en la ayuda ("Avisar que falta") | `helpQuestion` | `helpQuestions` |
| Pantalla de carga | `screenLoader` | |
| Registro de lecturas (lo que lee cada pantalla) | `readLog` | `readLogs` (y su interruptor, `readLogConfig`) |
| Cumpleaños | `birthday` | dentro de `users` |
| Contrato u honorarios (un período) | `employment` | `employments` |
| Empleador | `employer` | `employers` |
| Honorarios | `fees` | tipo de `employment` (guardado como `"fees"`) |
| Boleta de honorarios | `feeReceipt` | |
| Lista de honorarios | `feeList` | `feeLists` |
| Lista de imposiciones | `contributionList` | `contributionLists` |
| Finiquito | `settlement` | dentro de `employments` (`settlementStatus`) |
| Imposiciones | `contributions` | |
| AFP / Salud (previsión) | `pensionFund` / `healthInsurance` | dentro de `worker` |

Los nombres guardados en Firestore se conservan aunque no calcen con la tabla (las colecciones `faenas` y `transportPayrolls`, el campo `faenaId`, el campo `payrollId` de un resumen, los campos en español de `dteDocuments`): el código los lee y escribe con su nombre guardado. La lista con el nombre propuesto para cada uno está en `docs/data-model.md` ("Nombres en español pendientes de migración"); un campo nuevo nace en inglés.

### Tipos de labor

Definidos en `src/utils/laborTypes.js` (`LABOR_TYPES`). Cada labor tiene un `type` que decide sus columnas en la grilla, cómo se cargan los datos y sus métricas. La tabla de los tipos, y cómo guarda y calcula cada uno sus precios y montos: `docs/labor-types.md`.

### Variables de entorno

- `.env` está en `.gitignore` y lleva las credenciales de Firebase (las `VITE_FIREBASE_*`). Se copia de otro `.env` o de la consola de Firebase del proyecto.

### Rutas

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
/info-cuentas                  Agenda y Cuentas (agenda telefónica y fichas con datos bancarios)
/links                         Links útiles
/calendar                      Calendario mensual
/audit                         Auditoría (admin only)
/admin/migrate-workers         Importar trabajadores desde CSV (admin)
/admin/cleanup-paid-workdays   Limpieza de workdays ya pagados (admin)
/admin/console                 Consola admin: Firestore counts (admin only)
/admin/users                   Usuarios: rol, suspensión, contraseña, saludos y cumpleaños (admin)
/harvest-qr                    Pesajes QR: explorador y sincronización → workdays (/admin/harvest-qr redirige)
/ayuda                         Ayuda: las guías de uso y el buscador (/ayuda/:guideId abre una guía)
*                              NotFound (catch-all dentro y fuera del Layout)
```
