# Cosecha QR

En la cosecha, cada trabajador lleva un QR, y la app de escaneo anota cada pesaje con su QR, su calidad, su envase y sus kilos. **📷 Cosecha QR** lleva esos pesajes al ciclo: dice a qué ciclo y labor van los de cada cosecha, los pasa a jornadas en la grilla y reparte los QR entre los trabajadores.
<!-- preguntas: cosecha qr; pesajes; qr de cosecha; app de escaneo; para qué sirve cosecha qr -->

## Apuntar un prefijo al ciclo
<!-- preguntas: nuevo prefijo; apuntar el qr al ciclo nuevo; cambiar el ciclo del prefijo; abrí un ciclo nuevo de cosecha; prefijo en rojo -->

Cada QR empieza con un prefijo (**SE-101** es del prefijo **SE**), y cada prefijo es una cosecha. En **🔄 Sincronizar cosechas**, cada prefijo dice a qué faena, ciclo y labor van sus pesajes.

1. Toca **+ Nuevo prefijo**, o **Editar** en uno que ya existe.
2. Escribe el prefijo y un nombre, y elige la **Faena**, el **Ciclo vigente** y la **Labor de cosecha vigente**.
3. Deja marcado **Activo**, para que la app de escaneo lo ofrezca, y toca **Guardar**.

![Un prefijo apuntado al ciclo de la cosecha](help/cosecha-qr/01-prefijo.webp)

**Cada vez que se abre un ciclo nuevo de esa cosecha, hay que volver a apuntar el prefijo:** TeRRa no adivina a qué ciclo van los pesajes. Un prefijo con 🔴 está mal apuntado (el ciclo se cerró, ya no existe o la labor no es de cosecha) y no deja sincronizar.

## Pasar los pesajes a la grilla
<!-- preguntas: sincronizar pesajes; pasar la cosecha a la grilla; sincronizar cosechas; los kilos no aparecen en la grilla -->

1. En la fila del prefijo, toca **🔄 Sincronizar**.
2. Revisa las fechas, que parten desde la última sincronización, y toca **Sincronizar**.

![El resultado de sincronizar](help/cosecha-qr/02-sincronizar.webp)

TeRRa suma los pesajes de cada persona por día, calidad y envase, y escribe sus jornadas en la labor con los precios del día. Si en el ciclo falta el día o la persona, los agrega. Se puede repetir las veces que haga falta: cada vez calcula desde cero.

El resultado avisa lo que no pudo hacer: un RUT sin ficha en Trabajadores, las jornadas que ya estaban en una nómina (esas no se tocan) y los días sin precio para esa calidad y envase (quedan en $0).

**En la grilla**, la labor que recibe pesajes lleva el chip **📱 SE**, y sus celdas de producción no se escriben a mano, porque la sincronización las pisaría. El piso sí se edita.

## Ver los pesajes
<!-- preguntas: ver los pesajes de un trabajador; cuántos kilos cosechó; buscar un qr; pesajes del día -->

**⚖️ Pesajes** muestra los pesajes de un rango de fechas **Por trabajador**, **Por día** o en **Detalle**, con los totales por calidad y envase. Se filtra por prefijo y se busca por RUT, nombre o QR. Los pesajes quedan guardados en el navegador un rato: **🔄 Refrescar** los vuelve a leer.

![Los pesajes por trabajador](help/cosecha-qr/03-pesajes.webp)

## Corregir o agregar un pesaje
<!-- preguntas: agregar un pesaje a mano; corregir un pesaje; se escaneó mal; pesaje que no se alcanzó a escanear -->

En **⚖️ Pesajes**:

- **+ Nuevo pesaje** los carga a mano: el trabajador, la fecha y el prefijo van una vez, y cada envase es una fila (**+ Otro pesaje** suma otra).
- **Editar** corrige uno.

Al guardar, TeRRa recalcula la jornada del ciclo de ese día; no hace falta volver a sincronizar.

## Asignar un QR a un trabajador
<!-- preguntas: asignar un qr; darle un qr a un trabajador; perdió su qr; cambiar el qr de un trabajador; quitar un qr; liberar los qr de la temporada -->

En **📱 Gestión QRs**:

1. Toca **+ Asignar QR**.
2. Escribe el **Código** (como SE-105) y el RUT de la persona, y toca **Asignar**.

![Asignar un QR](help/cosecha-qr/04-asignar.webp)

Cada persona tiene un QR por cosecha: si ya tenía uno de ese prefijo, se le quita y queda libre. Si el código era de otra persona, TeRRa avisa antes de quitárselo. En la lista, **Reasignar** y **Quitar** cambian o sueltan un código. Los pesajes anteriores siguen siendo de la misma persona.

Al terminar la temporada, **Limpiar todos** libera los QR para volver a usarlos.

## Si algo no funciona
<!-- preguntas: no puedo sincronizar; no aparecen los pesajes de alguien; la jornada quedó en cero; no puedo escribir en la cosecha; la app no reconoce el qr -->

- **🔄 Sincronizar está apagado**: el prefijo está en 🔴. Edítalo y apúntalo al ciclo abierto y a su labor de cosecha.
- **No aparecen los pesajes de alguien en la grilla**: su RUT no tiene ficha en Trabajadores. Créala y vuelve a sincronizar.
- **Una jornada quedó en $0**: ese día no tiene precio para esa calidad y envase. Ponle el precio en la grilla y vuelve a sincronizar.
- **No deja escribir en las celdas de la cosecha**: la labor recibe pesajes por QR. Corrige el pesaje en **⚖️ Pesajes**.
- **Cambió un pesaje que ya se pagó**: la sincronización no toca jornadas de una nómina. La diferencia se corrige en la nómina (ver [Corregir una nómina](/ayuda/corregir-nomina)).
- **La app de escaneo no reconoce un QR sin señal**: **Reconstruir padrones**, en **📱 Gestión QRs**, rehace la lista que lee la app.
