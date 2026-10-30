# Tipos de labor en detalle

La tabla con los seis tipos está en AGENTS.md ("Tipos de Labor"). Acá, cómo guarda y calcula cada uno sus precios y montos.

## trato — multi-precio por día

- Precios almacenados como `dayPrices[laborId][date]` = `{ t0: { price, mode }, t1: ... }`.
- Legacy `{ price, mode }` o `{ "0_0": { price, mode } }` se normaliza automáticamente al cargar.
- Workdays con tiers: `wd.tiers = { t0: { qty, amount }, t1: ... }`. Helper `getTratoTierTotals(wd)` suma todos los tiers.
- Toggle `/unid` (qty × precio) vs `/día` (precio fijo) por tier — botones segmentados.

## tratoHE

- `baseDayDefault`, `bonusManejo`, `bonusSupervision`, `overtimeRate` en la definición de labor.
- Config por día: `{ price, mode: "normal"|"overtimeOnly", isHoliday }`.
- `effectiveDayPrice` usa `||` (no `??`) para que `price: 0` herede del `baseDayDefault`.

## cosecha

- Combos = calidad × envase, almacenados como `dayPrices[laborId][date]` con claves `${x}_${y}`.
- Catálogos globales para `qualities`, `containers` — editables via ⚙ Catálogos.
- **Unidad mostrada en métricas** sale del envase del catálogo, no de un literal "kg". Helper `cosechaUnit(catalogs, containersSet)` en `utils/cosechaCombos.js`: si todos los workdays del scope usan el mismo envase (`Saco`, `Kilo`, `Caja`…) devuelve su label; si hay mezcla cae a `"Unid."`. Aplica en Calendar, CycleSummaryModal, WorkerSummaryModal y los comprobantes de Payroll.
- **Unidad mostrada para trato** sale de `catalogs.tratoTypes` via `tratoTypeLabel(catalogs, labor.tratoType)` — ej. una labor a trato configurada como "Poda" muestra `4.737 poda` en vez de `4.737 trato`. Si una grilla mezcla varios `tratoType` en el mismo ciclo cae al genérico "Trato".

## tratoEtapas — qué ve el trabajador vs qué cuenta la empresa

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

## Piso (bono para trato/cosecha)

Bono adicional configurable por día para trato y cosecha. Pensado para compensar a los trabajadores cuando la producción del día fue baja. Siempre **suma** al monto de producción, no lo reemplaza (no es un floor en sentido estricto).

- **Opt-in por día, sin default a nivel labor.** En el panel de Precios cada día tiene un botón discreto **"+ piso"** que solo está visible si el día no tiene piso configurado. Al click pasa a modo edición; al guardar muestra inline el monto con acciones ✎ editar / ✕ quitar. Mantiene la UI limpia: días sin piso no tienen ruido.
- **Persistencia del default por día**: `dayPrices[laborId][date].piso: number`. Helper: `getDayPiso(dayPrices, laborId, date)`, `effectivePiso(labor, dayPrices, date)` (este último solo lee el día — no hay fallback a labor).
- **Persistencia del workday**: workday separado con `comboKey: "_piso"` y `pisoOnly: true`. `qty: 0`, `amount: pisoAmount`. Un doc por (worker × date × labor). Hereda el `payrollId` como cualquier otro workday — al borrar la nómina, queda disponible nuevamente.
- **Asignar el piso a todo un día de una**: junto al monto del piso, en el panel de Precios, un botón **👥 a todos (N)** con el contador de quiénes tienen producción y todavía no tienen el bono. **Pide confirmación** con el monto por persona, cuántas son y el total — es plata que se suma a cada una. Escribe exactamente los mismos workdays `_piso` que apretar los toggles uno por uno; queda deshabilitado cuando no falta nadie.
- **Quién cuenta como "tiene producción"**: `pisoTargets(workdaysDeLaLabor, date)` en `utils/cosechaCombos.js`. Alcanza con que **exista** el workday, sin mirar `qty` ni `amount` — es el mismo criterio que habilita el toggle de la grilla, y un día en cero es justamente el caso que el piso compensa. Que las dos vías usen la misma regla es lo que hace que el botón sea equivalente a apretar todos los toggles habilitados; si divergen, el botón hace algo que no se puede replicar a mano. Un piso sin `pisoOnly` se detecta por la clave del mapa.
- **Quitar el piso del día se lleva también los bonos ya asignados.** El ✕ (y dejar el monto en cero) **pide confirmación** con cuántos bonos se eliminan y por cuánto.
- **Los bonos que ya se llevó una nómina no se tocan**, ni por el ✕ ni por el toggle individual: borrar un workday con `payrollId` le descuadra el total a algo que ya se pagó. El diálogo dice cuántos quedan en pie y por qué; el toggle avisa por toast. El reparto lo hace `pisoAssigned(workdaysDeLaLabor, date)` → `{ libres, liquidados }`. Es el único chequeo de `payrollId` de la pantalla: para todo lo demás, el corte es el cierre del ciclo (ver "Ciclo cerrado = congelado" en `docs/screens/jobs.md`).
- **El piso NO se bloquea en labores sincronizadas por QR**: es un bono manual, vive en un workday aparte (`comboKey: "_piso"`) y la sincronización escribe combos de producción, así que nunca lo pisa.
- **UI grilla**: la columna "P" 🪙 al final del día solo se renderiza cuando ese día tiene piso configurado en `dayPrices` **o** algún trabajador tiene un workday `pisoOnly` para ese día (`daysWithFloor`, calculado con `daysWithFloorOf` de `utils/cycleMetrics.js`). Días sin piso quedan sin columna extra. Click en el toggle crea/borra el workday `_piso` con el monto efectivo. El toggle está deshabilitado si no hay workday de producción todavía para ese (worker, date).
- **Cálculo**: total del trabajador = producción + suma de pisoAmount. Reflejado en row.total del grid, métricas de la labor, CycleSummaryModal, WorkerSummaryModal, drawer del Calendar, comprobantes de Payroll.
- **En Cobrar (CycleSummaryModal mode=cobrar)**: el piso NO se factura al cliente (es bono al trabajador). Se muestra en la tabla pero no entra al subtotal a cobrar.
- **En `aggregateWorkerAmounts`**: el monto del piso fluye naturalmente porque `wd.amount` ya carga el valor; no requiere lógica especial.
