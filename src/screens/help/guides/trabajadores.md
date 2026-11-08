# Trabajadores

En **Trabajadores** está la ficha de cada persona: su RUT, su líder de grupo, cómo cobra y sus datos personales. La nómina, el archivo del banco y las boletas de honorarios sacan de aquí lo que necesitan. Esta guía busca a alguien, revisa su ficha y agrega a una persona nueva. Los contratos, los honorarios y las imposiciones tienen su propia guía: [Contratos, honorarios e imposiciones](/ayuda/contratos).
<!-- preguntas: dónde están los trabajadores; ficha de un trabajador; datos de un trabajador; lista de trabajadores -->

## Buscar a alguien
<!-- preguntas: cómo busco a un trabajador; buscar por rut; encontrar a una persona; ver los trabajadores de un grupo; quiénes cobran en efectivo -->

La lista aparece al buscar o al elegir un filtro. Escribe parte del nombre, en cualquier orden ("perez ana" encuentra a Ana Pérez), o parte del RUT, con o sin puntos.

![La lista de trabajadores](help/trabajadores/01-lista.webp)

- Los filtros se combinan con la búsqueda: **👥 Líder**, **💵 Efectivo** o **🏦 Transferencia**, **📄 Contrato** (con contrato, a honorarios o sin nada, el empleador y el mandante) y **⚠ Sin titular**. **✕ Limpiar filtros** los quita todos.
- Toca un RUT para copiarlo sin puntos y con guion, listo para pegar.
- Cada fila dice si la persona cobra por **🏦 Transferencia** o en **💵 Efectivo**, y tiene **📊** (su resumen), **Editar** (su ficha) y **✕** (eliminarla).

## Agregar un trabajador
<!-- preguntas: cómo agrego un trabajador nuevo; crear un trabajador; inscribir a una persona; registrar a alguien nuevo -->

1. Toca **+ Nuevo trabajador**.
2. Escribe el **RUT** y el **Nombre**. Si ya hay alguien con un nombre muy parecido, TeRRa lo muestra en **Posibles duplicados**: revisa que no sea la misma persona. Si de verdad es otra, marca la casilla para confirmarlo.
3. Elige su **Líder de grupo**. **+ Crear nuevo líder...** es solo para un grupo que todavía no existe.
4. Completa cómo cobra (ver la sección siguiente) y toca **Guardar**.

![Un trabajador nuevo con un posible duplicado](help/trabajadores/02-nuevo.webp)

