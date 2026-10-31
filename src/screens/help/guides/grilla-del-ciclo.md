# Anotar jornadas en la grilla del ciclo

La grilla del ciclo es donde se anota lo que trabajó cada persona cada día. Esta guía usa una labor al día (Principal, Supervisión o Adicional); en cosecha, trato y horas extras las celdas se anotan igual, pero con sus propias columnas.
<!-- preguntas: cómo anoto lo que trabajó la gente; dónde se anotan las jornadas; cómo uso la grilla -->

## Abrir un ciclo
<!-- preguntas: dónde están los ciclos; cómo entro a un ciclo; cómo abro la grilla; dónde anoto los días trabajados -->

1. En **Faenas**, toca la tarjeta de la faena.
2. Debajo aparecen sus subfaenas con sus ciclos. En la fila del ciclo, toca **Abrir**.

![Una faena abierta, con su subfaena y su ciclo](help/grilla-del-ciclo/01-abrir-ciclo.webp)

## Lo que hay en la pantalla del ciclo
<!-- preguntas: qué es cada parte de la grilla; dónde veo el total del ciclo; para qué sirven las pestañas -->

![La pantalla del ciclo](help/grilla-del-ciclo/02-pantalla.webp)

1. **Las labores del ciclo**, una pestaña por labor. **+ Labor** agrega otra.
2. **Precios por día**: el monto sugerido de cada día.
3. **La grilla**: una fila por persona y una columna por día, con el total de cada persona a la derecha.

Arriba, las **métricas** muestran cuánto suma cada labor y el ciclo entero. **▼** pliega las métricas y los precios para darle más espacio a la grilla.

## Anotar el monto de un día
<!-- preguntas: cómo anoto el monto de un día; cómo pongo lo que ganó una persona; cómo escribo en una celda; cómo cambio un monto; cómo uso fórmulas -->

Una celda vacía muestra en gris el precio del día (por ejemplo, **+ $30.000**). **Un clic** lo anota tal cual.

![El precio sugerido en una celda vacía](help/grilla-del-ciclo/03-precio-sugerido.webp)

Para escribir otro monto, o cambiar uno que ya está:

1. **Doble clic** en la celda, o elígela con las flechas y aprieta **Enter**.
2. Escribe el monto y aprieta **Enter**. Se guarda solo y el cursor baja a la persona siguiente.

En una celda también se puede escribir una cuenta que empiece con `=`, por ejemplo `=350*54`, y queda el resultado.

## Cambiar el precio de un día
<!-- preguntas: cómo cambio el precio del día; el valor del día está mal; precio sugerido; cuánto se paga el día -->

En **Precios por día**, escribe el monto en la tarjeta del día. Es el que aparece sugerido en las celdas vacías de ese día. Cada tarjeta dice además cuántas personas trabajaron ese día.

![Los precios por día](help/grilla-del-ciclo/04-precios-del-dia.webp)

## Anotar o borrar varias celdas de una vez
<!-- preguntas: cómo pego desde Excel; cómo copio una columna; cómo selecciono varias celdas; cómo borro varias celdas; atajos de teclado -->

- **Elegir varias celdas** de un mismo día: haz clic en la primera y **Shift+clic** en la última (o Shift+↑/↓).
- **Ctrl+C** copia las elegidas, listas para pegar en Excel.
- **Ctrl+V** pega:
  - un solo valor llena todas las elegidas;
  - una columna copiada de Excel baja una línea por persona, desde la primera elegida.
- **Supr** deja las elegidas en cero.

![Varias celdas elegidas con Shift](help/grilla-del-ciclo/05-varias-celdas.webp)

Los atajos están siempre a mano: pasa el mouse sobre **⌨ Atajos**, arriba a la derecha.

## Deshacer un cambio
<!-- preguntas: me equivoqué; cómo deshago; cómo vuelvo atrás; borré algo sin querer; recuperar un monto -->

**Ctrl+Z** deshace la última edición. Un pegado o un borrado de varias celdas se deshace entero de una vez. Lo que cambiaste en otra labor se deshace desde esa labor.

