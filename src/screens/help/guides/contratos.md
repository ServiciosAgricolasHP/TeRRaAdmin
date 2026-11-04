# Contratos, honorarios e imposiciones

En **Trabajadores** se lleva quién tiene contrato, quién trabaja a honorarios y quién no tiene nada, con qué empleador, para qué mandante y desde cuándo. Con eso TeRRa arma la lista de boletas de honorarios y la de imposiciones del mes para el contador, con los días que trabajó cada persona. Todo está en las pestañas **📄 Contratos**, **🧾 Honorarios** y **🏛 Imposiciones**.
<!-- preguntas: contratos de los trabajadores; quién tiene contrato; trabajadores a honorarios; imposiciones; boletas de honorarios -->

## Antes de empezar: los empleadores
<!-- preguntas: agregar un empleador; empresa empleadora; cambiar el nombre de la empresa; desactivar un empleador -->

Cada contrato y cada período a honorarios es con un empleador. En **📄 Contratos**, toca **⚙ Empleadores**:

![Los empleadores](help/contratos/01-empleadores.webp)

- Escribe el nombre y el RUT, y toca **+ Agregar**.
- **✏️ Editar** corrige uno.
- **Desactivar** deja de ofrecerlo al contratar; sus períodos se conservan.

## Los mandantes
<!-- preguntas: empresa mandante; agregar un mandante; para qué empresa trabaja; separar los contratos por mandante; cliente del contrato -->

El mandante es la empresa para la que se presta el servicio. Cada contrato o período a honorarios puede llevar uno, y con eso se filtran los contratos y se arman las listas de honorarios o de imposiciones de un solo mandante. En **📄 Contratos**, toca **⚙ Mandantes**: se agregan, corrigen y desactivan igual que los empleadores.

![Los mandantes](help/contratos/02-mandantes.webp)

- Al contratar se elige el **Mandante**. Se puede dejar en **Sin mandante**.
- Para ponérselo a contratos que ya existen, márcalos en **Vigentes** (o en **Finiquitos**), toca **🤝 Mandante (N)**, elige el mandante y toca **Guardar**. Ahí mismo, **Sin mandante** se lo quita.

![El mandante para los contratos elegidos](help/contratos/05-mandante-en-bloque.webp)

- En la ficha del trabajador, **✏️** en un período lo cambia.

## Contratar a varias personas de una vez
<!-- preguntas: cómo contrato a un trabajador; hacer un contrato; contratar a todos los del ciclo; pasar a honorarios; registrar un contrato -->

1. En **📄 Contratos**, toca **+ Contratar**.
2. Elige el **Tipo** (**📄 Contrato** o **🧾 Honorarios**), el **Empleador**, la fecha **Desde** y, si corresponde, el **Mandante**.
3. Suma a las personas una por una con el buscador, o elige un ciclo en **O desde un ciclo abierto**: TeRRa suma a quienes están en sus labores y no tienen contrato ni honorarios en esa fecha. Quita con **✕** a quien no va.
4. Toca **Contratar (N)** (o **Pasar a honorarios (N)**). TeRRa revisa que nadie tenga ya un período en esa fecha y guarda. Si alguien lo tiene, lo muestra con el motivo y espera: **Contratar a N** guarda a los demás.

![Contratar a la gente de un ciclo](help/contratos/03-contratar.webp)

## Ver quién tiene contrato
<!-- preguntas: lista de contratos vigentes; quién está a honorarios; ver los contratos; cuántos tienen contrato -->

**Vigentes** lista los contratos y honorarios de hoy, con el empleador, el mandante y las fechas. Arriba se cuenta cuántos tienen contrato, cuántos están a honorarios y cuántos finiquitos faltan por cerrar.

![Los contratos vigentes, con una persona elegida](help/contratos/04-vigentes.webp)

