# Pagar a los transportistas

Las vueltas de un transportista se le pagan en dos pasos. Primero se juntan en un **resumen**, el detalle que se le manda para cobrar. Después los resúmenes se agrupan en una **quincena**, que se marca pagada de una vez. Para anotar las vueltas, ver la guía [Transportes](/ayuda/transportes).
<!-- preguntas: cómo le pago a un transportista; pagar el transporte; pagar las vueltas; resumen de transporte; quincena de transporte -->

## Armar los resúmenes de una faena
<!-- preguntas: generar los resúmenes de transporte; pago por faena; juntar las vueltas de un ciclo; resumen de pago de los buses -->

1. En **Pago por faena**, marca los ciclos y, si quieres, las fechas (**Desde** y **Hasta**).
2. Toca **Continuar →**.

![Elegir los ciclos](help/pagar-transportes/01-pago-por-faena.webp)

3. TeRRa muestra un resumen por transportista con sus vueltas pendientes de esos ciclos. Desmarca al que no va, o quita una vuelta con **✕**.
4. Toca **Generar N resumen(es)**.

![Los resúmenes por transportista, antes de generarlos](help/pagar-transportes/02-vista-previa.webp)

Para un solo transportista, **+ Generar resumen** en **Resúmenes** arma uno con sus vueltas pendientes en un rango de fechas.

## Revisar y mandar un resumen
<!-- preguntas: ver un resumen de transporte; mandar el detalle al transportista; corregir un resumen; agregar una vuelta al resumen; quitar una vuelta del resumen -->

La pestaña **Resúmenes** lista los pendientes y los pagados de cada transportista, con su período, su quincena y su monto. Se busca por transportista y se filtra por período o quincena.

![Los resúmenes](help/pagar-transportes/03-resumenes.webp)

Al tocar un resumen se abre su detalle, con sus vueltas:

