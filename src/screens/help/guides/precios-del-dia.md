# Precios del día y piso

Cada labor de un ciclo tiene un **tipo**, y el tipo decide cómo se paga: qué precios se anotan cada día y qué columnas tiene la grilla. Los precios van en el panel que está sobre la grilla, con una tarjeta por día. Esta guía recorre cada tipo y el **piso**, el bono del día de las labores de cosecha y a trato.
<!-- preguntas: cómo se paga cada labor; dónde pongo los precios; tipos de labor; precios por día -->

## Agregar una labor al ciclo
<!-- preguntas: cómo agrego una labor; nueva labor; cambiar el tipo de una labor; editar una labor; agregar cosecha a un ciclo -->

1. En la pantalla del ciclo, toca **+ Labor**, al lado de las pestañas de las labores.
2. Escribe el **Nombre** y elige el **Tipo**: Pago al día, Supervisión, Adicional, Cosecha, A trato, A trato por etapas o Jornadas con horas extras. Según el tipo aparecen sus propios datos, como la base diaria y la tarifa de la hora extra.
3. Toca **Guardar**. La labor queda como una pestaña más.

![El formulario de una labor nueva](help/precios-del-dia/01-nueva-labor.webp)

**Grupo de labor** une esta labor con la del mismo nombre en otros ciclos de la subfaena, para ver su historia junta. Para cambiar los datos después, toca **Editar labor** con la labor elegida.

## Pago al día, Supervisión y Adicional
<!-- preguntas: precio del día en pago al día; cuánto se paga el día; labor al día; supervisión; adicional -->