## Agregar a una persona a la labor
<!-- preguntas: cómo agrego un trabajador al ciclo; sumar una persona a la grilla; falta alguien en la grilla; la persona no aparece; trabajador sin rut; trabajador nuevo -->

1. Toca **+ Trabajador**.
2. Escribe al menos 3 letras del nombre, el apellido o el RUT, y toca a la persona.

![Buscar a la persona para agregarla](help/grilla-del-ciclo/06-agregar-persona.webp)

- **Si no existe**, toca **+ Crear nuevo trabajador** para darla de alta ahí mismo.
- **Si todavía no tienes su RUT**, toca **+ Crear trabajador temporal**: queda en la grilla con una **T** y con **Asignar RUT** para completarla cuando llegue el dato, sin perder sus días.

## Agregar un día al ciclo
<!-- preguntas: cómo agrego un día; falta un día en la grilla; cómo quito un día; agregar fecha al ciclo -->

Toca **+ Día** y elige la fecha en el calendario.

![El botón para agregar un día](help/grilla-del-ciclo/07-agregar-dia.webp)

Para quitar un día, toca la **✕** de su fecha, sobre la grilla. Solo se puede si ninguna labor tiene producción ese día ni hay vueltas de transporte.

![Las fechas del ciclo, cada una con su ✕](help/grilla-del-ciclo/07-quitar-dia.webp)

## Anotar algo de un día
<!-- preguntas: cómo anoto que llovió; nota del día; observación de un día; comentario en una fecha -->

Toca la fecha en el encabezado de la grilla (la que tiene **📝**) y escribe la nota. La nota es de la labor en que estás, y se lee al pasar el mouse sobre la fecha; el 📝 se marca en color cuando el día tiene una. Se puede anotar en los días que ya tienen algo anotado en esa labor.

![Una nota del día](help/grilla-del-ciclo/08-nota-del-dia.webp)

## Sueldo mensual: solo asistencia
<!-- preguntas: sueldo mensual; cómo marco la asistencia; trabajador mensual; no le pago por día; para qué sirve la M; contratado con sueldo -->

A quien tiene sueldo mensual no se le anotan montos, solo los días que vino:

1. Toca la **M** de su fila, a la derecha. La M queda verde.
2. Sus celdas pasan a ser casillas de asistencia: un clic marca ✓ y otro lo quita.

![Una persona con sueldo mensual](help/grilla-del-ciclo/09-mensual.webp)

Sus días no entran a la nómina. Si ya tenía días con monto, TeRRa pregunta si pasarlos a asistencia en $0; los que ya están en una nómina no se tocan.

## Ver la grilla por grupo
<!-- preguntas: ver por grupo; ver por líder; ocultar a los que no trabajaron; filtrar la grilla; ver solo los que tienen producción -->

- **Por grupo** junta a las personas según su líder de grupo, con un salto a cada grupo.
- **Con producción** oculta a quien no tiene nada anotado en esta labor.

![Las vistas de la grilla](help/grilla-del-ciclo/10-por-grupo.webp)

## En el teléfono
<!-- preguntas: cómo anoto desde el celular; la grilla en el teléfono; usar la grilla en el teléfono -->

En el teléfono, la grilla pasa a ser una lista de personas con su total del ciclo, con un buscador arriba. Toca a una para abrir su ficha del ciclo, con una tarjeta por día; cada campo se guarda al salir de él. **🗂 Ver grilla completa** muestra la grilla de escritorio, y **📋 Ver por trabajador** vuelve a la lista.

![La lista de personas en el teléfono](help/grilla-del-ciclo/11-telefono.webp)

## Si algo no se deja editar
<!-- preguntas: no puedo editar; no me deja escribir en la celda; celda bloqueada; por qué no puedo cambiar un monto; ciclo cerrado -->

- **El ciclo está cerrado.** Un ciclo cerrado queda congelado: para corregir algo hay que reabrirlo con **Reabrir ciclo**, arriba en la pantalla del ciclo o en su fila de Faenas.
- **La persona tiene sueldo mensual.** Sus celdas son de asistencia, no reciben montos (ver "Sueldo mensual").
- **La labor está sincronizada por QR.** La cantidad la escriben los pesajes; se corrige en **Cosecha QR**.
