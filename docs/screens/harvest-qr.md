# Pesajes QR / HarvestQr

- Pantalla: `src/screens/HarvestQr.jsx` (el componente de la ruta, con sus pestañas y la tabla de prefijos). Ruta `/harvest-qr`, para todas las cuentas (`/admin/harvest-qr` redirige ahí). Colecciones `harvestWeights` + `qrPrefixes` (CRUD).
- Sus piezas, en `src/screens/harvestQr/`:
  - **Prefijos:** `PrefixFormModal` y `SyncModal` (la sincronización hacia jornadas).
  - **Pesajes:** `WeightsExplorer` (la búsqueda por QR, los totales por combo y las agrupaciones salen de `utils/harvestWeightsView.js`) y `WeightFormModal`.
  - **IDs QR:** `QrManager`, `AssignQrModal` y `BackfillQrModal`.
  - **Comunes:** `ProgressBar`, `TypeToConfirm` y `helpers.js` (TTL de las listas compartidas, contador de lecturas y fechas de la sincronización).
- Fuera de la carpeta: `utils/qrCodes.js` (prefijo, número, dueño y códigos libres, con tests), `services/qrCodesService.js` (`assignQrCode` y el padrón, `syncRoster`) y `services/harvestSyncService.js` (`mirrorWeightToWorkdays`: el espejo pesaje → jornada al guardar un pesaje a mano).
- `harvestWeights` la escribe una **app externa de escaneo** y es la fuente de verdad de la producción. Acá se lee para sincronizar hacia `workdays`, y además se puede corregir a mano desde el explorador: agregar o editar un pesaje (`WeightFormModal`, que firma con `supervisor`) y completar el `idQr` de pesajes viejos.
- `qrPrefixes` (docId = el prefijo, ej. `"HP"`) es el puente entre un QR físico y el (faena, ciclo, labor) vigente al que hay que mandar sus pesajes. **Se reapunta a mano cada vez que se abre un ciclo nuevo** — semi-manual a propósito, no hay forma segura de adivinar el ciclo destino.
- La sincronización agrupa los pesajes del rango por (trabajador, día, combo calidad/envase) sumando kilos, y escribe los `workdays` resultantes. Los ejes del combo se mapean con `qualityMap`/`containerMap` del prefijo; sin ellos el mapeo es identidad (los catálogos usan la misma numeración que la app de scan).
- `healthOf()` marca un prefijo como roto si su ciclo/labor apuntado ya no existe, dejó de ser de cosecha **o el ciclo está cerrado**: detecta un prefijo que quedó sin reapuntar. El nivel `red` es el que deshabilita el botón de sincronizar, así que marcar ahí alcanza para bloquear.
- **La sincronización paga una lectura por jornada, no dos.** Lee cada workday para saber si ya está liquidada (`payrollId`) y le pasa ese mismo documento al `upsert` como `before`, en vez de dejar que el servicio lo vuelva a leer. El `Map` `alreadyRead` existe para eso.
- **No se sincroniza contra un ciclo cerrado.** Ese ciclo ya se liquidó o está por liquidarse, y escribirle jornadas por detrás descuadra lo que se pagó. Hay dos chequeos a propósito: `healthOf` apaga el botón, y `run()` vuelve a mirar el `status` del doc fresco porque la lista de ciclos es cacheada y el cierre lo hace otra pantalla.
- **La sincronización lee `harvestWeights` SIN caché, y tiene que seguir así.** De esos documentos salen las jornadas que se pagan; sincronizar sobre pesajes viejos escribe producción incompleta. Lo cacheado es solo el explorador, que es para mirar.

## Costo de lecturas

- **Explorador de pesajes**: el rango de `dateKey` **y el prefijo** van en la query, así elegir un prefijo baja las lecturas. La búsqueda por trabajador es en cliente (es sobre nombre/RUT, no hay campo indexable).
- **El filtro por prefijo depende del índice compuesto `(prefix, dateKey)`**, el mismo que ya usa la sincronización. Si falta, Firestore responde `failed-precondition`: la pantalla lo recuerda, vuelve a pedir sin el filtro y lo aplica en memoria, mostrando un `⚠ filtro en memoria`. No hay `firestore.indexes.json` en el repo (los índices se manejan en la consola), así que ese camino de respaldo no es teórico.
- **TTL largo (2 h) + botón 🔄 Refrescar**, no TTL corto. Los pesajes cambian todo el rato mientras se cosecha, y por eso mismo ningún TTL automático deja la pantalla fresca: solo decide cada cuánto se vuelve a pagar. Con TTL largo la antigüedad queda a la vista ("hace N min") y refrescar es una decisión de quien mira. Los inputs de fecha van con debounce de 400 ms, para no releer el rango en cada tecla.
- El explorador **no persiste** en `localStorage`: cada rango es su propia clave y la lista de trabajadores ya ocupa lo suyo. En memoria alcanza para ir y venir entre pestañas.
- **Contador de lecturas visible solo para admin** en las tres pestañas (`· N lecturas` / `· desde caché`), mismo criterio que Dashboard y Calendario. Es lo que hace verificable todo lo anterior: si un día vuelve a mostrar un número grande donde decía "desde caché", alguien cambió las opciones de un `list()` y rompió la clave compartida.
- La lista de trabajadores sale de `listWorkers` (ver `docs/screens/workers.md`), y el Gestor QR muestra lo que costó ponerla al día. Las faenas salen de `syncJobs()`, la copia que comparten las pantallas, y el contador suma lo que costó ponerla al día.

## Candado en la grilla del ciclo

- Una labor apuntada por un prefijo QR activo se marca en `CycleDetail` con un chip **📱 \<PREFIJO\>** (en las tarjetas y en la barra de pestañas) y sus **celdas de producción quedan de solo lectura**, con un aviso arriba de la grilla.
- El motivo no es de permisos: la sincronización hace `upsert` sobre el mismo docId, así que **pisa `qty` y `amount`**. Lo que se tipee a mano no queda compitiendo con el scan — desaparece en la próxima corrida sin dejar rastro. Bloquear es más honesto que advertir.
- El **piso sigue editable**: es un bono manual, vive en un workday aparte (`comboKey: "_piso"`) y la sincronización no lo toca.
- La fuente es `qrPrefixes`, **no** el campo `harvestSynced` de los workdays: hay que saberlo antes de que llegue el primer pesaje, que es justo cuando la grilla está vacía y tienta llenarla a mano. Cuesta 4 lecturas cacheadas a 1 h.
- El predicado vive en `utils/harvestSync.js` (`isPrefixSyncing`, `qrLockedLaborsOf`) con tests: decide si se puede escribir en una grilla de la que sale plata. Ojo con `active`: ausente cuenta como **activo**, igual que en la pantalla de Pesajes QR.
- Además de `editable`, el candado se chequea al pegar y al borrar varias celdas (`writeBlockedReason`, en `useCellEdits`): son los caminos que escriben celdas sin pasar por ahí.