- Se filtra por tipo, por empleador, por mandante (o **Sin mandante**, para ver a quién le falta) y por nombre o RUT.
- El nombre de una persona abre su ficha.
- En **👷 Trabajadores**, el filtro **📄 Contrato** muestra a quienes tienen contrato, están a honorarios o no tienen nada, y se puede afinar por empleador y por mandante.

## Terminar contratos
<!-- preguntas: terminar un contrato; despedir a un trabajador; fin de faena; renuncia; dar de baja a un trabajador; terminar honorarios -->

1. En **Vigentes**, marca a las personas (la casilla de arriba las marca todas).
2. Toca **Terminar (N)**.
3. Elige la **Fecha de término** y el **Motivo**: término de faena, necesidad de la empresa, renuncia, mutuo acuerdo u otro.
4. Toca **Terminar N**.

![Terminar un contrato](help/contratos/06-terminar.webp)

El contrato terminado queda con el finiquito pendiente. Los honorarios no tienen finiquito.

## Seguir los finiquitos
<!-- preguntas: finiquitos pendientes; pedir el finiquito al contador; finiquito listo; estado del finiquito -->

**Finiquitos** muestra los contratos terminados, con el motivo y el estado del finiquito: **Pendiente**, **Solicitado** (al contador) o **Listo**. Marca a varios y toca **Marcar solicitado** o **Marcar listo**: queda con la fecha del día. Los listos se siguen viendo por 90 días.

![Los finiquitos](help/contratos/07-finiquitos.webp)

## El historial de una persona
<!-- preguntas: historial de contratos de un trabajador; corregir la fecha de un contrato; eliminar un contrato mal hecho; contrato anterior -->

En la ficha del trabajador (**Editar** en **👷 Trabajadores**, o su nombre en **📄 Contratos**), **Contrato u honorarios** muestra su situación de hoy y todos sus períodos.

![El historial en la ficha](help/contratos/08-historial.webp)

- **+ Período** agrega uno, por ejemplo uno anterior.
- **✏️** corrige un período y **🗑️** elimina uno cargado por error. Para cerrar el de hoy, usa **Terminar**.
- Dos períodos de una persona no pueden cruzarse: TeRRa avisa con cuál choca.

## Ver en la grilla quién tiene contrato
<!-- preguntas: grilla por contrato; ver en el ciclo quién tiene contrato; separar a los de honorarios en la grilla -->

En la grilla del ciclo, **Por contrato** junta a las personas en **Con contrato**, **A honorarios** y **Sin contrato ni honorarios**, según lo que tuvieron en algún día del ciclo. Quien tuvo contrato y honorarios en el mismo ciclo va con contrato. Se ve en la grilla, no en la lista del teléfono.

![La grilla por contrato](help/contratos/09-grilla-por-contrato.webp)

## Generar la lista de honorarios
<!-- preguntas: cómo hago las boletas de honorarios; lista de boletas; cuánto pagar a honorarios; calcular los honorarios; nómina de honorarios; honorarios de una sola faena -->

1. En **🧾 Honorarios**, toca **+ Generar lista**.
2. Elige el **Empleador**, el **Mandante** (o **Todos los mandantes**) y las fechas (**Desde** y **Hasta**; vienen del primero del mes a hoy), y toca **Calcular días**.
3. TeRRa arma una fila por persona y faena con los días que trabajó a honorarios con ese empleador y, si elegiste uno, para ese mandante. Un día cuenta si tiene al menos una jornada, y un día con jornadas en dos faenas cuenta una sola vez.
4. Corrige los **Días**, quita a alguien con **✕** o súmalo en **Sumar a alguien**. Si hay varias faenas, en **Faenas** toca las que no van para sacarlas de la lista (otro toque las vuelve a poner). Para quedarte con unas pocas, toca **Ninguna** y después las que sí.
5. Revisa el aviso **Sin dirección**: la boleta la pide, y se completa en la ficha de cada persona.
6. Toca **Guardar lista**.

![Una lista de honorarios recién calculada, con sus dos faenas](help/contratos/10-generar-honorarios.webp)

