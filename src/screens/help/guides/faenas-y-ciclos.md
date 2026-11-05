# Faenas, subfaenas y ciclos

Todo lo que se anota en TeRRa cuelga de una **faena** (el fundo o el cliente). Cada faena se divide en **subfaenas** (un cuartel, un sector), y cada subfaena tiene sus **ciclos**: el período de trabajo donde se anotan las jornadas, en su grilla. Esta guía crea una faena con su primer ciclo, y explica cómo se cierra y se reabre un ciclo.
<!-- preguntas: qué es una faena; qué es un ciclo; qué es una subfaena; cómo se organiza el trabajo -->

## Crear una faena
<!-- preguntas: cómo creo una faena; agregar un fundo nuevo; cliente nuevo; nueva faena -->

1. En **Faenas**, toca **+ Nueva faena**.

![El botón para crear una faena](help/faenas-y-ciclos/01-nueva-faena.webp)

2. Escribe el **Nombre**; la **Ubicación** y las **Notas** son opcionales. Toca **Guardar**.

![Los datos de la faena](help/faenas-y-ciclos/02-datos-faena.webp)

El nombre se guarda con mayúscula al comienzo de cada palabra: "fundo el peumo" queda "Fundo El Peumo", y "SANTA ANGELA" queda "Santa Angela". Una sigla en mayúsculas entre palabras en minúscula se respeta: "Ensayo INIA". Para cambiar los datos después, toca **Editar** en la tarjeta de la faena.

## Crear una subfaena
<!-- preguntas: cómo creo una subfaena; agregar un cuartel; nuevo sector; dividir una faena -->

1. Toca la tarjeta de la faena. Abajo aparece su detalle.
2. Toca **+ Subfaena** (o **Crear subfaena**, si todavía no tiene ninguna).

![Una faena sin subfaenas](help/faenas-y-ciclos/03-faena-sin-subfaenas.webp)

3. Escribe el nombre y toca **Guardar**.

## Crear el primer ciclo
<!-- preguntas: cómo creo un ciclo; dónde anoto las jornadas de una subfaena nueva; empezar un ciclo; primer ciclo -->

Al guardar una subfaena, TeRRa ofrece crear su primer ciclo, porque las jornadas se anotan dentro de un ciclo. Toca **Crear ciclo** (con **Después** lo creas más tarde, con **+ Ciclo**).

![La oferta de crear el primer ciclo](help/faenas-y-ciclos/04-primer-ciclo.webp)

En el formulario:

- **Etiqueta**: el comienzo, "Faena/Subfaena/", es fijo; escribe el resto, por ejemplo "Ciclo 1".
- **Fecha inicio**: es el primer día de la grilla. Los demás días se agregan en el ciclo con **+ Día**.
- **Primera labor**: el tipo de pago (Pago al día, Supervisión, Adicional, Cosecha, A trato, A trato por etapas o Jornadas con horas extras). Marca **Agregar también una labor de Supervisión** si el ciclo lleva supervisores.

![El formulario de un ciclo nuevo](help/faenas-y-ciclos/05-nuevo-ciclo.webp)

Toca **Guardar**. El ciclo aparece en la subfaena; con **Abrir** se entra a su grilla (ver la guía [Anotar jornadas en la grilla del ciclo](/ayuda/grilla-del-ciclo)).

## Agregar otro ciclo a una subfaena
<!-- preguntas: cómo creo otro ciclo; segundo ciclo; nuevo ciclo en la misma subfaena; importar labores de otro ciclo; mover jornadas a otro ciclo -->

Toca **+ Ciclo** en la fila de la subfaena. Una subfaena puede tener varios ciclos abiertos a la vez.

Si la subfaena ya tiene un ciclo abierto, el formulario ofrece **Importar desde un ciclo abierto del mismo ámbito**:

- **Labores a clonar**: el ciclo nuevo arranca con esas labores, con su configuración.
- **Días a importar**: las fechas del ciclo nuevo.
- **Copiar precios por día** de esas labores y días.
- **Mover** las jornadas de esas labores y días al ciclo nuevo. Desaparecen del ciclo de origen; las que ya están en una nómina se quedan donde estaban.

## Lo que se puede hacer con un ciclo
<!-- preguntas: cómo renombro un ciclo; cambiar la fecha de un ciclo; ver la producción de un ciclo; botones del ciclo -->

