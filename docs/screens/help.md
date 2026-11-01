# Ayuda / Help

- Pantalla: `src/screens/Help.jsx`. Rutas `/ayuda` (el índice) y `/ayuda/:guideId` (una guía), para toda cuenta con acceso. Se carga en su propio chunk (`React.lazy` en `App.jsx`), con `marked` y `minisearch`: nada de eso se baja hasta abrir la ayuda.
- Se llega por **❓ Ayuda**, al final del menú, o por el botón **?** de la barra de arriba, que abre la guía de la pantalla en que se está (`HELP_GUIDE_BY_PATH` en `components/layout/helpLinks.js`) o el índice si no tiene guía. El botón le pasa a la ayuda la ruta de donde se vino (`state.from`).
- Sus piezas, en `src/screens/help/`: `HelpSearch` (el buscador), `GuideView` (una guía), `HelpIndex` (las tarjetas de las guías), `useMissingHelpReport` ("Avisar que falta"), `renderGuide.js` (Markdown → HTML con `marked`), `guides.js` (el registro de las guías), `guides/*.md` (el texto) e `imageSizes.json` (ancho y alto de cada captura, lo escribe el generador). El cálculo, en `utils/helpGuides.js` (leer una guía por secciones) y `utils/helpSearch.js` (la búsqueda), con tests; `screens/help/guides.test.js` revisa el contenido.
- Costo: **0 lecturas**. Las guías son texto del bundle y se indexan en el navegador. Lo único que escribe es "Avisar que falta" (colección `helpQuestions`, ver `docs/data-model.md`).

## Cómo se escribe una guía

- Un `.md` en `src/screens/help/guides/`, registrado en `guides.js` con su `id` (el de la URL), su ícono y, si es solo para admins, `adminOnly: true`.
- `# Título`, una introducción corta y una sección `## ` por tarea. **La búsqueda sugiere secciones**, así que cada `##` es una tarea con título propio ("Agregar a una persona a la labor"), y el enlace a una sección es `/ayuda/<guía>#<sección>` (el slug del título).
- Debajo de cada título, las preguntas con que alguien buscaría esa sección, escondidas: `<!-- preguntas: cómo agrego a alguien; falta una persona en la grilla -->`. Pesan más que el texto al ordenar los resultados y son lo que hace que una pregunta encuentre su sección aunque use otras palabras. `guides.test.js` exige al menos una por sección.
- Las palabras son las de la pantalla (la columna "En pantalla" del Glosario de AGENTS.md), tratando de "tú", sin voseo. Pasos numerados, con una captura donde ayuda; al final de la guía, lo que hay que saber si algo no funciona.
- Una imagen se escribe `![Texto](help/<guía>/<nombre>.webp)`: `renderGuide.js` le pone la ruta base, su ancho y alto, `loading="lazy"` y `decoding="async"`.
- Un enlace a otra guía (`/ayuda/<guía>#<sección>`) navega dentro de la app.
- Las preguntas típicas de una guía van en `guides.test.js`, con la sección que tienen que encontrar primero.

## La búsqueda

- `termKeys` (`utils/helpSearch.js`) lleva cada palabra, de las guías y de la pregunta, a sus formas de búsqueda: sin mayúsculas ni tildes, sin palabras vacías (cómo, a, una, de…), con dos raíces (la corta saca la terminación verbal o de plural, la larga solo la vocal o la s final: agrego, agregar, agregué y agregado calzan, y también olvidó con olvidé) y con los sinónimos del negocio llevados a una sola forma (`SYNONYM_GROUPS`: persona = trabajador = alguien; agregar = sumar = añadir; sacar = quitar = borrar; vuelta = viaje = flete…). Un grupo nuevo entra cuando una pregunta real no encuentra su sección por usar otra palabra.
- MiniSearch indexa título, preguntas, texto y título de la guía, con más peso en las preguntas (4) y el título (3). Tolera un error de tipeo en palabras de 4 letras o más (dos desde 7) y busca por prefijo, así sugiere mientras se escribe.
- Se muestran hasta 5 secciones; lo que queda por debajo del 30% del puntaje de la primera no sale. Las de una guía `adminOnly` solo salen para un admin.
- Cada sugerencia muestra su guía, su título y la frase de la sección con más palabras de la pregunta, con esas palabras marcadas (`snippetOf`, dibujado sin HTML). Al tocarla se abre la guía en esa sección (`#sección`), que se marca unos segundos.
- **Avisar que falta**: con una pregunta de 3 letras o más se ofrece siempre, haya o no resultados. Guarda la pregunta, la guía abierta y la pantalla de donde se vino, una vez por pregunta.

## Las capturas

- Se generan, no se sacan a mano: **`npm run help:shots`** (con `HELP_GUIDES=<id>,<id>` solo esas guías). Levanta los emuladores de Firestore y Authentication (`emulators:exec`), arranca Vite contra ellos con un proyecto `demo-`, siembra los datos de demo y corre el guion de cada guía con Playwright sobre el Edge o el Chrome instalados (`HELP_BROWSER` para otra ruta). Necesita JDK 21 (por los emuladores) y las dependencias de `functions/` (la semilla usa `firebase-admin`).
- `scripts/help/seed.mjs`: una faena, un ciclo de cinco días y siete personas, todo inventado (el repo es público). Solo escribe en los emuladores.
- `scripts/help/guides/<guía>.mjs`: hace el flujo por la interfaz con clics reales y saca una captura por paso. Si un paso ya no existe en la pantalla, el guion falla y avisa que la guía quedó vieja; la pantalla al fallar queda en la carpeta temporal del sistema.
- `scripts/help/lib.mjs`: fecha fija (`page.clock`, 9 de octubre de 2026), tema claro, la versión del encabezado sin número, el mouse fuera de la zona, un borde (y un número, si son varios) sobre lo que hay que tocar, y el recorte del elemento o de varios a la vez. Guarda WebP (con `sharp`) en `public/help/<guía>/` y anota el ancho y alto en `imageSizes.json`. Regenerar una guía borra antes su carpeta.
- Las capturas **no se precargan**: `globIgnores: ['help/**']` en la PWA (`vite.config.js`). Cada una se baja al abrir su guía, y después queda en la caché del navegador.