**Los montos**: cada día se paga un **Líquido por día** fijo, y la boleta retiene un porcentaje (**Retención**). El bruto es lo que va en la boleta. Por ejemplo, 3 días a $18.452 son $55.356 líquidos y $65.316 brutos. La tarifa se puede cambiar para una lista; la de siempre la cambia un admin en **⚙ Tarifa**.

## Anotar las boletas emitidas
<!-- preguntas: anotar el folio de la boleta; boleta emitida; cuántas boletas faltan; excel de honorarios -->

Al guardarla, la lista se abre. Escribe el **Folio** de cada boleta emitida (queda marcada, con la fecha del día) y toca **Guardar**.

![Las boletas de una lista](help/contratos/11-boletas.webp)

- En **🧾 Honorarios**, cada lista dice cuántas boletas lleva emitidas.
- **📊 Excel** baja la lista por faena, con el RUT, los días, el bruto, la retención, el líquido y la dirección.
- Una lista sin boletas emitidas se puede eliminar con **🗑 Eliminar lista**.

## Generar la lista de imposiciones del mes
<!-- preguntas: cómo hago las imposiciones; lista para el contador; días imponibles; imposiciones del mes; pedir las liquidaciones; imposiciones de una sola faena -->

1. En **🏛 Imposiciones**, toca **+ Generar lista**.
2. Elige el **Empleador**, el **Mandante** (o **Todos los mandantes**) y el **Mes** (viene el mes anterior), y toca **Calcular días**.
3. TeRRa arma una fila por persona y faena con los días que trabajó dentro de su contrato. Con un mandante, entran solo los contratos de ese mandante. Si el contrato terminó ese mes, la fila pide **Liquidación + finiquito**, con la fecha y el motivo; si no, **Liquidación**. Quien tuvo contrato y no trabajó va en **Sin días trabajados**.
4. Corrige los días, quita o suma a alguien, y deja en **Faenas** solo las que van, igual que en honorarios. Toca **Guardar lista**.

![Una lista de imposiciones](help/contratos/12-generar-imposiciones.webp)

La lista lleva solo los días: el sueldo y los bonos los completa el contador.

## Enviar las imposiciones al contador
<!-- preguntas: mandar las imposiciones al contador; excel de imposiciones; lista enviada al contador -->

En la lista guardada, **📊 Excel** la baja con una sección por faena. Después de mandarla, toca **Marcar enviada al contador**: queda con la fecha del día. Mientras no se envíe, se puede eliminar.

![La lista guardada, lista para enviar](help/contratos/13-enviar-imposiciones.webp)

## En el teléfono
<!-- preguntas: contratos en el celular; terminar contratos desde el teléfono -->

En el teléfono, los contratos y los finiquitos pasan a tarjetas, cada una con su casilla para elegirla.

![Los contratos en el teléfono](help/contratos/14-telefono.webp)

## Si algo no funciona
<!-- preguntas: no aparece en la lista de honorarios; faltan días en las imposiciones; no puedo contratar a alguien; no me deja eliminar la lista -->

- **Alguien quedó afuera al contratar**: ya tiene un período en esa fecha. Revisa su historial en la ficha.
- **Falta alguien en la lista de honorarios o de imposiciones**: no tenía honorarios o contrato con ese empleador (o con ese mandante) en esas fechas, o no tiene jornadas. Revisa su mandante en **Vigentes**, o súmalo con **Sumar a alguien**.
- **Los días no calzan con la grilla**: un día con jornadas en dos faenas cuenta una sola vez, en la de mayor monto. Corrige los días antes de guardar.
- **No se puede eliminar una lista**: la de honorarios ya tiene boletas emitidas, o la de imposiciones ya se marcó enviada (**Marcar no enviada** lo deshace).
- **No aparece un empleador o un mandante al contratar**: está desactivado. Actívalo en **⚙ Empleadores** o **⚙ Mandantes**.