También se puede agregar a alguien desde la grilla, al sumarlo a una labor: ver [Agregar a una persona a la labor](/ayuda/grilla-del-ciclo#agregar-a-una-persona-a-la-labor).

## Cómo cobra: banco o efectivo
<!-- preguntas: cambiar la cuenta de un trabajador; cuenta rut; pagar en efectivo; cambiar el banco; datos bancarios -->

En la ficha, **Forma de pago** dice cómo le llega la plata:

![La forma de pago en la ficha](help/trabajadores/03-forma-de-pago.webp)

- **🏦 Banco**: el **RUT de pago**, el **Tipo de cuenta**, el **Número de cuenta** y el **Banco**. Con Cuenta RUT, TeRRa pone el Banco Estado y el número (el RUT sin el dígito verificador).
- **🆔 Asignar Cuenta RUT** deja la Cuenta RUT del propio trabajador en un toque.
- **💵 Efectivo**: no va en el archivo del banco; la nómina lo junta en el efectivo. Si después vuelve a **🏦 Banco**, recupera la cuenta que tenía.
- Para cambiarlo en una sola nómina, sin tocar la ficha, se usa su vista previa: ver [Revisar la vista previa](/ayuda/nomina#revisar-la-vista-previa).

## Cobrar en la cuenta de otra persona
<!-- preguntas: el trabajador cobra en la cuenta de otro; cuenta de un familiar; titular de la cuenta; falta el titular; pagar a otra persona -->

Si el **RUT de pago** no es el del trabajador, la ficha pide el **Nombre del titular** (o **Nombre de quien cobra**, en efectivo). Va en el archivo del banco, así queda claro a quién se le pagó.

- En la lista, la columna **Titular** muestra ese nombre; en el teléfono, **Cuenta de**.
- Si falta, la lista dice **⚠ Falta el titular**, y el filtro **⚠ Sin titular** junta a todos a los que les falta. Escribe el nombre en la ficha y toca **Guardar**.

## Datos personales
<!-- preguntas: dirección del trabajador; afp del trabajador; fecha de nacimiento; nacionalidad; estado civil; previsión de salud -->

**Datos personales**, en la ficha, guarda la dirección, la comuna, la nacionalidad, el estado civil, la fecha de nacimiento, la AFP y la salud: lo que piden los contratos y las boletas de honorarios. Viene plegado y dice cuántos de los 7 están completos; tócalo para abrirlo.

![Los datos personales de la ficha](help/trabajadores/04-datos-personales.webp)

## Ver lo que trabajó una persona
<!-- preguntas: cuánto ha ganado un trabajador; días trabajados de una persona; resumen del trabajador; detalle de jornadas de un trabajador -->

**📊**, en la fila de la persona, muestra lo que trabajó en los ciclos abiertos, día por día y con el total.

![El resumen de un trabajador](help/trabajadores/05-resumen.webp)

- **📂 Por ciclo** separa cada ciclo; **📜 Cronológico** junta todos los días en orden.
- **📂 Incluir ciclos cerrados** suma también los cerrados, dentro de las fechas que elijas.
- **📋 Copiar imagen**, **📥 Descargar PNG** e **🖨 Imprimir** lo comparten tal como se ve.
- **📊 Resúmenes por grupo**, arriba de la lista, arma lo mismo para varias personas a la vez.

## Corregir el RUT o eliminar a alguien
<!-- preguntas: corregir el rut; cambiar rut provisorio; cédula extranjera; eliminar un trabajador; borrar un trabajador duplicado -->

- El **RUT** se corrige en la ficha, por ejemplo de una cédula provisoria al RUT definitivo. Lo ya registrado con el RUT anterior sigue siendo de la misma persona.
- **✕** elimina a una persona solo si no tiene días registrados. Una ficha duplicada con días se une a la otra con **🔀** (ver "Unir una ficha duplicada").
- Los **IDs QR** se ven en la ficha, pero se asignan en **Pesajes QR**.

## Unir una ficha duplicada
<!-- preguntas: trabajador duplicado; dos fichas de la misma persona; unir fichas; pasar las jornadas a otra ficha; rut provisorio de otra empresa; juntar dos trabajadores -->

Si una persona quedó con dos fichas, por ejemplo porque la importación de cosecha la creó con el RUT provisorio que le dio otra empresa, une la duplicada a la que se queda:

1. En la fila de la ficha duplicada, toca **🔀**.
2. Busca la ficha que se queda y toca **Unir con esta**.
3. Revisa lo que pasa. Si las dos tienen jornada el mismo día, en la misma labor y el mismo tipo, elige cuál queda; en cosecha también se pueden sumar.
4. Escribe **unir** y toca **Unir fichas**.

![Unir una ficha duplicada](help/trabajadores/07-unir-fichas.webp)

- Las jornadas sin nómina pasan a la ficha que se queda. Las que ya están en una nómina no se tocan.
- La ficha duplicada deja de aparecer en Trabajadores y en los buscadores. Sus pagos anteriores se ven en el historial de Nómina de la que se queda, y sus pesajes, en Cosecha QR con los de ella.
- Su RUT queda apuntando a la que se queda: la próxima importación calza con ella, y no se puede crear otra ficha con ese RUT.
- No se puede unir una ficha con QR, con anticipos o bonos con saldo, con contratos, o con jornadas sin nómina en un ciclo cerrado: el aviso dice qué resolver antes.

## En el teléfono
<!-- preguntas: trabajadores en el celular; buscar un trabajador desde el teléfono -->

En el teléfono la lista pasa a tarjetas, con los mismos datos y botones. Toca el RUT (📋) para copiarlo.

![La lista en el teléfono](help/trabajadores/06-telefono.webp)

## Si algo no funciona
<!-- preguntas: no aparece el trabajador; no me deja guardar la ficha; ya existe un trabajador con ese rut; no puedo eliminar un trabajador -->

- **La lista está vacía**: escribe al menos 2 letras o números, o elige un filtro.
- **"Ya existe un trabajador con ese RUT"**: búscalo por el RUT; puede estar con otro nombre.
- **"El RUT de pago es de otra persona"**: falta el **Nombre del titular**.
- **No se puede eliminar**: la persona tiene días registrados.
- **Alguien inscrito con el escáner no aparece**: aparece solo en menos de un minuto, o al tiro con **Recargar datos** en Nómina.
