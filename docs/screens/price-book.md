# Libro de Precios / PriceBook

- Pantalla: `src/screens/PriceBook.jsx`. Ruta `/price-book`. Colecciones `priceBookEntries` + `priceBookConfig/main`.
- Sus piezas, en `src/screens/priceBook/`: `EntryFormModal` (alta y edición de una entrada), `HiddenFaenasModal` (⚙ Faenas visibles), `writePriceBookXlsx.js` (el Excel) y `helpers.js` (fechas y el id de la lista de unidades).
- **Registro contable independiente**: no alimenta ni lee `cycles`/`workdays`/`faenas` para calcular nada. Es el histórico de "qué se pagó y qué se cobró por tal labor en tal faena, en tal período".
- Una entrada puede colgar de una **faena real** (`faenaId`) o de una **faena dummy** (`faenaId: null` + `faenaLabel` como texto libre), para faenas que no existen en la app.
- Cada entrada lleva N líneas de precio: `unit` (texto libre), `payPrice` (pago) vs `chargePrice` (cobro), y para unidades de jornada opcionalmente el par de hora extra. Las unidades nuevas se acumulan solas en el catálogo compartido `priceBookConfig/main.units`.
- `priceBookConfig/main.hiddenFaenaIds` esconde del selector faenas reales cuyo nombre no es legible.
