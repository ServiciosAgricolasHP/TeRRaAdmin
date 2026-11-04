# Cheques y pagos

Cheques y pagos lleva los vencimientos: los cheques que se emiten y los que se reciben, los pagos comprometidos, las cuotas de los créditos y las deudas. Cada mañana TeRRa manda un correo con lo que está por vencer.
<!-- preguntas: cheques; vencimientos; pagos pendientes; para qué sirve cheques y pagos -->

## Lo que viene
<!-- preguntas: qué vence esta semana; cheques por cobrar; pagos vencidos; próximos vencimientos; qué hay que pagar; buscar un cheque -->

Arriba, las tarjetas suman lo que hay **Por pagar**, lo **Vencido sin marcar**, lo que **Vence en 7 días**, lo que hay **Por cobrar** (los cheques recibidos), lo **Pagado este mes** y lo **Anulado**. Lo aplazado y lo protestado tienen su tarjeta cuando hay alguno.

- **⏳ Próximos** agrupa los **Vencidos sin marcar**, los **Cheques protestados**, los **Próximos 7 días**, el **Próximo mes** y lo que viene **Más adelante**, hasta la fecha de su título. Vacía esa fecha para verlo todo.
- **👥 Por contraparte** junta lo de cada contraparte, con la más atrasada arriba.
- **📋 Todos** es la lista completa, con un buscador, filtros por estado, tipo, empresa y fechas, y **📊 Excel**.

![Los próximos vencimientos](help/cheques-y-pagos/01-proximos.webp)

## Anotar un cheque o un pago
<!-- preguntas: anotar un cheque; agregar un cheque emitido; registrar un cheque recibido; agregar un pago; anotar una deuda -->

1. Toca **+ Agregar documento**.
2. Elige el tipo: **Cheque emitido**, **Cheque recibido**, **Pago comprometido** o **Deuda personal**.
3. Completa a quién se paga (o quién entrega el cheque), el monto, la empresa y la fecha. Un cheque lleva además el banco y su número, y su fecha es la del día en que se cobra.
4. Toca **Guardar**.

![Un cheque emitido](help/cheques-y-pagos/02-cheque.webp)

Si el nombre se parece a uno ya anotado ("Bancoestado" y "Banco Estado"), TeRRa ofrece **Usar ese nombre**: así el informe no lo cuenta como dos deudas.

## Un crédito en cuotas o un pago recurrente
<!-- preguntas: crédito en cuotas; anotar un crédito; cuotas del banco; pago todos los meses; pago recurrente; deuda en cuotas; detener un pago recurrente -->

En **+ Agregar documento**:

- **Crédito en cuotas**: el acreedor, el monto de cada cuota, la fecha de la primera y el número de cuotas. Se crea una cuota por mes, el mismo día.
- **Pago recurrente**: se repite cada mes, sin término. Para terminarlo, edita uno de sus vencimientos y toca **⏹ Detener pago recurrente**.
- Una **Deuda personal** con más de una cuota se arma igual que un crédito.

El formulario muestra los vencimientos que va a crear. Toca **Crear N vencimiento(s)**.

![Un crédito de doce cuotas](help/cheques-y-pagos/03-credito.webp)

## Marcar un pago o un cheque cobrado
<!-- preguntas: marcar un cheque cobrado; marcar pagado; pagué con intereses; pagar una cuota; cobrar un cheque -->

1. Toca **Marcar como pagado** en la fila, o **Marcar como cobrado** si es un cheque.
2. Elige la fecha y revisa el monto. Si se pagó más que el original, por intereses o un recargo, escribe lo que se pagó: la diferencia queda como interés.
3. Toca **Confirmar**.

![Marcar pagado un pago vencido](help/cheques-y-pagos/04-pagar.webp)

Si fue un error, **⋯** y **↶ Volver a pendiente** lo deshace.

## Aplazar, protestar, reprogramar o anular
<!-- preguntas: aplazar un pago; cheque protestado; cheque rechazado; cambiar la fecha de un pago; anular un cheque; reprogramar un pago -->

En el menú **⋯** de cada fila:

