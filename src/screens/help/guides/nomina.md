# Generar y pagar una nómina

Una nómina junta lo que se le debe a cada persona por los días anotados en uno o más ciclos, y lo separa en lo que va por transferencia y lo que se paga en efectivo. Esta guía arma una nómina, la revisa, descarga el archivo del banco, imprime los comprobantes y la marca pagada.
<!-- preguntas: cómo hago la nómina; cómo le pago a los trabajadores; pagar la semana; generar nómina -->

## Antes de empezar
<!-- preguntas: qué necesito para hacer la nómina; trabajador sin cuenta; cómo marco que alguien cobra en efectivo; formato del archivo del banco -->

- Los días de cada persona tienen que estar anotados en la grilla de sus ciclos.
- Cada persona necesita su cuenta en la ficha (en **Trabajadores**). Quien cobra en efectivo lleva **Efectivo** como banco; su efectivo se reparte en un sobre por **líder de grupo**.
- Los anticipos y bonos pendientes se descuentan solos al armar la nómina.
- El formato del archivo del banco se elige en **⚙ Configuración**, arriba en Nómina.

## Elegir los ciclos
<!-- preguntas: cómo hago la nómina; armar la nómina de la semana; generar una nómina nueva; cómo elijo los ciclos a pagar; qué ciclos entran en la nómina; pagar solo una labor -->

En la pestaña **Generar** están los ciclos abiertos, por faena, con lo que tienen pendiente de pago. Marca los que entran en esta nómina.

![Los ciclos con su pendiente](help/nomina/01-elegir-ciclos.webp)

- Si un ciclo tiene varias labores, debajo aparece **Labores a pagar**: desmarca las que no se pagan ahora. Quedan pendientes para la próxima.
- Los ciclos sin nada pendiente están ocultos (**Sin pendientes**).
- **+ Agregar persona** suma días puntuales de alguien, de cualquier ciclo abierto: sirve para pagarle a una persona sin pagar el ciclo entero.

Abajo se ve cuánto suma lo elegido. Toca **Continuar →**.

![Lo elegido y el botón para seguir](help/nomina/02-continuar.webp)

## Revisar la vista previa
<!-- preguntas: cómo reviso la nómina antes de guardar; cambiar a efectivo; cambiar a transferencia; sacar a alguien de la nómina; cambiar el monto a pagar; datos faltantes; cuenta sospechosa; qué es una diferencia -->

La vista previa muestra a cada persona con lo que se le paga.

![La vista previa de la nómina](help/nomina/03-vista-previa.webp)

- **Nombre**: TeRRa propone uno con el año, el mes y la semana; se puede cambiar. **Tipo**: **Nómina**, o **Diferencia** para una nómina chica de ajuste, que se lista aparte.
- **Bruto** es lo producido; **Anticipo** y **Bono** lo que se descuenta o se suma; **A pagar** es el resultado, y se puede corregir a mano.
- **Pago**: toca **Banco** o **Efec.** para cambiar cómo cobra esa persona en esta nómina.
- La casilla de la izquierda deja a alguien fuera de esta nómina; sus días quedan pendientes.
- El filtro de arriba muestra solo banco, solo efectivo, los **⚠ Datos faltantes**, las **⚠ Cuenta sospechosa** o un grupo. Los botones de la derecha (**✓ Incluir**, **✗ Excluir**, **→ Efectivo**, **→ Banco**) se aplican a todos los que se ven.
- **Efectivo agrupado por líder**: un sobre por líder, con quiénes van en él.

**← Volver** regresa a los ciclos.

## Guardar la nómina
<!-- preguntas: cómo guardo la nómina; qué pasa al guardar la nómina; los días ya pagados no vuelven a salir -->

Toca **Guardar nómina**. Si hay anticipos en cuotas o cuentas con problemas, TeRRa pide confirmarlos.

**Qué pasa al guardarla:** los días quedan dentro de esta nómina y ya no aparecen como pendientes, así no se pagan dos veces. Los anticipos y bonos quedan aplicados. La nómina aparece en **Historial Nómina**, pendiente de pago.

## El historial de nóminas
<!-- preguntas: dónde están las nóminas; ver nóminas anteriores; renombrar una nómina; eliminar una nómina; buscar una nómina -->

![Una nómina pendiente en el historial](help/nomina/04-historial.webp)

Cada fila muestra el estado, cuántas personas, lo de banco, lo de efectivo y el total. Arriba se filtra por estado, por mes o por nombre, y las **Diferencias** van en su propia pestaña. Toca la fila para abrir el detalle.

**⋯** tiene las demás acciones:

![Las demás acciones de una nómina](help/nomina/05-mas-acciones.webp)

