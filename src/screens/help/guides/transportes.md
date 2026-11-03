# Transportes

En **Transportes** están los transportistas que llevan a la gente a las faenas, con sus vehículos y su tarifa, y las vueltas que hace cada uno. Las vueltas se anotan desde el ciclo y se le pagan al transportista con los resúmenes y las quincenas: ver [Pagar a los transportistas](/ayuda/pagar-transportes).
<!-- preguntas: transportistas; quién lleva a la gente; vueltas de los buses; transporte de los trabajadores -->

## Los transportistas
<!-- preguntas: ver los transportistas; transportista propio o contratado; desactivar un transportista -->

La pestaña **Transportistas** muestra una tarjeta por cada uno, con lo que se le debe (**Adeudado**), sus resúmenes pendientes y sus vueltas sueltas. Arriba se ve el total.

![Los transportistas](help/transportes/01-transportistas.webp)

- **🏠 Propios** son los vehículos de la empresa: sus vueltas van en $0. **🚚 Contratados** cobran por vuelta.
- Toca una tarjeta para ver el resumen del transportista (ver más abajo).
- **🚚 Vueltas** abre sus vueltas, **Editar** cambia sus datos y **Desactivar** lo saca de las listas sin borrar lo que ya hizo. **Mostrar inactivos** los vuelve a mostrar, con **Restaurar**.

## Agregar un transportista
<!-- preguntas: cómo agrego un transportista; nuevo transportista; agregar un bus; agregar un vehículo; tarifa por vuelta -->

1. Toca **+ Transportista**.
2. Escribe el **Alias** (como se le dice) y el **Nombre**, y elige el **Tipo**: propio o contratado.
3. La **Tarifa por defecto** es lo que cobra por vuelta; se propone al anotar una vuelta.
4. En **Vehículos**, toca **+ Vehículo** por cada uno y escribe su alias en el aviso que aparece. Después completa la patente y la capacidad.
5. Toca **Guardar**.

![Un transportista nuevo](help/transportes/02-transportista.webp)

También se puede crear al anotar una vuelta, con **+ Nuevo transportista** en la lista de transportistas.

## Anotar las vueltas del ciclo
<!-- preguntas: cómo anoto una vuelta; registrar el viaje del bus; anotar transporte en el ciclo; agregar una vuelta -->

1. En la grilla del ciclo, toca **🚐 Transportes**.
2. Elige el día a la izquierda: a la derecha se ven sus vueltas.
3. Toca **+ Agregar vuelta**.

![Las vueltas de un día del ciclo](help/transportes/03-vueltas-del-ciclo.webp)

4. Busca al transportista por su alias, su nombre o su vehículo: arriba salen los **RECIENTES** de este ciclo. Elige el **Vehículo**.
5. Completa el **Tipo** (vuelta o acercamiento), la **Labor** si el ciclo tiene varias y la vuelta es de una sola, el **Lugar (origen)** y el **Destino**, el **N° personas** y la **Cantidad de vueltas**. La **Tarifa por vuelta** viene del transportista; el **Monto** es vueltas × tarifa.
6. Toca **Guardar**.

![Una vuelta nueva](help/transportes/04-agregar-vuelta.webp)

## Ver y corregir las vueltas
<!-- preguntas: ver todas las vueltas; corregir una vuelta; eliminar una vuelta; vueltas de un transportista; buscar una vuelta -->

La pestaña **Vueltas** lista las de todos los ciclos, por transportista, con el **Total filtrado**. **Expandir todos** abre las vueltas de cada uno.

![La lista de vueltas](help/transportes/05-vueltas.webp)

- Se filtra por **Transportista**, **Estado**, **Faena** y **Ciclo**. Por defecto muestra los últimos 90 días: cambia la fecha de **Mostrar**, o marca **ver histórico completo**.
- Cada vuelta se corrige con **Editar** y se elimina con **✕**, mientras no esté pagada.

## Poner el precio a las vueltas que no lo tienen
<!-- preguntas: vueltas sin precio; vuelta en cero; falta la tarifa de una vuelta; corregir la tarifa de varias vueltas -->

Cuando hay vueltas de transportistas contratados sin tarifa, en **Transportistas** aparece **⚠ Vueltas sin precio (N)**.

1. Tócalo: salen agrupadas por transportista, con su fecha, vehículo, vueltas y destino.
2. Escribe la tarifa de cada una, o toca **Usar $X en todas** para ponerles la tarifa por defecto del transportista.
3. Toca **Guardar**: se recalculan el monto de cada vuelta y el total de su resumen y su quincena.

![Las vueltas sin precio](help/transportes/06-sin-precio.webp)

Las vueltas de un transportista propio no aparecen: van en $0 a propósito.

## El resumen de un transportista
<!-- preguntas: cuánto se le debe a un transportista; resumen del transportista; deuda con el transportista; mandarle el detalle al transportista -->

Al tocar la tarjeta de un transportista se abre su resumen: una fila por quincena, los resúmenes sueltos (**Sin quincena**) y las **Vueltas sin resumen**, con lo pagado y lo pendiente de cada uno. Debajo, el detalle de las vueltas.

![El resumen de un transportista](help/transportes/07-resumen-transportista.webp)

- **Incluir pagados** suma lo ya pagado en un rango de fechas; **🚚 Detalle de quincenas** muestra también las vueltas de cada quincena.
- **📋 Copiar imagen**, **📥 Descargar PNG** e **🖨 Imprimir** lo comparten tal como se ve.

## Si algo no funciona
<!-- preguntas: no aparece el transportista; no puedo editar una vuelta; no aparece el vehículo -->

- **No aparece el transportista al anotar una vuelta**: está desactivado. Actívalo con **Mostrar inactivos** → **Restaurar**.
- **No aparece el vehículo**: agrégalo en **Editar** → **+ Vehículo**.
- **No se puede editar ni eliminar una vuelta**: ya está pagada. Para cambiarla hay que revertir el pago de su quincena.
- **Una vuelta no aparece en la lista**: es de hace más de 90 días; marca **ver histórico completo**.