Se paga un monto por día. En **Precios por día** se anota el precio de cada día, que es el que aparece sugerido en las celdas vacías (ver [Cambiar el precio de un día](/ayuda/grilla-del-ciclo#cambiar-el-precio-de-un-dia)). Cambiarlo no toca los montos que ya están anotados.

## Cosecha: un precio por calidad y envase
<!-- preguntas: precio de la cosecha; precio por kilo; precio por bandeja; agregar calidad; agregar envase; cosecha por calidad -->

Cada día tiene sus **tipos**: una calidad y un envase (por ejemplo, Exportación / bandeja), cada uno con su precio. En la grilla, cada tipo es una columna del día, donde se anota la cantidad de cada persona; el monto es cantidad × precio.

![Los tipos de cosecha de un día](help/precios-del-dia/02-cosecha.webp)

- **$/unidad** paga cada unidad al precio; **$/día** paga el precio una vez, sin importar la cantidad.
- **+ tipo** agrega otro tipo a ese día. Elige la calidad y el envase; si no están, **+ Nueva calidad** y **+ Nuevo envase** los crean.
- La **✕** de un tipo lo quita del día.

![Agregar un tipo de cosecha](help/precios-del-dia/03-agregar-tipo.webp)

Las calidades y los envases se editan en **⚙ Catálogos**, arriba en la pantalla del ciclo.

## A trato: uno o varios precios por día
<!-- preguntas: precio del trato; trato por planta; pagar por metro; varios precios en un día; trato con precio fijo; unidad del trato -->

Cada día tiene uno o más precios (P1, P2…). Para cada uno se elige la **unidad** (Planta, Metro, Polín…) y si se paga **/unid** (cantidad × precio) o **/día** (el precio una vez). Arriba a la derecha de la tarjeta, lo producido ese día, cuántas personas y el promedio por persona.

![Los precios de un día de trato](help/precios-del-dia/04-trato.webp)

**+ Agregar precio** suma otro precio a ese día, que en la grilla es otra columna. El **Tipo de trato** de la labor (Poda, Amarre…) es el nombre con que se muestran las cantidades.

## A trato por etapas
<!-- preguntas: trato por etapas; etapas de una labor; precio por etapa; qué significa cuenta; agregar una etapa -->

La labor tiene **etapas** (por ejemplo, Armado y Embalado), y cada día tiene un precio por etapa, por unidad (**u**) o por día (**d**). En la grilla, cada día tiene una columna por etapa.

![Los precios por etapa de un día](help/precios-del-dia/08-etapas.webp)

Las etapas se definen en **Editar labor**: **+ Agregar etapa**, su nombre y si **cuenta**. Todas las etapas se pagan; la marca **cuenta** (✓) dice cuáles suman unidades terminadas para el cliente, así una misma unidad no se cuenta dos veces.

![Las etapas de una labor](help/precios-del-dia/09-etapas-editar.webp)

## Jornadas con horas extras
<!-- preguntas: horas extras; cómo pago las horas extras; tarifa hora extra; bono de manejo; bono de supervisión; día feriado; solo horas extras; base diaria -->

Cada día se paga una **base**, más las **horas extras** a su tarifa y los **bonos** de manejo y de supervisión. Los valores por defecto (base diaria, tarifa de la hora extra y los dos bonos) son de la labor y se cambian en **Editar labor**.

En **Configuración por día** cada día muestra su base y su modo. Toca un día para cambiarlo:

![La configuración de cada día](help/precios-del-dia/10-horas-extras.webp)

- **Base diaria**: la base de ese día, si no es la de siempre.
- **Jornada normal**: base, horas extras y bonos.
- **Solo horas extras**: ese día no se paga la base.
- **Marcar como feriado**: el día se ve en rojo. No cambia los montos.

![Configurar un día](help/precios-del-dia/11-configurar-dia.webp)

En la grilla, cada día tiene la **Base** y las horas extras (**HE**) de cada persona. Debajo de la base van los bonos y el total del día: tócalos para marcar el bono de manejo, el de supervisión o un monto adicional. **⚑ Líderes / Manejo** deja marcados de antemano a quienes manejan o lideran.

## Piso: un bono del día
<!-- preguntas: qué es el piso; cómo pongo el piso; bono por día bajo; asignar el piso a todos; quitar el piso; bono de piso; piso por envase; dos pisos el mismo día; piso de capacho y de totem -->

El piso es un bono que se suma a lo que cada persona produjo un día, pensado para compensar un día de baja producción. Existe en las labores de **Cosecha** y **A trato**.

1. En la tarjeta del día, toca **+ piso**, escribe el monto y aprieta **Enter**.
2. Toca **👥 a todos (N)** para dárselo a todas las personas con producción ese día que todavía no lo tienen, y confirma.

![Un día con piso](help/precios-del-dia/05-piso.webp)

![Confirmar el piso para todos](help/precios-del-dia/06-piso-a-todos.webp)

En la grilla aparece la columna **Piso** de ese día. Cada 🪙 se puede quitar o volver a poner por persona, y el monto de abajo es el total del día con el piso.

![La columna Piso en la grilla](help/precios-del-dia/07-piso-grilla.webp)

- **✎** cambia el monto del piso.
- **✕** quita el piso del día junto con los bonos ya asignados. Los que ya están en una nómina no se quitan.

En cosecha, si la empresa cuenta el piso por envase (por ejemplo, más de 9 capachos y más de 9 totems), un día con dos o más envases ofrece también **+ piso** de cada envase. Cada uno tiene su monto, su **👥 a todos** (para quienes cosecharon en ese envase) y su columna en la grilla. Una persona puede tener los dos el mismo día, y se suman.

![Un día con el piso del día y el de un envase](help/precios-del-dia/07-piso-por-envase.webp)

## Cambiar un precio que ya se usó
<!-- preguntas: cambié el precio y qué pasa con los montos; corregir un precio; precio mal puesto; se recalculan los montos -->

- **Cosecha, a trato, por etapas y horas extras**: al cambiar el precio, la unidad o el modo de un día, TeRRa recalcula los montos de ese día con las cantidades ya anotadas.
- **Pago al día, Supervisión y Adicional**: cambia solo el precio sugerido; los montos anotados quedan como están.
- Una nómina ya generada guarda sus propios montos y no cambia sola. Para traer los nuevos montos, ver [Traer los cambios de la grilla](/ayuda/corregir-nomina#traer-los-cambios-de-la-grilla-recalcular).

## Si algo no funciona
<!-- preguntas: no aparece el piso; no puedo cambiar el precio; no me deja escribir el precio; precio en gris -->

- **No aparece + piso**: la labor no es de cosecha ni a trato.
- **No se puede escribir un precio**: el ciclo está cerrado (dice "solo lectura"). Reábrelo para corregirlo.
- **El precio cambió pero el monto no**: en las labores al día el precio es solo el sugerido; corrige el monto en la celda.