- **Solo transferencias**: ver "Pagar en dos tiempos".
- **Mover a Diferencias** (o a Nóminas) y **Renombrar**.
- **Eliminar**: borra la nómina, libera sus días (vuelven a quedar pendientes) y devuelve los anticipos. Si no se puede, dice qué hacer antes.

## El detalle de una nómina
<!-- preguntas: ver el detalle de la nómina; cuánto efectivo tengo que sacar; billetes y monedas; resumen por subfaena; copiar el resumen de la nómina -->

![El detalle de una nómina](help/nomina/06-detalle.webp)

- **Resumen**: lo de transferencias, lo de efectivo y el total.
- **Estimar efectivo**: cuántos billetes y monedas sacar para armar los sobres, y cuánto lleva cada persona.
- La tabla del resumen, por subfaena (**Sin labores**) o por subfaena y labor (**Con labores**), con **Copiar**, **Descargar** e **Imprimir**.
- Más abajo, los ciclos de la nómina y las personas por líder, de banco y de efectivo.
- Arriba, **Editar contenido** y **Recalcular** sirven para corregirla.

## Descargar el archivo del banco
<!-- preguntas: cómo descargo el archivo del banco; subir la nómina al banco; descargar el excel de la nómina; archivo para transferencias -->

Al pie del detalle, toca **Descargar**:

![Las descargas de la nómina](help/nomina/07-descargar.webp)

- **Sólo Nómina**: la hoja que se sube al banco para hacer las transferencias.
- **XLSX completo**: la hoja del banco, el resumen, las transferencias y el efectivo.
- **JSON**: toda la información de la nómina, como respaldo.

## Imprimir los comprobantes
<!-- preguntas: imprimir comprobantes de efectivo; hoja para firmar; detalle de pago para el trabajador; imprimir la nómina -->

Al pie del detalle, toca **Imprimir**:

![Lo que se imprime](help/nomina/08-imprimir.webp)

- **Comprobantes efectivo**: una hoja por líder, con lo de cada persona y espacio para la firma.
- **Detalle de pago**: el resumen y lo que produjo cada persona, por grupo.

## Marcar la nómina pagada
<!-- preguntas: cómo marco la nómina pagada; ya pagué la nómina; cerrar la nómina; terminar la nómina -->

1. En el historial, toca **✓ Marcar pagada**.
2. Escribe **Pagado** para confirmar y toca **Confirmar**.

![Confirmar el pago](help/nomina/09-marcar-pagada.webp)

Los días quedan sellados con la fecha de pago. Si algún ciclo quedó pagado entero, TeRRa ofrece cerrarlo (ver "Cerrar un ciclo" en la guía [Faenas, subfaenas y ciclos](/ayuda/faenas-y-ciclos#cerrar-un-ciclo)):

![La oferta de cerrar los ciclos pagados](help/nomina/10-cerrar-ciclos.webp)

Para volver atrás, **⋯ → Marcar como no pagada**.

## Pagar en dos tiempos: primero las transferencias
<!-- preguntas: pagar las transferencias y el efectivo después; quedó debiendo el efectivo; solo transferencias; pagar el efectivo después; alguien ya cobró su efectivo -->

Cuando salen las transferencias pero el efectivo se entrega después:

1. **⋯ → Solo transferencias**, y escribe **Transferencias** para confirmar. La nómina sigue pendiente y su efectivo queda como deuda (**💵 Debiendo**).
2. Si alguien cobra antes que el resto, márcalo en el detalle: deja de contar como deuda.
3. Cuando se entrega el efectivo, toca **💵 Pagar efectivo** en el historial.

Mientras se debe, el efectivo aparece en **Generar** (**💵 Efectivo pendiente de antes**) y se puede sumar en **Estimar efectivo**, para llevar todo junto. Con las transferencias selladas la nómina no se puede editar ni eliminar; **⋯ → Revertir transferencias** lo deshace.

## Si algo no funciona
<!-- preguntas: no aparece un trabajador en la nómina; falta alguien en la nómina; no puedo eliminar la nómina; no aparece el ciclo en nómina; datos faltantes en la nómina -->

- **No aparece un ciclo en Generar**: está cerrado o no tiene nada pendiente (**Sin pendientes**).
- **No aparece una persona en la vista previa**: sus días ya están en otra nómina, todavía no tiene RUT (es temporal) o tiene sueldo mensual, que no se paga por día.
- **⚠ Datos faltantes**: a la persona le falta la cuenta o el banco. Complétalo en su ficha, en **Trabajadores**, y vuelve a armar la nómina, o pásala a efectivo.
- **No se puede eliminar ni editar la nómina**: tiene las transferencias selladas o está pagada. Revierte eso primero desde **⋯**.
