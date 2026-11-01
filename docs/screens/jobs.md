# Faenas / Ciclos / Cycles

- Pantalla: `src/screens/Jobs.jsx` (el componente de la ruta `/faenas`: las tarjetas de las faenas por grupo y el detalle de la elegida). Sus piezas, en `src/screens/jobs/`:
  - **Carga:** `useJobsData` (las faenas con el orden de sus tarjetas, y las subfaenas y ciclos de la faena elegida). Las faenas, las subfaenas y los ciclos salen de la copia que comparten las pantallas (`listJobs`, `listSubjobs`, `listCycles`); los de una faena se filtran de ella, y los ciclos van del más nuevo al más viejo (`newestFirst`). Lo que se revisa antes de eliminar una faena se lee directo.
  - **Grupos y colores:** `useJobLayout` (grupos, colores, grupos plegados y arrastrar para reordenar), `GroupHeader` (el encabezado de un grupo de faenas), `ColorPickerButton` y `ColorPalette`.
  - **Detalle de la faena:** `SelectedDetail`, `SubjobListBody` (sus subfaenas), `CycleRow` y `useSubjobDisplay` (subfaenas plegadas, ciclos cerrados a la vista y subfaenas ocultas).
  - **Faenas y subfaenas:** `useJobForms`, `JobFormModal`, `SubjobFormModal` y `FirstCycleOfferModal` (ofrecer el primer ciclo de una subfaena nueva).
  - **Ciclos:** `useCycleForm` y `CycleFormModal` (alta y edición, con `ImportSection` para importar desde un ciclo abierto), y `useCloseCycleFlow` con `CloseCycleModal` (cerrar y encadenar el siguiente). El cálculo de importar y encadenar vive en `utils/cycleCreation.js`, con tests.
  - **Eliminar:** `useJobDeletion` (faena, subfaena o ciclo, con la cascada y sus bloqueos).
  - **Comunes:** `helpers.js` (`withInitial`, `defaultLabors`, `newId` y `todayStr`).
  - **Resumen de producción:** `ProductionSummaryModal` (lo abren el ciclo y la faena), con sus piezas en `productionSummaryModal/`: `useProductionData` (las jornadas, vueltas y grupos de labor que lee mientras está abierto), `CombinedSummaryCard` (la tabla general), con `useProfitSettings` (los % de ganancia, lo que paga el cliente, "ya pagamos" e IVA, guardados en el dispositivo), `ProfitSettingsPanel` (donde se ajustan), `combinedSummaryText.js` (el texto que se copia) y `writeCombinedSummaryXlsx.js`; `LaborSummaryCard` (con `writeLaborSummaryXlsx.js`), `LaborGroupTotalsCard`, `buildCell.js` (los datos de una celda), `tableStyles.js` y `helpers.js`. Las reglas de ganancia y los totales de la tabla general viven en `utils/combinedSummary.js`, y el orden de los ciclos, las columnas, los días, los datos de cada labor, el transporte y los totales por grupo en `utils/productionSummary.js`, los dos con tests.
- Jerarquía: Faena → Subfaena → Ciclo → Labors → Workdays.
- Label de ciclo = prefijo bloqueado `Faena/Subfaena/` + sufijo editable.
- Estados: `open` | `closed`. Se permiten **múltiples ciclos abiertos** por (faena, subfaena) — útil para correr varios frentes en paralelo o para "carve off" temporales.

## Alta encadenada: subfaena → primer ciclo → primer día

- **Crear una subfaena ofrece crear su primer ciclo** (modal "¿Crear el primer ciclo?", cancelable con "Después"). Una subfaena sin ciclos no tiene dónde anotar jornadas, así que quedarse ahí no es un estado útil.
- **El ciclo nace con la fecha de inicio como primer día** (`days: [startDate]`), así la grilla abre con una columna. Mismo criterio en `createNextCycle` (el ciclo que se encadena al cerrar el anterior).
- **La primera labor: se elige el tipo**, no siempre `main`. Más un checkbox para sumar de una una labor de **Supervisión**, que es la combinación habitual. El checkbox se deshabilita si el tipo elegido ya es `supervision` — si no, el ciclo nacería con dos labores idénticas.
- El plan lo arma `initialLaborPlan({ type, withSupervision })` (`utils/laborTypes.js`), que devuelve descriptores **sin `id`**: el id lo pone quien crea el ciclo, que es el que ya tiene el generador. El nombre sale del tipo, salvo `main`, que se llama **"Principal"**.
- Los trabajadores que se pasen van **solo en la primera labor**; la de supervisión arranca vacía.
- El bloque del tipo de labor **no se muestra con la importación activa**: ahí las labores salen del ciclo origen y elegir un tipo no tendría efecto.
- **Un solo botón de alta de subfaena por estado**: el del encabezado de la faena (y el del estado vacío, que viene con la explicación).
- `CycleRow` permite **✏ Renombrar**, abrir, cerrar y eliminar.

