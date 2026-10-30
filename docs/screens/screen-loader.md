# Pantalla de carga

- `components/ScreenLoader.jsx`: la animación del día (un gato) con el texto debajo, en el color del tema. Va al abrir la app (`ProtectedRoute`) y en la carga de una pantalla o de una pestaña. Un modal, un botón, una lista desplegable o una sección chica siguen con el texto solo.
- **La animación aparece pasados 300 ms**: una carga que sale de la caché termina antes y no deja un parpadeo. El texto se ve desde el inicio y la imagen se pide de inmediato. Con movimiento reducido en el sistema queda solo el texto.
- **Cuál toca lo decide `screenLoaderFor(fecha, cumpleaños)`** (`utils/screenLoaders.js`, con tests), en este orden:
  1. el cumpleaños de quien mira (`users/{uid}.birthday`), solo ese día; el 29 de febrero, el 28 en los años que no son bisiestos;
  2. una fecha especial de un solo día: Día de la Mujer (8 de marzo), el 6 de abril (el gato jefe), el 9 de septiembre (el gato camina hacia la izquierda) y Día de la Secretaria (3 de diciembre). Gana también a una festividad de varios días que caiga ese día;
  3. una festividad de varios días, todos sus días: San Valentín (8 al 14 de febrero), vuelta a clases (1 al 7 de marzo), Fiestas Patrias (10 al 20 de septiembre), Halloween (25 al 31 de octubre), Navidad (15 al 31 de diciembre) y Semana Santa (del Domingo de Ramos al de Pascua, calculada para cada año);
  4. si no hay nada que celebrar, el día de la semana:
     - **lunes y martes, la estación en Chile**: verano (21 de diciembre al 20 de marzo), otoño (21 de marzo al 20 de junio), invierno (21 de junio al 22 de septiembre) y primavera (23 de septiembre al 20 de diciembre). La lluvia es una versión del invierno: el martes de invierno sale la lluvia;
     - **miércoles a sábado, la rotación** (`ROTATION`): la general, la que empuja la caja, el trabajador, el de los papeles y el de la rueda. Sigue de una semana a la siguiente, así salen las cinco aunque sean cuatro días;
     - **domingo, la que duerme**.

  El día de la semana y los turnos salen de los días corridos (`dayNumber`), sin zona horaria.
- **Los procesos largos de Nómina** (`screens/payroll/ProgressOverlay.jsx`) muestran un gato en vez de un spinner: el de la rueda al generar y pagar (`BUSY_LOADER_FILE`), y el que persigue su cola al deshacer, o sea, al eliminar una nómina o revertir su pago o sus transferencias (`UNDO_LOADER_FILE`, con `undo: true` en el progreso).
- **Los archivos viven en `public/loaders/`** (WebP animado, de 30 a 730 KB) y se nombran en `SCREEN_LOADER_FILES`, `BUSY_LOADER_FILE` y `UNDO_LOADER_FILE`. Un test falla si sobra o falta uno. Para sumar una fecha: el archivo, su entrada en `SCREEN_LOADER_FILES` y su rango en `FESTIVITIES`.
- **Nadie descarga las de todas las fechas**: la app instalada guarda la general y las dos de los procesos largos al instalarse (`globPatterns` en `vite.config.js`), y cada una de las otras la primera vez que sale (`CacheFirst`, caché `screen-loaders`).
- **Al abrir la app el perfil todavía no llegó**: el cumpleaños de la última cuenta que la abrió en ese navegador queda en `localStorage` (`screenLoader.birthday`, `rememberBirthday` en `services/userPrefsService.js`), así la primera carga no cambia de animación cuando llega el perfil.