- **📋 Copiar imagen**, **📥 Descargar PNG** e **🖨 Imprimir** lo dejan listo para mandárselo al transportista.
- **✏️ Editar resumen** permite corregir una vuelta (vueltas y tarifa) o quitarla. **+ Vuelta suelta** suma una pendiente que quedó afuera.
- **💰 Marcar pagado** paga un resumen que no está en ninguna quincena (ver [Pagar un resumen suelto](/ayuda/pagar-transportes#pagar-un-resumen-suelto)).
- **Eliminar** borra el resumen; sus vueltas vuelven a quedar sueltas. Uno que está en una quincena primero se saca de ella.
- **🖨 Imprimir varios**, en **Resúmenes**, imprime o descarga varios de una vez.

## Pagar un resumen suelto
<!-- preguntas: pagar un resumen suelto; pagar un resumen sin quincena; pagar un resumen que no está en una quincena; marcar pagado un resumen -->

Lo habitual es pagar los resúmenes en una quincena. Uno que quedó suelto se paga desde su detalle:

1. En **Resúmenes**, toca el resumen.
2. Toca **💰 Marcar pagado**. La confirmación dice cuánto falta pagar, descontados los abonos.
3. Escribe **Pagada** y toca **Confirmar pago**.

![Pagar un resumen suelto desde su detalle](help/pagar-transportes/04-pagar-suelto.webp)

El resumen y sus vueltas quedan pagados. **↶ Revertir pago**, en el mismo detalle, lo deshace. Un resumen que está en una quincena no tiene esos botones: se paga desde la quincena.

## Anotar un abono
<!-- preguntas: pagar una parte al transportista; abono al transportista; adelanto al transportista; cuánto le falta por cobrar -->

En el detalle de un resumen pendiente, **💰 Abonos** anota lo que ya se le pagó:

1. Escribe el **Monto**, la **Fecha** y una **Nota** (transferencia, efectivo, cheque…).
2. Toca **+ Abono**.

![Un abono en el resumen](help/pagar-transportes/05-abono.webp)

Arriba se ven lo **Abonado** y lo **Pendiente**, y lo que se copia o imprime cierra con el **PENDIENTE**. Cada abono se corrige con ✏️ o se quita con ✕ mientras el resumen no esté pagado.

## Armar la quincena
<!-- preguntas: crear una quincena; nueva quincena de transporte; juntar los resúmenes para pagar; quincena de los buses -->

1. En **Quincenas**, toca **+ Nueva quincena**.
2. Escribe el **Nombre** y las fechas (**Desde** y **Hasta**). Las faenas, arriba, filtran qué vueltas entran.
3. TeRRa lista a los transportistas con vueltas sueltas en esas fechas, todos marcados: para cada uno se crea un resumen.
4. En **Importar resúmenes existentes**, marca los resúmenes que ya se armaron.
5. Toca **Crear quincena**.

![Una quincena nueva](help/pagar-transportes/06-nueva-quincena.webp)

## Pagar la quincena
<!-- preguntas: marcar la quincena pagada; pagar a un solo transportista; revertir un pago de transporte; me equivoqué al marcar pagado -->

Al tocar una quincena se abre su tabla: un resumen por transportista, con sus vueltas, período, estado y total.

![El detalle de una quincena](help/pagar-transportes/07-quincena.webp)

- **💰 Marcar quincena pagada** marca pagados todos sus resúmenes y sus vueltas. La confirmación dice cuánto falta pagar, descontados los abonos; escribe **Pagada** para confirmarlo.
- En cada fila, **👁** abre el detalle del resumen, **💰 Pagar** paga solo ese y **✕** lo saca de la quincena (vuelve a quedar suelto).
- **↶ Revertir pago** lo deshace; se confirma escribiendo **Revertir**.
- **📋 Copiar**, **📥 PNG** e **🖨 Imprimir** sacan la tabla; **🖨 Imprimir quincena + resúmenes** agrega el detalle de cada resumen, uno por hoja.
- **▸ + Agregar resumen** suma un resumen suelto. **✏️ Editar** cambia el nombre y las fechas.

![Confirmar el pago escribiendo una palabra](help/pagar-transportes/08-confirmar-pago.webp)

Un resumen o una vuelta pagados ya no se editan: para corregirlos, primero se revierte el pago.

## Liquidar un resumen
<!-- preguntas: liquidar un resumen con abonos; pagar el saldo del resumen; terminar de pagar un resumen; cerrar un resumen abonado; pagar lo que falta de un resumen -->

Un resumen con abonos sigue **Pendiente** hasta que se marca pagado, aunque lo abonado ya cubra todo. Para liquidarlo:

1. Paga lo que falta: es el **Pendiente** que muestra el detalle del resumen.
2. Si está en una quincena, toca **💰 Pagar** en su fila de la quincena. Si está suelto, toca **💰 Marcar pagado** en su detalle (ver [Pagar un resumen suelto](/ayuda/pagar-transportes#pagar-un-resumen-suelto)).
3. La confirmación dice cuánto falta pagar. Escribe **Pagada** y toca **Confirmar pago**.

![Liquidar un resumen en su quincena](help/pagar-transportes/09-liquidar.webp)

El resumen y sus vueltas quedan pagados, y lo abonado queda como está, ya sin editar. **↶ Revertir pago**, en la quincena o en el detalle del resumen suelto, lo vuelve a pendiente con lo mismo abonado.

## Ver cuánto se debe
<!-- preguntas: cuánto se le debe a los transportistas; balance de transporte; balance de quincenas; deuda de transporte -->

- **Balance de quincenas**, arriba de **Quincenas**, cruza a los transportistas con las quincenas que tienen algo pendiente. **Todos los resúmenes** muestra también a quien ya cobró lo suyo. El nombre de un transportista abre su resumen.
- **Balance general de transportes**, arriba de **Resúmenes**, suma por transportista lo que se debe en vueltas sueltas, resúmenes y quincenas, en un rango de fechas.

![El balance de quincenas](help/pagar-transportes/10-balance.webp)

## Si algo no funciona
<!-- preguntas: no aparece el transportista en la quincena; no puedo eliminar un resumen; el resumen no cuadra; el resumen quedó en cero pero sigue pendiente; no puedo pagar un resumen; no aparece el botón para pagar el resumen -->

- **Un transportista no aparece al armar la quincena**: no tiene vueltas sueltas en esas fechas o en esas faenas. Si ya tiene un resumen, impórtalo.
- **No se puede eliminar un resumen**: está en una quincena. Sácalo con **✕** en la quincena.
- **El pendiente de un resumen está en $0, pero sigue Pendiente**: los abonos no lo cierran solos. Márcalo pagado (ver [Liquidar un resumen](/ayuda/pagar-transportes#liquidar-un-resumen)).
- **El detalle del resumen no tiene 💰 Marcar pagado**: está en una quincena, y se paga desde ella, con **💰 Pagar** en su fila.
- **No se puede editar una vuelta o un resumen**: ya está pagado. Revierte el pago primero.
- **El total de un resumen cambió**: se corrigió una de sus vueltas. TeRRa recalcula el resumen y la quincena solo.
