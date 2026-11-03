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

![Editar ciclos y Agregar persona](help/corregir-nomina/03-editar-contenido.webp)

2. Busca a la persona por nombre o RUT. Aparecen sus días sin pagar, agrupados; los que ya están en una nómina se ven sin casilla.
3. Marca los días que entran (o **Todos**, en un grupo) y toca **Agregar días**.

![Los días de una persona](help/corregir-nomina/04-agregar-persona.webp)

Si tiene anticipos o bonos pendientes, se descuentan o se suman al agregarla.

## Agregar o sacar ciclos y labores
<!-- preguntas: agregar un ciclo a la nómina; sumar otro ciclo a una nómina hecha; agregar una labor a la nómina; faltó un ciclo en la nómina; sacar un ciclo de la nómina; quitar una labor de la nómina; un ciclo no debía ir en la nómina; sacar días de la nómina; cambiar los ciclos de la nómina; cambiar una labor por otra -->

1. Toca **Editar contenido** y después **Editar ciclos**. Aparecen los ciclos abiertos, como al generar la nómina. Los de esta nómina vienen marcados, con sus labores y lo que paga cada una.
2. Marca lo que entra y desmarca lo que sale: ciclos enteros o labores sueltas, todo de una vez. Abajo se ve cuánto entra y cuánto sale; **Deshacer** vuelve a como estaba.

![Un ciclo que sale y otro que entra sin una de sus labores](help/corregir-nomina/05-editar-ciclos.webp)

3. Toca **Revisar cambios**. TeRRa muestra lo que entra y lo que sale, quién sale de la nómina, a quién le cambia el monto y quién entra. Toca **Aplicar cambios**.

![Cómo queda la nómina con los cambios](help/corregir-nomina/06-revisar-cambios.webp)

Quien ya estaba en la nómina suma lo que entra, y quien no estaba, entra. Los días de lo que sale vuelven a quedar pendientes, para otra nómina, y quien se queda sin nada sale de la nómina. Una nómina no puede quedar sin ciclos: para eso, se elimina.

## Sacar a una persona
<!-- preguntas: sacar a un trabajador de la nómina; quitar a alguien de la nómina; una persona no debía cobrar en esta nómina -->

Con **Editar contenido** activo, cada persona tiene una **✕** al final de su fila.

![La ✕ para sacar a una persona](help/corregir-nomina/07-sacar-persona.webp)

Tócala y confirma con **Sacar**. Sus días vuelven a quedar pendientes y sus anticipos vuelven a estar por cobrar. Se puede volver a sumar con **+ Agregar persona**.

![Confirmar que sale de la nómina](help/corregir-nomina/08-confirmar-sacar.webp)

## Qué pasa con los anticipos y bonos
<!-- preguntas: qué pasa con los anticipos si corrijo la nómina; el anticipo no se descontó entero; anticipo vuelve a quedar pendiente -->

- Si a alguien le baja lo que cobra y su anticipo ya no cabe entero, la parte que no cabe vuelve al mismo anticipo, con sus cuotas, para descontarse en la próxima nómina.
- Al agregarle días a alguien, se le descuentan los anticipos pendientes que esta nómina todavía no le tocaba. Lo que ya descuenta de un anticipo no crece.
- Quien entra a la nómina con un ciclo o una labor trae sus anticipos y bonos pendientes, como al generarla.
- Quien sale de la nómina recupera todos sus anticipos y bonos de esta nómina.

## Cambiar los nombres de los ciclos en el resumen
<!-- preguntas: cambiar el nombre del ciclo en la nómina; encabezados del resumen; renombrar el ciclo solo en la nómina -->

**Editar encabezados** cambia cómo se llama cada ciclo en el resumen, el Excel y lo que se imprime de esta nómina, sin tocar el ciclo. Recalcular no cambia esos nombres.

## Si algo no funciona
<!-- preguntas: no aparece editar contenido; no puedo sacar el ciclo; no aparece el ciclo para agregar -->

- **No se puede editar**: la nómina está pagada o tiene las transferencias selladas. Reviértelo desde **⋯** en el historial.
- **No se puede sacar el último ciclo**: una nómina no queda vacía. Elimínala desde **⋯**.
- **No aparece un ciclo en Editar ciclos**: está cerrado, o no tiene nada pendiente y queda detrás de **Sin pendientes**. Los ciclos de la nómina aparecen siempre.