## Ciclo cerrado = congelado

- **Cerrar un ciclo es la señal de "esto ya está pagado y revisado": queda de solo lectura para todos, admin incluido.** Para corregir algo hay que **reabrirlo** con el botón del encabezado — un cambio de estado visible, con confirmación, y que queda en el log de auditoría.
- **El corte es el cierre del ciclo, NO el `payrollId` del workday.** Se paga a mitad de ciclo y después se sigue trabajando ahí para revisar detalles y generar diferencias; bloquear por "ya pagado" rompería ese paso. Por la misma razón el cierre es manual y no se dispara solo al pagar.
- **Toda escritura de `CycleDetail` pasa por `cycleWrite` / `wdWrite`**, dos envoltorios de `useCycleWriteGuard` (`screens/cycleDetail/useCycleWriteGuard.js`) que llaman a `assertOpen()` antes de tocar Firestore. El guard vive en un solo punto y no repartido por los ~40 llamados al servicio: basta uno que se olvide para que el candado sea un adorno. **Lanza** en vez de devolver en silencio, porque los llamadores actualizan el estado local justo después de escribir — si dejara seguir, la pantalla mostraría un cambio que nunca se guardó.
- Quedan fuera del guard a propósito, y son las únicas cuatro: las dos escrituras de normalización de la carga (`useCycleLoader`; corren al montar, no son edición del usuario) y cerrar/reabrir el ciclo (`useCycleClosing`), que es el gesto que levanta el candado.
- Banner 🔒 sobre la grilla explicando que está congelado y cómo reabrirlo. La línea del encabezado dice `🔒 ciclo cerrado (solo lectura)`, sin distinguir rol.
- **Reabrir no está restringido a admin**: cualquiera que vea el botón levanta el candado. El cierre evita ediciones por accidente; no es un permiso.
- **Cerrar de una vez lo ya pagado** (desde Nómina, `screens/payroll/CloseCyclesModal.jsx`): al marcar una nómina pagada, si alguno de sus ciclos quedó pagado por completo se ofrece cerrarlo ahí mismo; y en Generar, "🔒 Cerrar pagados (N)" junta todos los ciclos abiertos en esa situación. Vienen todos marcados y se puede destildar.
  - **Pagado por completo** (`settledOpenCycles`, `utils/cycleClosing.js`, con tests): algo pagado, nada pendiente, y todo lo que entró a nómina está en nóminas pagadas. Sale de los totales que Nómina ya calcula por ciclo (`takenByPayroll` + `splitTaken`), sin lecturas extra.
  - **Un ciclo que sigue en una nómina sin pagar no se ofrece**: si después se sacara de esa nómina, su plata volvería a quedar pendiente dentro de un ciclo cerrado, que Generar ya no muestra. Se ofrece al marcar esa nómina pagada.
  - Cerrar escribe lo mismo desde las tres pantallas (Faenas, el ciclo y Nómina): `closedCyclePatch`, el estado y las fechas de lo trabajado.

## Importar desde otro ciclo abierto

Al crear un ciclo nuevo, si en la misma subfaena hay al menos un ciclo abierto, el form muestra una sección **"Importar desde un ciclo abierto"**. Es opt-in:

- **Ciclo origen**: select con los ciclos abiertos del ámbito (más reciente primero).
- **Labores a clonar**: checkboxes — copia config completa de cada labor seleccionada (incluyendo tratoType, modos, baseDayDefault, overtimeRate, etc.) con un nuevo `id`.
- **Días a importar**: chips toggleables con las fechas de `cycle.days[]` del origen (default todos). Definen tanto la `days[]` del nuevo ciclo como el filtro de fechas para mover workdays / copiar precios.
- **Copiar precios por día** (opcional): copia las entradas de `dayPrices` re-keadas por el nuevo `laborId` y filtradas por días seleccionados.
- **Mover jornadas** (opcional, destructivo): para cada (labor seleccionada × día seleccionado), lee los workdays del origen y los re-crea en el nuevo ciclo con el nuevo `docId` (que encodea cycleId+laborId), luego borra los originales. Workdays con `payrollId` se saltan para no romper snapshots de nómina ya generadas — el usuario recibe un alert con el count de skipped.

Implementación en `submitCycle` (`screens/jobs/useCycleForm.js`), con el cálculo en `utils/cycleCreation.js` (`cloneLabors`, `importedDayPrices`, `movedWorkday`). El mapeo `oldLaborId → newLaborId` vive en un `Map` que sirve para re-keear tanto `dayPrices` como los `docId` de workdays movidos.
