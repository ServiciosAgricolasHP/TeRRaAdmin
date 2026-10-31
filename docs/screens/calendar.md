# Calendario / Calendar

- Pantalla: `src/screens/Calendar.jsx` (el mes, la caché y la carga). Ruta `/calendar`.
- Sus piezas, en `src/screens/calendar/`: `MonthGrid`, `Legend`, `DayDetailDrawer` (sus totales y agrupaciones salen de `utils/calendarDayDetail.js`), `DayExpandedModal` y `helpers.js` (fechas y formatos). Las lecturas están en `services/calendarService.js`.
- Vista mensual. Cada celda lista las subfaenas que trabajaron ese día como barras de color (color estable derivado de un hash del nombre + paleta).
- Dos interacciones:
  1. Click en una **barra** → `DayDetailDrawer` con detalle por labor + transportistas del día/subfaena. Métricas heterogéneas (kilos solo de cosecha, jornadas solo de los tipos que aportan jornada, trato/HE solo donde aplica). Las tarjetas con valor 0 se ocultan.
  2. Click en la **celda** (zona blanca) → `DayExpandedModal` con todas las subfaenas del día. Click en una subfaena dentro de este modal pasa a `DayDetailDrawer` con `from: "all"` para que al cerrar el drawer se vuelva al modal del día (cadena de modales).
- **Cache de sesión por mes**: `sessionStorage` con TTL 5 min, key `af.calendar.{year}.{month}`. Reduce reads al navegar atrás/adelante.
- **Estrategia de lecturas**: lee todos los workdays del rango del mes (~3k lecturas en un mes pico, ~US$0.02). `fetchWorkdaysInRange(start, end)` (`services/calendarService.js`) es el único punto que los lee: si el volumen pasa de ~5k workdays/mes o la carga de 2 s, ahí se puede combinar un snapshot agregado de los ciclos cerrados con los abiertos sin tocar el resto de la UI.
- **Workers**: además de workdays/trips, el Calendar pre-carga la lista completa de trabajadores con `listWorkers()`, la copia del navegador puesta al día (ver `docs/screens/workers.md`). Necesario para mostrar nombres (no solo RUT) en los breakdowns por trabajador del drawer.
- **DayDetailDrawer — fila expandible por labor**: cada fila de la tabla "Por labor" es clickeable (▸/▾). Al expandir se muestra:
  - Para **cosecha**: cards con `qualityLabel / containerLabel · kg · %` por combo (calidad×envase) — sale del catálogo, no `Q1/E2`.
  - **Trabajadores** que participaron: nombre + RUT + producción (kilos / tratoQty / jornadas / HE / piso) + monto, ordenados por monto desc. Estado expandido en memoria (no persistido).
- **Métricas tratoHE separadas**: en la tabla "Por labor" del drawer y en el breakdown de trabajadores, jornadas y HE se renderizan apilados (`{n} jorn.` arriba, `{h} HE` abajo) en lugar del string mezclado `"100 j + 17,5 HE"`. Misma convención que `LaborTable` y `LaborWorkerGrid`.
- **Sat/Dom en rojo**: el número del día en la grilla del mes y el título de la fecha en `DayDetailDrawer` / `DayExpandedModal` se muestran en `#dc2626` cuando es finde. El título usa formato humano `"vie 16-may-2026"` (helpers `humanDate`, `isWeekendDate` en `screens/calendar/helpers.js`). Feriados a nivel labor no se cubren acá — están en `dayPrices` y el calendar no los carga.
