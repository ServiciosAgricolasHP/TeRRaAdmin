# Anticipos y bonos

Un **anticipo** es plata que se le pasa a alguien por adelantado y que se le descuenta en la nómina; un **bono** es plata que se le suma. Los dos se anotan en **Anticipos / Bonos** y la nómina siguiente los aplica sola, o la primera desde la fecha que se elija. Esta guía anota un anticipo, explica las cuotas y la fecha de inicio, muestra cómo los descuenta la nómina y cómo se elige cuáles aplica.
<!-- preguntas: qué es un anticipo; qué es un bono; adelanto de sueldo; descontar plata en la nómina -->

## La lista de anticipos y bonos
<!-- preguntas: dónde veo los anticipos; cuánto debe una persona; anticipos pendientes; ver todos los anticipos de una persona -->

![La lista de anticipos y bonos](help/anticipos-y-bonos/01-lista.webp)

- Arriba se filtra por tipo (**Anticipo** o **Bono**), se busca por nombre, RUT o nota, y se elige el estado: **Pendientes** (lo que falta aplicar), **Aplicados**, **Cancelados** o **Todos**. A la derecha, el total pendiente de anticipos y de bonos.
- Un anticipo en cuotas muestra cuántas lleva (por ejemplo, **0/2 · Por pago**).
- Uno que se descuenta desde una fecha que todavía no llega lleva **📅 Desde** y el día (ver [Descontar un anticipo desde una fecha](/ayuda/anticipos-y-bonos#descontar-un-anticipo-desde-una-fecha)).
- El nombre de la persona abre todos sus anticipos y bonos.

## Ordenar la lista
<!-- preguntas: cómo ordeno los anticipos; ver los últimos anticipos que anoté; los anticipos del mismo día salen mezclados; ordenar por fecha; ordenar por última modificación -->

Con **Ordenar por**, al lado del estado, se elige el orden de la lista:

- **Fecha**: por la fecha del anticipo o bono, la más nueva primero. Los del mismo día salen según su última modificación: arriba, el último que se anotó o se editó.
- **Última modificación**: lo último que se anotó o se editó va primero, sea cual sea su fecha. Sirve para revisar lo que se acaba de anotar.

TeRRa recuerda el orden elegido en ese navegador. Que una nómina descuente un anticipo no lo mueve de lugar.

## Anotar un anticipo
<!-- preguntas: cómo anoto un anticipo; dar un adelanto; prestar plata a un trabajador; registrar un anticipo -->

1. Toca **🪙 + Anticipo**.
2. Busca a la persona (al menos 2 letras del nombre o del RUT) y elígela.
3. Escribe el **Monto** y la **Fecha**. La **Nota** es opcional (el motivo, una referencia).
4. Toca **Guardar**.

![El formulario de un anticipo](help/anticipos-y-bonos/02-nuevo-anticipo.webp)

Si la persona ya tiene otro pendiente por el mismo monto, TeRRa avisa que puede estar duplicado.

## Descontar un anticipo en cuotas
<!-- preguntas: anticipo en cuotas; descontar de a poco; pagar el anticipo en varias nóminas; cuotas de un préstamo -->

En el formulario, marca **Descontar en cuotas** y elige el **N° de cuotas**: TeRRa calcula el monto de cada una. La **Frecuencia** (por pago, quincenal o mensual) es solo una referencia: TeRRa no se salta nóminas solo.

Cada nómina descuenta una cuota, y al guardarla pide confirmar las cuotas que entran:

![Confirmar las cuotas al guardar la nómina](help/anticipos-y-bonos/04-confirmar-cuotas.webp)

Vienen todas marcadas; desmarca la de quien no debe pagar cuota esta vez. La nómina recuerda la que desmarcaste: si después la recalculas o le agregas algo, esa cuota no se descuenta sola. El plan de cuotas no se cambia después: para cambiarlo, se elimina el anticipo (mientras siga pendiente) y se anota de nuevo.

## Descontar un anticipo desde una fecha
<!-- preguntas: descontar el anticipo desde diciembre; cobrar el anticipo más adelante; que el anticipo no se descuente todavía; pagar el bono desde una fecha; empezar a descontar el próximo mes; anticipo para el mes que viene -->

Si un anticipo no se tiene que descontar en la próxima nómina sino más adelante, ponle **Descontar desde** en el formulario (en un bono se llama **Pagar desde**). Se puede poner al anotarlo o después, con **Editar**.

![La fecha desde la que se descuenta](help/anticipos-y-bonos/08-desde-una-fecha.webp)

- Las nóminas que se armen, se recalculen o se agranden antes de esa fecha no lo descuentan solas. Desde ese día, la siguiente lo descuenta como cualquier otro.
- Mientras tanto, en la lista lleva **📅 Desde** y el día.
- Si igual quieres descontarlo antes, al recalcular la nómina aparece sin marcar y lo puedes marcar (ver [Elegir los anticipos y bonos al recalcular](/ayuda/anticipos-y-bonos#elegir-los-anticipos-y-bonos-al-recalcular)).
- Sin fecha, lo descuenta la próxima nómina.

## Anotar un bono
<!-- preguntas: cómo anoto un bono; pagar un bono; premio a un trabajador; bono de asistencia -->

Toca **🎁 + Bono** y sigue los mismos pasos que un anticipo (un bono no tiene cuotas). La nómina siguiente lo suma a lo que cobra la persona.

## Cómo los aplica la nómina
<!-- preguntas: cómo se descuenta el anticipo en la nómina; el anticipo es más grande que lo que gana; cambiar el anticipo en la nómina; no descontar el anticipo esta vez -->

Al armar una nómina, TeRRa busca los anticipos y bonos pendientes de cada persona:

![La vista previa con anticipos y un bono](help/anticipos-y-bonos/03-vista-previa.webp)

- Primero suma los **bonos**, y después descuenta los **anticipos**, del más viejo al más nuevo. Así un bono ayuda a saldar un anticipo.
- Nunca descuenta más de lo que la persona cobra (lo producido más los bonos): lo que no alcanza queda pendiente para la próxima.
- De un anticipo en cuotas descuenta una cuota.
- Un anticipo o bono con **Descontar desde** o **Pagar desde** en una fecha que todavía no llega no entra.
- En la vista previa se puede cambiar el **Anticipo** (hasta lo que se debe) y el **Bono** (hasta su monto). Lo que no se aplica queda pendiente.

## Después de la nómina
<!-- preguntas: el anticipo quedó parcial; qué significa parcial; anticipo aplicado; cuánto falta del anticipo; qué anticipos descontó la nómina; ver los bonos de una nómina; bruto de la nómina -->

![Los anticipos y el bono después de la nómina](help/anticipos-y-bonos/05-despues-de-la-nomina.webp)

- **Aplicado**: se descontó (o se pagó) entero.
- **Parcial**: se descontó una parte; queda el resto (**Resta**) para las nóminas siguientes.
- En el detalle de la nómina, el **Resumen** muestra el **Bruto** (lo producido, antes de los anticipos y los bonos) y **📋 Ver anticipos y bonos** lista cada uno, por persona, con su fecha, su nota y lo que se aplicó en esa nómina.

![Los anticipos y bonos de una nómina](help/anticipos-y-bonos/06-en-la-nomina.webp)

- Si la nómina se elimina, o se saca a la persona, el anticipo vuelve a quedar pendiente como estaba. Ver la guía [Corregir una nómina](/ayuda/corregir-nomina#que-pasa-con-los-anticipos-y-bonos).

## Editar un bono que ya aplicó la nómina
<!-- preguntas: cambiar el monto de un bono en la nómina; me equivoqué en el bono y ya está en la nómina; corregir un bono aplicado; editar la nota del bono; el bono era otro monto -->

Un bono que ya está en una nómina pendiente se edita desde la nómina, sin sacar a la persona:

1. En el detalle de la nómina, toca **📋 Ver anticipos y bonos** y, en el bono, **✎ Editar**. También está en el detalle de pago de la persona, al abrir su fila: **✎ Editar bono**.
2. Escribe el monto o la nota nuevos. Abajo se ve cómo quedan el bono, los anticipos y el líquido, antes y después.
3. Toca **Guardar**. Mientras guarda, una barra muestra en qué va.

![Editar un bono de la nómina](help/anticipos-y-bonos/07-editar-bono.webp)

El bono queda como si hubiera sido así desde el principio, y la nómina le paga el monto nuevo:

- **Si el bono sube**, sube lo que cobra la persona, y nada más.
- **Si el bono baja**, baja lo que cobra. Si tenía un anticipo que ya no cabe entero, se descuenta lo que alcanza y el resto vuelve al anticipo, que queda **Parcial** para la próxima nómina.
- **Si solo cambia la nota**, la nómina queda igual.

Con las transferencias de la nómina ya marcadas, solo se edita el bono de quien cobra en efectivo. Si ya cobró, TeRRa avisa que la diferencia se arregla en la mano.

## Quitar un anticipo o un bono de una nómina
<!-- preguntas: sacar un anticipo de la nómina; la nómina descontó un anticipo que no correspondía; quitar un bono de la nómina; no descontar el anticipo en esta nómina; devolver el anticipo a pendiente; la nómina aplicó un anticipo que no debía -->

Si una nómina pendiente descuenta un anticipo (o paga un bono) que no debía, se quita solo ese anticipo o bono, y el resto de la nómina queda igual:

1. En el detalle de la nómina, toca **📋 Ver anticipos y bonos**.
2. Marca **Quitar** en cada anticipo o bono que sale.
3. Toca **✕ Quitar de la nómina** y confirma con **Quitar**. Mientras guarda, una barra muestra en qué va.

![Quitar un anticipo de la nómina](help/anticipos-y-bonos/09-quitar-de-la-nomina.webp)

- El anticipo o bono vuelve a quedar **Pendiente**, como estaba antes de esa nómina.
- Si quitas un anticipo, quien lo tenía cobra más; si quitas un bono, cobra menos. Si al quitar un bono su anticipo ya no cabe entero, se descuenta lo que alcanza y el resto vuelve al anticipo.
- La nómina lo recuerda: si la recalculas, aparece sin marcar y no se aplica solo.
- Se puede con la nómina pendiente y sin las transferencias marcadas.

## Elegir los anticipos y bonos al recalcular
<!-- preguntas: el anticipo se aplicó solo al recalcular; recalcular la nómina agregó un anticipo; elegir qué anticipos se aplican; no quiero que se aplique el anticipo al recalcular; agregué un ciclo y se descontó el anticipo; aplicar un anticipo en una nómina ya hecha -->

Cuando recalculas una nómina (o le cambias los ciclos con **Editar ciclos**), TeRRa muestra en **Anticipos y bonos pendientes** los que esa nómina todavía no aplica, cada uno con su casilla y lo que se aplicaría:

![Elegir los anticipos y bonos al recalcular](help/anticipos-y-bonos/10-elegir-al-recalcular.webp)

- Se aplican solo los marcados. Al marcar o desmarcar, la tabla de abajo muestra cómo queda lo que cobra cada uno.
- Vienen **sin marcar** los que se dejaron fuera de esa nómina (**Se dejó fuera de esta nómina**: la cuota desmarcada al guardarla, uno quitado o uno desmarcado en otro recálculo) y los que tienen una fecha que todavía no llega (**📅 Desde**). El resto viene marcado.
- Lo que dejas sin marcar queda fuera de esa nómina: el próximo recálculo lo vuelve a mostrar sin marcar, y **+ Agregar persona** no lo descuenta. Lo que solo espera su fecha viene marcado cuando la fecha llega.
- Toca **Aplicar cambios** para guardarlo. Ver la guía [Corregir una nómina](/ayuda/corregir-nomina#traer-los-cambios-de-la-grilla-recalcular).

## Corregir o eliminar un anticipo
<!-- preguntas: cómo corrijo un anticipo; eliminar un anticipo; perdonar el saldo de un anticipo; me equivoqué de monto en el anticipo -->

- **Pendiente**: se edita y se elimina con **Editar** y **Eliminar**.
- **Parcial**: no se elimina, porque ya tiene pagos. Con **Editar** se puede bajar el monto hasta lo ya pagado, para dar por cerrado el resto.
- **Aplicado**: ya no se edita ni se elimina aquí. Un bono aplicado se edita desde su nómina: ver [Editar un bono que ya aplicó la nómina](/ayuda/anticipos-y-bonos#editar-un-bono-que-ya-aplico-la-nomina).
- Si lo descuenta una nómina pendiente, primero quítalo de ella ([Quitar un anticipo o un bono de una nómina](/ayuda/anticipos-y-bonos#quitar-un-anticipo-o-un-bono-de-una-nomina)): vuelve a quedar pendiente y se puede editar o eliminar.

## Si algo no funciona
<!-- preguntas: la nómina no descontó el anticipo; no aparece el anticipo en la nómina; no puedo eliminar un anticipo -->

- **La nómina no lo descontó**: la persona no cobró nada en esa nómina, la cuota se desmarcó al guardarla, o tiene **Descontar desde** en una fecha que no llega. Sigue pendiente para la próxima. Para descontarlo igual en esa nómina, recalcúlala y márcalo.
- **Al recalcular se iba a aplicar un anticipo que no corresponde**: desmárcalo antes de **Aplicar cambios**. Si ya se aplicó, quítalo desde **📋 Ver anticipos y bonos**.
- **No se puede eliminar**: tiene pagos aplicados (está parcial). Usa **Editar** para cerrar el saldo.
- **Un bono de la nómina no tiene ✎ Editar**: la nómina está pagada, o ya se marcaron las transferencias y la persona cobra por banco.