![La fila de un ciclo](help/faenas-y-ciclos/06-fila-del-ciclo.webp)

- **📊 Resumen**: la producción día por día, con precios, unidades y rendimiento.
- **Abrir**: entra a la grilla del ciclo.
- **✏ Renombrar**: cambia la etiqueta, la fecha de inicio y las notas.
- **Cerrar**: ver "Cerrar un ciclo".
- **Eliminar**: ver "Eliminar un ciclo, una subfaena o una faena".

## Cerrar un ciclo
<!-- preguntas: cómo cierro un ciclo; terminar un ciclo; dar por terminado un ciclo; congelar un ciclo; cerrar los ciclos pagados -->

Un ciclo se cierra cuando ya está pagado y revisado.

1. Toca **Cerrar** en la fila del ciclo, y **Cerrar ciclo** para confirmar.

![Confirmar el cierre](help/faenas-y-ciclos/07-cerrar-ciclo.webp)

2. TeRRa ofrece crear el ciclo siguiente, con las mismas labores y, si dejas marcada la casilla, la misma gente en cada labor. Toca **Crear ciclo** o **No, gracias**.

![La oferta del ciclo siguiente](help/faenas-y-ciclos/08-ciclo-siguiente.webp)

**Qué pasa al cerrarlo:** el ciclo queda congelado para todos, también para un admin. Su grilla, sus precios y sus labores no se pueden cambiar, y Nómina deja de ofrecerlo para generar.

También se cierra desde la pantalla del ciclo (**Cerrar ciclo**, arriba) y desde Nómina, que ofrece cerrar de una vez los ciclos que ya quedaron pagados enteros.

En la subfaena, los ciclos cerrados quedan ocultos mientras haya alguno abierto: **▾ Ver N ciclos cerrados** los muestra.

## Reabrir un ciclo
<!-- preguntas: cómo reabro un ciclo; corregir un ciclo cerrado; abrir un ciclo cerrado; me equivoqué en un ciclo cerrado -->

Para corregir algo en un ciclo cerrado, toca **↻ Reabrir** en su fila (o **Reabrir ciclo** en la pantalla del ciclo). Corrige lo que haga falta y vuelve a cerrarlo.

![Un ciclo cerrado, con Reabrir](help/faenas-y-ciclos/09-reabrir.webp)

## Eliminar un ciclo, una subfaena o una faena
<!-- preguntas: cómo elimino un ciclo; borrar un ciclo; eliminar una faena; borrar una subfaena; no me deja eliminar -->

- **Un ciclo**: **Eliminar** en su fila. Se borra con sus jornadas. Si alguna de sus jornadas ya está en una nómina, TeRRa no lo deja: primero hay que eliminar esa nómina.
- **Una subfaena**: **Eliminar** en su fila. Si tiene ciclos, solo un admin puede borrarla, en cascada con sus ciclos y sus jornadas, y solo si ninguna de esas jornadas está en una nómina.
- **Una faena**: **Eliminar** en su tarjeta. Solo se puede si no tiene subfaenas ni ciclos; un admin puede borrarla en cascada, con todo lo que tiene adentro, si ninguna de sus jornadas está en una nómina.

Eliminar no se puede deshacer.

## Ordenar las tarjetas de las faenas
<!-- preguntas: cómo ordeno las faenas; agrupar faenas; cambiar el color de una faena; mover una faena -->

Arrastra una tarjeta para cambiarla de lugar. **⚙ Organizar** permite además crear grupos (**+ Grupo**), mover las faenas entre ellos y elegir colores. **✓ Listo** termina.

## Si algo no funciona
<!-- preguntas: no puedo editar un ciclo; no aparece un ciclo; no encuentro un ciclo cerrado; no me deja eliminar una faena; no me deja eliminar una subfaena -->

- **No se puede editar nada del ciclo**: está cerrado. Reábrelo (ver "Reabrir un ciclo").
- **No aparece un ciclo cerrado**: toca **▾ Ver N ciclos cerrados** en su subfaena.
- **No se puede eliminar un ciclo**: alguna de sus jornadas está en una nómina.
- **No se puede eliminar una faena o una subfaena**: todavía tiene subfaenas o ciclos. Un admin puede borrarla en cascada.
