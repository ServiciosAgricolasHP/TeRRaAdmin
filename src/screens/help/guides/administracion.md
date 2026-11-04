# Administración

Lo que hace un administrador: las cuentas de quienes usan TeRRa, la auditoría de los cambios, la consola y los ajustes que solo un admin ve en otras pantallas. Las pantallas de admin están en el grupo **🛡️ Admin**, al final del menú.
<!-- preguntas: administrador; qué hace un admin; menú admin; pantallas de admin -->

## Dar acceso a una persona
<!-- preguntas: crear una cuenta; dar acceso a alguien; nuevo usuario; agregar un usuario; invitar a alguien a terra -->

En **👥 Usuarios**:

1. Toca **+ Nueva cuenta**.
2. Escribe su correo, elige el rol y, si quieres, un alias, el nombre que se ve en la app.
3. Deja marcado el envío del correo para que elija su contraseña, y toca **Crear cuenta**.

![Las cuentas](help/administracion/01-usuarios.webp)

Si el correo ya tenía una cuenta (de otra app de la empresa), TeRRa lo avisa y pide confirmar antes de darle acceso: quien conozca esa contraseña va a poder entrar.

Sin perfil en Usuarios, una cuenta no entra: ve una pantalla que muestra su correo, para que se lo mande a un admin.

## Hacer admin o suspender a alguien
<!-- preguntas: hacer admin a alguien; quitar admin; suspender a un usuario; bloquear a un usuario; mandar el correo de contraseña a un usuario; cumpleaños de un usuario -->

En la tarjeta de cada cuenta:

- **Hacer admin** o **Quitar admin**. Un admin ve las pantallas de este grupo y los ajustes de las otras; los datos los ven todos igual.
- **Suspender** le corta la entrada, y **Reactivar** se la devuelve. Un admin no se suspende: primero se le quita el rol.
- **Contraseña** le manda el correo para elegir una nueva.
- **Cumpleaños** y **Saludos** personalizan la pantalla de carga y algunos mensajes de esa persona.

Nadie cambia su propio rol ni suspende su propia cuenta, así siempre queda al menos un admin. Cada tarjeta muestra cuándo se vio a la persona por última vez y su último cambio.

## Ver quién cambió algo
<!-- preguntas: quién cambió esto; auditoría; historial de cambios; quién borró; qué hizo un usuario; historial de un trabajador -->

**🛡️ Auditoría** guarda cada cambio: quién, cuándo y qué cambió.

- **🕒 Sesiones**: elige las fechas y toca **▶ Cargar**. Los cambios salen agrupados por persona, en sesiones de trabajo. **Gap sesión (min)** decide cuántos minutos sin cambios cortan una sesión.
- **🔍 Buscar por registro**: elige el **Tipo de registro** (un trabajador, un ciclo, un transportista…), toca **▶ Cargar** y elige uno. Sale todo su historial, de cualquier fecha; un trabajador trae también sus jornadas, y un transportista sus vueltas y resúmenes.

![Las sesiones de la auditoría](help/administracion/02-auditoria.webp)

Una edición guarda solo lo que cambió, con el antes y el después. Si una fila muestra un id en vez de un nombre, **🔎 Buscar nombres** los trae.

## La consola
<!-- preguntas: consola admin; respaldo de la base; cuántas lecturas hace la app; registro de lecturas; probar el backend; respaldo -->

**📟 Consola** reúne las herramientas de mantenimiento. Cada tarjeta lee recién al abrirla:

- **🧪 Ping al backend** prueba que las funciones del servidor respondan: las que crean cuentas, mandan los avisos y publican el portal.
- **💾 Respaldos en JSON**: se genera uno solo cada domingo, y **💾 Generar respaldo ahora** hace otro. **⬇ Bajar** baja uno.
- **📈 Registro de lecturas** enciende el registro de cuánto lee cada pantalla, hasta una fecha, y **📊 Informe de lecturas** lo muestra por pantalla, persona y hora.
- Los conteos por colección y de jornadas, para ver el tamaño de la base.

![La consola](help/administracion/03-consola.webp)

## Publicar una nómina en el portal
<!-- preguntas: publicar la nómina en el portal; actualizar el portal de trabajadores; cambiar la nómina del portal -->

1. Abre la nómina en **Nómina** y toca **🌐 Publicar en portal**, en su encabezado.
2. Confirma: reemplaza a la que estaba publicada.

El historial marca con **🌐 Portal** la publicada, para todos. Si la corriges después, el botón dice **🌐 Actualizar en portal**: vuelve a publicarla para que el portal muestre lo corregido.

## Ajustes de admin en otras pantallas
<!-- preguntas: formato del archivo del banco; destinatarios de los avisos; correo de avisos de cheques; importar la planilla de cheques; proyección de ingresos; importar trabajadores -->

- **Nómina**, **⚙ Configuración**: el formato del archivo del banco.
- **Cheques y pagos**: **⚙ Avisos** elige a quién le llega el correo de avisos, con cuántos días de anticipación y desde qué cuenta; **📧 Enviar prueba** lo manda ya. **📥 Importar Excel** suma la planilla de control de cheques, sin repetir los que ya están.
- **Facturación**: la pestaña **📈 Proyección** estima los ingresos de 12 meses a partir de los del año anterior.
- **📥 Migrar CSV** importa trabajadores desde un archivo: actualiza el nombre y el correo de los que ya están y crea los nuevos con su cuenta. **🧹 Limpiar pagados** suelta las jornadas de un ciclo que quedaron marcadas como pagadas por una nómina que ya no existe.

## Si algo no funciona
<!-- preguntas: una persona no puede entrar; no llega el correo de contraseña; no se publica el portal; no llegan los avisos -->

- **Alguien no puede entrar**: revisa en Usuarios que tenga su cuenta y que no esté suspendida. Si dice "Sin correo todavía", nunca ha entrado.
- **No le llega el correo para la contraseña**: que revise la carpeta de spam, o mándalo de nuevo con **Contraseña**.
- **Crear una cuenta, publicar el portal o enviar la prueba de avisos no responde**: prueba el **🧪 Ping al backend** en la consola. Si falla, el problema es del servidor, no de la pantalla.
