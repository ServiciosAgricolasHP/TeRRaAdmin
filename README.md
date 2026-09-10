# TeRRaAdmin

Panel de administración para la gestión de operaciones agrícolas: faenas, ciclos, jornadas, transporte, anticipos, nómina bancaria y facturación.

> El repo se llamaba `adminAgrofrutos`. Al renombrarlo cambió el path de GitHub Pages — ver [Despliegue](#despliegue).

## Tecnologías

- **React 19** con **React Router 7**
- **Vite 7** como bundler y servidor de desarrollo
- **Tailwind CSS 4**
- **Firebase** (Firestore + Auth)
- **ag-grid** para tablas
- **ExcelJS** (lazy) para generación de XLSX con estilos
- **xlsx** (SheetJS) para lectura de planillas importadas
- **html-to-image** + **jszip** para exportar resúmenes a PNG / portapapeles / ZIP
- **React Compiler** (`babel-plugin-react-compiler`) para optimización de renders
- **ESLint** flat config

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Iniciar servidor de desarrollo (HMR) |
| `npm run build` | Compilar para producción → `dist/` |
| `npm run lint` | Ejecutar ESLint |
| `npm run preview` | Vista previa del build de producción |
| `npm run deploy` | Deploy manual a GitHub Pages (escape hatch — ver abajo) |

No hay framework de tests configurado.

## Flujo de trabajo

El día a día va en `develop`; `main` es producción y solo recibe merges vía Pull Request.

```
develop  ──commits──▶  PR  ──merge──▶  main  ──▶  Actions  ──▶  gh-pages
              │                                     │
              └── ci.yml: lint + build               └── deploy.yml: build + publish
```

- **`.github/workflows/ci.yml`** corre en cada push y PR. `npm run build` **bloquea** el merge si falla; `npm run lint` es informativo (`continue-on-error`) por deuda previa. El build en Linux es el que caza los imports con casing incorrecto que Windows no detecta.
- **`.github/workflows/deploy.yml`** corre al mergear a `main`: compila y publica `dist/` en la rama `gh-pages`. No hay que hacer nada a mano.
- `npm run deploy` sigue existiendo como escape hatch (deploy directo desde tu máquina), pero saltea el CI.
- Las Cloud Functions **no** están en el pipeline: se deployan a mano (ver [`functions/README.md`](functions/README.md)).

## Despliegue

GitHub Pages → `https://serviciosagricolashp.github.io/TeRRaAdmin/`

> El path base `/TeRRaAdmin/` debe coincidir en dos archivos:
> - `vite.config.js` → `base`
> - `src/App.jsx` → `<BrowserRouter basename="/TeRRaAdmin">`

**URL vieja**: `/adminAgrofrutos/` sirve un stub que redirige a la nueva. GitHub **no** redirige URLs de GitHub Pages cuando se renombra un repo (solo las de git/web), así que el stub es un repo aparte con el nombre viejo, bajo la misma organización, sirviendo un `index.html` + `404.html` que hacen `location.replace`.

**Secrets en Actions**: el build del deploy necesita las 6 variables `VITE_FIREBASE_*` cargadas como *repository secrets* (Settings → Secrets and variables → Actions). `.env` está gitignoreado, así que sin ellas el bundle sale con la config de Firebase vacía y producción cae con `auth/invalid-api-key`.

## Configuración del entorno

`.env` (ignorado en git):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Estructura

```
src/
  main.jsx              ← Punto de entrada
  App.jsx               ← Router
  firebase.js           ← Firebase init (Firestore db = "hpdatabase")
  components/           ← UI compartida
  screens/              ← Pantallas de cada ruta
  contexts/             ← Auth, Theme, Catalogs, Carriers
  hooks/                ← Hooks reutilizables
  services/             ← CRUD Firestore + caché + auditoría
  utils/                ← Helpers de dominio
public/
  logo.png              ← Usado en resúmenes y comprobantes
functions/              ← Cloud Functions (deploy manual, ver su README)
docs/
  data-model.md         ← Shape de cada colección de Firestore + diagrama ER
```

> `components/` va en minúscula. El filesystem de Windows no distingue mayúsculas, pero el runner de Linux del CI sí: un import `../Components/Modal` compila local y rompe el build en Actions.

## Autenticación

- Firebase Email/Password.
- Roles: `admin`, `supervisor` (por defecto si no hay perfil).
- Perfiles en colección `users` (id = uid de Firebase).
- `/audit` requiere rol admin.

## Módulos

### Faenas / Ciclos
Jerarquía Faena → Subfaena → Ciclo → Labors → Workdays. El nombre del ciclo se compone de un prefijo bloqueado `Faena/Subfaena/` + sufijo editable. Cada ciclo se puede renombrar, abrir, cerrar y eliminar. Se permiten múltiples ciclos abiertos en la misma subfaena.

**Importar al crear un ciclo**: si ya hay un ciclo abierto en la misma subfaena, el form de creación ofrece una sección de import opt-in. Permite elegir qué labores clonar (con su config completa), si copiar la lista de días, si copiar precios por día, y si mover los workdays existentes al nuevo ciclo (saltea los que ya estén en una nómina para no romper snapshots).

**Pisos (trato / cosecha)**: opt-in por día. En el panel de Precios cada día tiene un botón **"+ piso"** discreto que solo aparece si no está configurado; al guardarlo se muestra inline con acciones editar/quitar. La grilla agrega una columna "P" 🪙 **solo** en los días que tienen piso (configurado o asignado a alguien) — el resto queda sin columna extra. Click marca/desmarca el piso del trabajador (se crea/borra un workday separado con flag `pisoOnly`). El monto se suma al pago de producción y se refleja como columna/total separado en resúmenes y nómina.

### Trabajadores
Búsqueda server-side por prefijo (RUT o nombre, ≥4 caracteres, debounced 250ms) con cache de la sesión. Acciones rápidas para asignar Cuenta RUT (Banco Estado) o marcar como Efectivo.

**Filtros opcionales** (componibles con la búsqueda, opt-in): dropdown de líder (incluye "Sin líder") + chips toggle 💵 Efectivo / 🏦 Transferencia. Al activar cualquiera se carga la lista completa de trabajadores (cache 24h en localStorage, una sola query) y los filtros se aplican client-side; la regla de ≥4 caracteres se relaja para listar sin búsqueda. Si además hay texto, se filtra encima por substring acentos-insensitive sobre nombre y RUT.

El **líder de grupo** es estricto: dropdown con líderes ya existentes; crear nuevos requiere acción explícita.

### Transportes
Cinco pestañas: Transportistas, Vueltas, **Pago por faena** (selecciona ciclos + rango de fechas, genera un resumen de pago por transportista), Resúmenes y **Quincenas**.

Jerarquía: vuelta → resumen (`transportPayments`) → quincena (`transportPayrolls`). Una quincena agrupa resúmenes de **varios** transportistas para pagarlos en bloque; marcarla pagada cascadea a cada resumen y a cada vuelta.

Los resúmenes admiten **abonos** (pagos parciales) antes de darse por pagados. El `total` de resúmenes y quincenas es un valor **guardado**, no calculado al leer: lo mantiene el servicio en cada escritura de vuelta. Si alguna vista muestra un monto distinto al detalle imprimible, es que algo escribió sin propagar.

**Imprimir varios resúmenes en lote**: botón en la pestaña Resúmenes / Pagos que abre un modal con filtros (estado pendiente/pagado/ambos, rango de fechas, multi-select de transportistas, multi-select de faena/subfaena). Dos botones de salida: 🖨 Imprimir todos en una única ventana (cada resumen en su propia página, con `page-break-after`) o 📦 Descargar ZIP con un PNG por resumen. Los filtros por faena/subfaena requieren cargar las vueltas una vez (cache en el modal).

### Anticipos y Bonos
Módulo separado para plata que se mueve fuera de la producción. Dos tipos: **anticipo** (descuenta de la próxima nómina) y **bono** (suma). El signo lo da el tipo, no el monto.

Estados: pendiente / **parcial** / aplicado / cancelado. "Parcial" es un anticipo que ya se cobró en parte y sigue con saldo — cuenta como pendiente en filtros y totales.

**Pago en cuotas** (solo anticipos): al crearlo se puede elegir en cuántas cuotas se descuenta y con qué frecuencia (Por pago / Quincenal / Mensual). La frecuencia es una **etiqueta de referencia, no una regla automática**: no hay ningún proceso programado en la app, así que al generar una nómina aparece un modal listando las cuotas candidatas —marcadas por defecto— para que el admin confirme cuáles entran en ese pago. El plan queda fijo al crear el anticipo.

El **resumen del trabajador** (módulo Trabajadores → 📊) muestra una sección "Anticipos y Bonos pendientes" con cada uno, su saldo y nota, y cuando hay saldo el bloque de totales lo desglosa (anticipos restan, bonos suman) hasta el `NETO ESTIMADO`.

El **resumen del ciclo** (módulo CycleDetail → 📊) agrega una segunda sección "Resumen por trabajador" — una infografía por labor con grilla `Trabajador × Días` (similar al grid pero imprimible). Cada labor tiene sus propios botones 📋 / 📥 / 🖨 para capturar sólo esa sección; el botón global del modal captura todo. Las celdas usan labels del catálogo (envase, calidad, tipo de trato) y al imprimir el thead se repite en cada hoja nueva.

### Nómina
Selector de ciclos activos con monto pendiente por ciclo. Cada ciclo seleccionado expone sus labores como chips toggleables — sirve para pagar solo algunas labores y dejar el resto disponible para una próxima nómina. Preview con anticipos pre-aplicados, validación de cuentas, filtros y bulk actions. Genera XLSX con cuatro hojas:

1. **Nomina** — formato Banco de Chile (subir al portal del banco).
2. **Resumen** — Transferencias / Efectivo / Total por ciclo.
3. **Transferencias** — desglose por trabajador y ciclo.
4. **Efectivo** — agrupado por líder con paletas de color y subtotales.

Hay descarga **sólo Nómina** (la hoja BChile pura) o XLSX completo. Comprobantes imprimibles del efectivo (uno por líder, con líneas de firma) e incluyen una columna **Anticipo** explícita cuando algún trabajador del grupo trae descuento.

El **Detalle de pago** imprimible abre con un **Resumen por subfaena** (una fila por subfaena, con la faena impresa sólo en la primera fila del bloque): columnas `Con cuenta RUT` (todas las transferencias) vs `Efectivo` + TOTAL.

Anti doble pago: cada workday se etiqueta con `payrollId`. Al eliminar una nómina, los workdays y anticipos vuelven a estar disponibles.

Cada generación de nómina escribe además un **snapshot JSON** inmutable (colección `payrollSnapshots`, 1:1 con `payrolls`) que se autodescarga y queda disponible para re-bajar desde el historial. Es la fuente que va a consumir el **portal de trabajadores** (read-only).

### Facturación
Libro de compras y ventas alimentado por el **CSV del RCV del SII**. Multi-empresa (la empresa activa se persiste en `localStorage`). El docId de cada DTE es **determinístico**, así que reimportar el mismo período es idempotente y preserva el estado de pago y los abonos ya cargados. Notas de crédito restan con signo. Incluye estados de pago con abonos parciales, **centros de costo** para etiquetar a mano lo que no agrupa por proveedor, **gastos informales** (plata sin respaldo tributario, separada de la data fiscal) y una tab **Resumen** que cruza los 12 meses del año.

### Libro de Precios
Registro contable **independiente** del resto de la app: no lee ni alimenta ciclos ni jornadas. Guarda qué se pagó (`payPrice`) y qué se cobró (`chargePrice`) por labor, faena y período, con líneas por unidad y su par de hora extra cuando corresponde. Acepta faenas "dummy" que nunca existieron como `faena` real.

### Información y Cuentas
Libreta compartida de contactos (persona o empresa) con datos bancarios listos para copiar/pegar, N cuentas por ficha. Modelo independiente: no se vincula a trabajadores ni a empresas.

### Pesajes QR (admin)
`/admin/harvest-qr` — sincroniza hacia `workdays` los pesajes de cosecha que escanea una **app externa de QR**. Cada prefijo de QR físico apunta al (faena, ciclo, labor) vigente; ese apuntado se actualiza a mano al abrir un ciclo nuevo. La app admin nunca escribe los pesajes, solo los lee.

### Links útiles
`/links` — listado de atajos a herramientas externas frecuentes. CRUD simple con reordenamiento drag-and-drop persistido en la colección `interestLinks`.

### Calendario
`/calendar` — vista mensual con barras de color por subfaena por día. Click en el día (zona blanca) abre un modal de zoom con todas las subfaenas del día; click en una barra abre un drawer con detalle (por labor + transportes) de esa subfaena. Carga workdays + trips del rango del mes con cache de sesión (5 min) — costo aprox. ~3k reads en mes pico. La función `fetchWorkdaysInRange` está aislada para migrar a snapshot por ciclo cerrado cuando el volumen lo justifique.

En el drawer del día cada labor es expandible: muestra la **lista de trabajadores** que participaron (con nombre + RUT + producción + monto, ordenados por monto desc) y, para cosecha, la **distribución por calidad / envase** (cards con kg y % por combo). La lista de trabajadores se carga una vez por sesión usando el cache 24h compartido con la pantalla de Trabajadores (0 reads extra después de la primera carga del día).

### Consola admin
`/admin/console` — solo admin. Permite contar workdays por mes/rango/ciclo y ver totales por colección usando `getCountFromServer` (1 read por cada 1000 docs vs N reads con `getDocs`).

## Auditoría

`/audit` (admin) — cada mutación escribe un log con quién, qué y el diff. Dos vistas:

- **Sesionizada**: los logs del rango elegido agrupados por usuario, cortando una "sesión" cada vez que pasa más de N minutos entre acciones.
- **Buscar por registro**: todo el historial de un registro puntual, sin límite de fecha. Además de los cambios al registro mismo suma sus **satélites** — al buscar un trabajador vienen sus jornadas, y al buscar un transportista sus vueltas y sus resúmenes de pago. Eso funciona porque el log denormaliza el "dueño" en `meta` (un log de `update` guarda solo el diff, así que sin eso no habría por dónde buscarlo).

## Servicios de datos

- `services/firestoreBase.js` exporta `createService(entityName, collectionName)` — factory CRUD.
- Caché en memoria con invalidación automática y logs de auditoría (`services/logger.js`).
- `list()` soporta `cache: true` con TTL (60s default) y `persist: true` (localStorage).
- Batched updates con `writeBatch(db)` directo en chunks de 450.

## Rutas

```
/                              Dashboard
/login                         Login
/faenas                        Faenas / Subfaenas / Ciclos
/cycles/:id                    Detalle de ciclo
/workers                       Trabajadores
/transports                    Transportes
/advances                      Anticipos y Bonos
/payroll                       Nómina
/facturacion                   Facturación (import RCV del SII)
/price-book                    Libro de Precios
/info-cuentas                  Información y Cuentas
/links                         Links útiles
/calendar                      Calendario mensual de producción
/audit                         Auditoría (admin)
/admin/migrate-workers         Importar trabajadores desde CSV (admin)
/admin/cleanup-paid-workdays   Limpieza de workdays ya pagados (admin)
/admin/console                 Consola: conteos de Firestore (admin)
/admin/harvest-qr              Sincronizar pesajes QR → workdays (admin)
*                              NotFound (404) — botones "Volver" + "Ir al Dashboard"
```

### Hosting de SPA en GitHub Pages

GitHub Pages no resuelve rutas client-side; usamos el truco de [rafgraph/spa-github-pages](https://github.com/rafgraph/spa-github-pages):
- `public/404.html` redirige cualquier ruta desconocida a `index.html?/<path>`.
- `index.html` lee ese query, hace `history.replaceState` para devolver la URL correcta, y React Router toma el control.

Resultado: `https://serviciosagricolashp.github.io/TeRRaAdmin/cycles/abc123` recargado en navegador navega bien en vez de devolver 404.

### PWA (instalable en mobile/desktop)

La app está configurada como **PWA** vía `vite-plugin-pwa`. Esto significa:
- Al abrir la URL en Chrome (Android) o Safari (iOS), el navegador ofrece **"Instalar app" / "Agregar a pantalla de inicio"**. Queda ícono en el escritorio del teléfono y abre en pantalla completa, sin barra del navegador.
- Service worker precachea los assets → la app abre instantáneamente y funciona aunque haya señal pobre (Firestore tiene su propio cache offline en IndexedDB).
- Auto-actualización: cuando se publica una versión nueva (merge a `main` → Actions), la próxima vez que se abre la app el SW detecta el cambio y la aplica sin que nadie tenga que reinstalar.

No es un APK ni se sube a Play Store / App Store — se distribuye con la **misma URL** del deploy.