- **⏸ Aplazar**: ya venció, se sigue debiendo y todavía no hay fecha de pago. Deja de repetirse a diario como vencido, pero sigue con los próximos 7 días, también en el correo.
- **⚠️ Protestado**: el banco rechazó el cheque. Se sigue debiendo, o cobrando.
- **📅 Reprogramar**: le pone una fecha nueva a uno aplazado o protestado, y lo vuelve a pendiente.
- **🚫 Anular**: ya no se va a pagar.
- **✏️ Editar** y **🗑️ Eliminar**. Para cambiar la fecha de uno pendiente, edítalo.

![El menú de un pago](help/cheques-y-pagos/05-menu.webp)

## Abonar a una deuda personal
<!-- preguntas: abonar a una deuda; pagar una parte de una deuda; abono a un préstamo; cuánto falta de la deuda -->

1. En la fila de la deuda, toca **⋯** y **💵 Abonos**.
2. Elige si el abono va a esa cuota o a **Toda la deuda (desde la cuota más antigua)**.
3. Escribe el monto, la fecha y una nota, y toca **Registrar abono**.

![Un abono a una deuda personal](help/cheques-y-pagos/06-abono.webp)

Lo que falta pagar baja con cada abono, y la cuota que queda cubierta se marca pagada sola. Un abono se quita con **✕**.

## Cambiar las fechas o los montos de un crédito
<!-- preguntas: cambiar la fecha de las cuotas; correr las cuotas un mes; cambiar el monto de las cuotas; ajustar un crédito; cambiar el día de pago -->

En cualquier cuota, **⋯** y **🗂 Ajustar todas las cuotas** (en un pago recurrente, **Ajustar todos los vencimientos**) muestra los vencimientos abiertos de la serie:

- Cambia la fecha o el monto de cada uno a mano.
- O desde uno en adelante: elige **Aplicar desde** y usa **Correr meses**, **Cambiar día** o **Poner monto**.

Nada se guarda hasta **Guardar**, y lo pagado no se toca.

## El informe de deudas
<!-- preguntas: informe de deudas; cuánto debemos; pdf de las deudas; cuándo terminamos de pagar el crédito; resumen de deudas -->

**📄 Informe de deudas** arma un documento con lo que se paga, sin los cheques recibidos: el resumen, los próximos vencimientos, los vencimientos por mes y el balance de cada deuda, con su próximo pago y la fecha en que queda pagada.

- **Empresa** filtra por empresa, y **Vencimientos hasta** corta el informe en una fecha: lo de después va en una sola fila.
- **Detalle de cada pago pendiente** suma la lista de lo pendiente, que puede ir **Agrupado por contraparte**. **Incluir pagos realizados** suma lo pagado en un rango.
- Sale con **📄 Descargar PDF** o **📊 Excel**, o se imprime con **🖨 Imprimir**.

![El informe de deudas](help/cheques-y-pagos/07-informe.webp)

## Los avisos por correo
<!-- preguntas: correo de avisos; no me llegan los avisos; aviso de vencimientos; a quién le llega el correo -->

Cada mañana, a las 8:00, TeRRa manda un correo con lo que vence en los próximos días (por defecto, en 3 días, en 1 y el mismo día), lo vencido sin marcar y los próximos 7 días. Si no hay nada que avisar, no manda nada. A quién le llega y con cuántos días de anticipación lo decide un administrador.

## Si algo no funciona
<!-- preguntas: me sigue avisando un pago que ya pagué; el vencido aparece todos los días; la misma contraparte sale dos veces; no puedo quitar un abono -->

- **Sigue avisando algo que ya se pagó**: márcalo pagado. Todo lo pendiente con la fecha pasada cuenta como vencido.
- **Un vencido que no se va a pagar todavía aparece todos los días**: aplázalo.
- **La misma contraparte sale dos veces en el informe**: está escrita distinto. Edita una y usa el mismo nombre.
- **No deja quitar un abono**: la deuda se marcó pagada a mano. Vuélvela a pendiente primero.
- **Un vencimiento eliminado de un pago recurrente no vuelve**: así es, para que no reaparezca. Si hacía falta, agrégalo a mano.
