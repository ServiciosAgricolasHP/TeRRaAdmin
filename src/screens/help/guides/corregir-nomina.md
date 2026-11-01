# Corregir una nómina

Una nómina pendiente se puede corregir antes de pagarla: traer un monto que se cambió en la grilla, agregarle un ciclo o los días de una persona, o sacarle un ciclo, una labor o a alguien. La nómina queda igual que si se hubiera armado así desde el principio, también en los anticipos que descuenta. Para armar una nómina, ver la guía [Generar y pagar una nómina](/ayuda/nomina).
<!-- preguntas: cómo corrijo una nómina; me equivoqué en la nómina; cambiar una nómina ya hecha; modificar la nómina -->

## Antes de empezar
<!-- preguntas: no puedo corregir la nómina; nómina pagada no se puede editar; cuándo se puede corregir una nómina -->

Solo se corrige una nómina **pendiente** y sin las transferencias selladas. Si ya se marcó pagada, o se marcaron las transferencias, primero hay que revertirlo desde **⋯** en el historial.

Todo se hace en el detalle de la nómina: toca su fila en **Historial Nómina**. Arriba están **Editar contenido** y **Recalcular**.

![Los botones para corregir una nómina](help/corregir-nomina/01-botones.webp)

## Traer los cambios de la grilla (Recalcular)
<!-- preguntas: cambié un monto en la grilla después de hacer la nómina; recalcular la nómina; actualizar la nómina; la nómina no tiene el monto nuevo -->

Una nómina guarda los montos que tenía cada día al generarla. Si después se corrige algo en la grilla, toca **Recalcular**: TeRRa muestra a quién le cambia el monto, antes y ahora.

![Lo que cambia al recalcular](help/corregir-nomina/02-recalcular.webp)

Toca **Aplicar cambios** para guardarlo. Recalcular también trae los días que se anotaron después en las labores de la nómina, y los nombres al día de los ciclos.

## Agregar los días de una persona
<!-- preguntas: se me olvidó una persona en la nómina; agregar a alguien a una nómina ya creada; sumar un trabajador a la nómina; agregar días a la nómina -->

1. Toca **Editar contenido** y después **+ Agregar persona**.

![Agregar ciclo y Agregar persona](help/corregir-nomina/03-editar-contenido.webp)

2. Busca a la persona por nombre o RUT. Aparecen sus días sin pagar, agrupados; los que ya están en una nómina se ven sin casilla.
3. Marca los días que entran (o **Todos**, en un grupo) y toca **Agregar días**.

![Los días de una persona](help/corregir-nomina/04-agregar-persona.webp)

Si tiene anticipos o bonos pendientes, se descuentan o se suman al agregarla.

## Agregar un ciclo o una labor
<!-- preguntas: agregar un ciclo a la nómina; sumar otro ciclo a una nómina hecha; agregar una labor a la nómina; faltó un ciclo en la nómina -->

1. Toca **Editar contenido** y después **+ Agregar ciclo**.
2. Marca el ciclo. Si tiene varias labores, desmarca las que no entran.
3. Toca **Agregar**.

![Agregar un ciclo a la nómina](help/corregir-nomina/05-agregar-ciclo.webp)

Quien ya estaba en la nómina suma lo del ciclo nuevo; quien no estaba, entra. Un ciclo que ya está entero en la nómina no aparece en la lista.

## Sacar un ciclo o una labor
<!-- preguntas: sacar un ciclo de la nómina; quitar una labor de la nómina; un ciclo no debía ir en la nómina; sacar días de la nómina -->

1. Toca **Editar contenido**. En **Ciclos de esta nómina**, cada ciclo muestra sus labores, con cuántas personas, cuántas jornadas y cuánto paga cada una.
2. Desmarca el ciclo entero o las labores que salen. La barra de abajo dice cuánto se saca; **Deshacer** vuelve atrás.
3. Toca **Recalcular sin esto**.

![Una labor desmarcada para sacarla](help/corregir-nomina/06-sacar-labor.webp)

4. TeRRa muestra lo que se saca y cómo queda cada persona. Toca **Aplicar cambios**.

![Lo que se saca y cómo queda la nómina](help/corregir-nomina/07-sacar-y-recalcular.webp)

Los días de lo que se sacó vuelven a quedar pendientes, para otra nómina. Quien se queda sin nada sale de la nómina. Una nómina no puede quedar sin ciclos: para eso, se elimina.

## Sacar a una persona
<!-- preguntas: sacar a un trabajador de la nómina; quitar a alguien de la nómina; una persona no debía cobrar en esta nómina -->

Con **Editar contenido** activo, cada persona tiene una **✕** al final de su fila.

![La ✕ para sacar a una persona](help/corregir-nomina/08-sacar-persona.webp)

Tócala y confirma con **Sacar**. Sus días vuelven a quedar pendientes y sus anticipos vuelven a estar por cobrar. Se puede volver a sumar con **+ Agregar persona**.

![Confirmar que sale de la nómina](help/corregir-nomina/09-confirmar-sacar.webp)

## Qué pasa con los anticipos y bonos
<!-- preguntas: qué pasa con los anticipos si corrijo la nómina; el anticipo no se descontó entero; anticipo vuelve a quedar pendiente -->

- Si a alguien le baja lo que cobra y su anticipo ya no cabe entero, la parte que no cabe vuelve al mismo anticipo, con sus cuotas, para descontarse en la próxima nómina.
- Al agregarle días a alguien, se le descuentan los anticipos pendientes que esta nómina todavía no le tocaba. Lo que ya descuenta de un anticipo no crece.
- Quien sale de la nómina recupera todos sus anticipos y bonos de esta nómina.

## Cambiar los nombres de los ciclos en el resumen
<!-- preguntas: cambiar el nombre del ciclo en la nómina; encabezados del resumen; renombrar el ciclo solo en la nómina -->

**Editar encabezados** cambia cómo se llama cada ciclo en el resumen, el Excel y lo que se imprime de esta nómina, sin tocar el ciclo. Recalcular no cambia esos nombres.

## Si algo no funciona
<!-- preguntas: no aparece editar contenido; no puedo sacar el ciclo; no aparece el ciclo para agregar -->

- **No se puede editar**: la nómina está pagada o tiene las transferencias selladas. Reviértelo desde **⋯** en el historial.
- **No se puede sacar el último ciclo**: una nómina no queda vacía. Elimínala desde **⋯**.
- **No aparece un ciclo en + Agregar ciclo**: está cerrado, no tiene nada pendiente (**Sin pendientes**) o ya está entero en esta nómina.
