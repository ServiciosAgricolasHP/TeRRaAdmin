# Anticipos y bonos

Un **anticipo** es plata que se le pasa a alguien por adelantado y que se le descuenta en la nómina; un **bono** es plata que se le suma. Los dos se anotan en **Anticipos / Bonos** y la nómina siguiente los aplica sola. Esta guía anota un anticipo, explica las cuotas y muestra cómo los descuenta la nómina.
<!-- preguntas: qué es un anticipo; qué es un bono; adelanto de sueldo; descontar plata en la nómina -->

## La lista de anticipos y bonos
<!-- preguntas: dónde veo los anticipos; cuánto debe una persona; anticipos pendientes; ver todos los anticipos de una persona -->

![La lista de anticipos y bonos](help/anticipos-y-bonos/01-lista.webp)

- Arriba se filtra por tipo (**Anticipo** o **Bono**), se busca por nombre, RUT o nota, y se elige el estado: **Pendientes** (lo que falta aplicar), **Aplicados**, **Cancelados** o **Todos**. A la derecha, el total pendiente de anticipos y de bonos.
- Un anticipo en cuotas muestra cuántas lleva (por ejemplo, **0/2 · Por pago**).
- El nombre de la persona abre todos sus anticipos y bonos.

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

Vienen todas marcadas; desmarca la de quien no debe pagar cuota esta vez. El plan de cuotas no se cambia después: para cambiarlo, se elimina el anticipo (mientras siga pendiente) y se anota de nuevo.

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
- En la vista previa se puede cambiar el **Anticipo** (hasta lo que se debe) y el **Bono** (hasta su monto). Lo que no se aplica queda pendiente.

## Después de la nómina
<!-- preguntas: el anticipo quedó parcial; qué significa parcial; anticipo aplicado; cuánto falta del anticipo; qué anticipos descontó la nómina; ver los bonos de una nómina; bruto de la nómina -->

![Los anticipos y el bono después de la nómina](help/anticipos-y-bonos/05-despues-de-la-nomina.webp)

- **Aplicado**: se descontó (o se pagó) entero.
- **Parcial**: se descontó una parte; queda el resto (**Resta**) para las nóminas siguientes.
- En el detalle de la nómina, el **Resumen** muestra el **Bruto** (lo producido, antes de los anticipos y los bonos) y **📋 Ver anticipos y bonos** lista cada uno, por persona, con su fecha, su nota y lo que se aplicó en esa nómina.

![Los anticipos y bonos de una nómina](help/anticipos-y-bonos/06-en-la-nomina.webp)

- Si la nómina se elimina, o se saca a la persona, el anticipo vuelve a quedar pendiente como estaba. Ver la guía [Corregir una nómina](/ayuda/corregir-nomina#que-pasa-con-los-anticipos-y-bonos).

## Corregir o eliminar un anticipo
<!-- preguntas: cómo corrijo un anticipo; eliminar un anticipo; perdonar el saldo de un anticipo; me equivoqué de monto en el anticipo -->

- **Pendiente**: se edita y se elimina con **Editar** y **Eliminar**.
- **Parcial**: no se elimina, porque ya tiene pagos. Con **Editar** se puede bajar el monto hasta lo ya pagado, para dar por cerrado el resto.
- **Aplicado**: ya no se edita ni se elimina.

## Si algo no funciona
<!-- preguntas: la nómina no descontó el anticipo; no aparece el anticipo en la nómina; no puedo eliminar un anticipo -->

- **La nómina no lo descontó**: la persona no cobró nada en esa nómina, o la cuota se desmarcó al guardarla. Sigue pendiente para la próxima.
- **No se puede eliminar**: tiene pagos aplicados (está parcial). Usa **Editar** para cerrar el saldo.
