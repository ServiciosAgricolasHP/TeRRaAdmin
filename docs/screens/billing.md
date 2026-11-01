# Facturación / Billing

- Pantalla: `src/screens/Billing.jsx` (el componente de la ruta: la empresa, las pestañas, los filtros y el listado). Ruta `/facturacion`. Nav label: "Facturación" (icono 🧾). Acceso para todas las cuentas.
- Sus piezas, en `src/screens/billing/`:
  - **Carga y escrituras:** `useBillingData` (empresas, documentos, centros de costo y gastos informales, y la empresa elegida) y `useDocUpdates` (estado de pago, notas, centro de costo y pagos de un documento).
  - **Listado:** `DocTableRow` (una fila en el escritorio), `DocCard` (en el teléfono), `DocListToolbar` (exportaciones del listado, agrupar por centro de costo), `SummaryCard`, `SortHeader`, `OtherTaxChip`, `PaymentStatusSelect`, `CostCenterSelect`, `PrintableDocList` y `writeDocListXlsx.js`.
  - **Documento:** `DocDetailModal` y `PaymentsSection` (sus pagos).
  - **Importar:** `useRcvImport` (leer los archivos, la vista previa y confirmar), `CompanySelectAndPickModal`, `ImportPreviewModal` y `FileRow`.
  - **Empresas:** `CompaniesModal`.
  - **Centros de costo:** `CostCentersModal`, con `useCostCenterCatalog` (crear, editar y eliminar centros) y `CostCenterForm`; `PrintableCostCenterDocs`, `writeCostCenterDocsXlsx.js` e `InformalExpenseFormModal`. El cálculo de la vista de un centro (sus documentos y gastos informales, filtros, totales y orden) vive en `utils/costCenterDocs.js`, con tests.
  - **Retenciones:** `WithholdingsTab` (la pestaña con sus exportaciones, del total y por contraparte), `WithholdingsView`, `PrintableWithholdings`, `PrintableWithholdingsGroup`, `writeWithholdingsXlsx.js` y `writeWithholdingGroupXlsx.js`.
  - **Pendientes:** `ReceivablesModal`, `PrintableReceivables` y `writeReceivablesXlsx.js`.
  - **Resumen anual:** `AnnualSummaryTab`, `PrintableAnnualSummary` y `writeAnnualSummaryXlsx.js`.
  - **Proyección:** `ProjectionTab` y `writeProjectionXlsx.js`.
  - **Comunes:** `docs.js` (período, estados de pago y agrupado por centro de costo) y `printStyles.js` (celdas de las tablas imprimibles).
- **El cálculo vive en `utils/billingDocs.js`**, con tests: los filtros y el orden del listado, los totales con signo, las retenciones por contraparte, lo pendiente de cobro (`pendingFor`, `RECEIVABLE_CATEGORIES`), las NC que pueden anular una factura y el resumen anual.
- El año del Resumen y el mes de inicio y el porcentaje de la Proyección los guarda la pantalla, así se conservan al cambiar de pestaña.
- Servicios: `companiesService` (colección `companies`) + `dteDocumentsService` (colección `dteDocuments`) en `services/index.js`. TTL del list = **10 min** (`ttl: 600_000`) — las mutaciones locales (status, notas, pagos, import) actualizan el state en memoria, así que el TTL solo afecta al re-entrar a la pantalla.
- **Multi-empresa**: el sistema soporta N empresas (probado con 3). Cada empresa tiene `{ rut, razonSocial, alias, enabled }`. CRUD inline desde el modal **🏢 Empresas**. Los DTE quedan namespaceados por `companyId` así no se colisionan folios entre empresas (mismo proveedor puede facturar a varias empresas con el mismo folio).
- **Empresa elegida persiste en localStorage** (`facturacion.selectedCompanyId`). Si la empresa guardada fue borrada, cae a la primera.
- **Solo lectura e import.** La emisión se hace en el portal del SII; la app no se integra con ningún emisor. Cada documento lleva `source: "sii_import"`.
- **Flujo de import**: el usuario exporta CSV del **Registro de Compras y Ventas (RCV)** desde el portal SII. En la app: 📥 Importar → elegir empresa + **uno o varios archivos** (Ctrl/Cmd+click) → preview multi-file con stats, warnings de RUT mismatch, exclusiones togglables → Confirmar → escribe a Firestore.

## Parser CSV (`src/utils/siiCsvParser.js`)

Exporta: `parseSiiRcvCsv(buffer, { companyRut })`, `dteTypeLabel(tipo)`, `normalizeRut(raw)`, `rutNumeric(raw)`, `extractRutFromFilename(name)`, `buildDteDocId({ companyId, kind, tipo, folio, rutEmisor, rutReceptor })`.

- Auto-detecta **kind** (ventas vs compras) por headers (`Rut cliente` vs `Rut Proveedor`).
- **IVA**: suma `Monto IVA Recuperable` + `Monto IVA No Recuperable`. El fallback
  `"monto iva"` es para los exports con una sola columna. Como `colIdx` matchea
  por *contiene*, el fallback se descarta si cae en la misma columna que la No
  Recuperable; si no, el IVA se sumaría dos veces.
- Encoding **UTF-8 con BOM o ISO-8859-1** — intenta UTF-8, fallback a latin-1 si detecta U+FFFD.
- Fechas en YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY → normalizadas a ISO.
- Montos con miles `.` y decimal `,` o sin separadores.
- RUTs con/sin guión y puntos, normalizados a `12345678-9`.
- `extractRutFromFilename` saca el RUT del nombre del archivo (el SII suele incluirlo en exports del RCV) para detectar mismatch con la empresa elegida → warning en el preview.

## Doc shape + replace por período

```
{
  id,                     // companyId_V_tipo_folio  (ventas)
                          // companyId_C_rutProvNumeric_tipo_folio  (compras)
  kind: "venta"|"compra",
  tipo: 33|34|39|56|61|112|...,
  tipoLabel, folio,
  rutEmisor, razonSocialEmisor,
  rutReceptor, razonSocialReceptor,
  fechaEmision, periodo: "YYYY-MM",
  exento, neto, iva, otrosImpuestos, total,
  companyId, companyAlias,
  source: "sii_import", sourceFile,
  importedAt, importedBy,
  paymentStatus: "unpaid"|"paid"|"net_only"|"factored"|"cancelled",
  paymentStatusSetAt, paymentStatusSetBy,
  notes,                  // glosa interna editable
  payments: [{ id, date, amount, kind, notes, recordedAt }],
  amountPaid,             // denormalizado: sum(payments.amount)
}
```

- **Doc id determinístico por `companyId`**: reimportar el mismo período es **idempotente** (setDoc + merge sobreescribe sin duplicar). El preview cuenta cuántos sobreescriben antes de confirmar.
- **Replace por período**: confirmar el import agrupa por `(companyId, kind, periodo)` y para cada scope (a) lee los existentes, (b) calcula **huérfanos** (existían antes, no vienen en el nuevo CSV) y los **elimina**, (c) escribe los nuevos/actualizados. Preserva `paymentStatus` existente al reimportar — solo setea `"unpaid"` para docs nuevos. Bulk write: `writeBatch(db)` con chunks de 450 (límite Firestore 500).
  - **La persistencia vive en `services/dteImportService.js` (`importDteRecords`), no en la pantalla**, así se prueba sin React. `tests/e2e/facturacion-import.test.js` fija las tres propiedades que importan: reimportar es idempotente, el estado de pago y las notas cargadas a mano sobreviven, y el borrado de huérfanos **no** cruza de período, de `kind` ni de empresa. El borrado no pide confirmación: el test fija ese comportamiento, no lo aprueba.

## UI

- Tabs **📤 Facturas** (kind=venta), **📥 Compras**, **📑 Retenciones**, **📊 Resumen** (resumen anual + balance de IVA).
- **Vista default = mes actual** (`periodFilter`); el selector de período cambia de mes. Buscar por texto ignora el período y muestra todos los de la empresa.
- Filtros: período, tipo de DTE, **estado de pago** (chips: Todos / No pagado / Pagado / Solo neto / Solo IVA / Anulada), búsqueda libre con `<datalist>` autocomplete de contrapartes únicas.
- Cards de totales: Documentos, Neto, IVA, Total. **NCs (tipos 61/112) restan con signo** en los totales y se cuentan aparte en una card específica. Para vista normal: cards adicionales de No pagado del período / Solo neto / Cedidas. Para Retenciones: Facturas con retención / IVA retenido / Total facturado.
- **Tabla principal sortable**: click en cualquier header (Fecha, Tipo, Folio, Cliente/Proveedor, RUT, Neto, IVA, Total, Abonos, Estado) alterna asc/desc con flecha ▲/▼. Default `fechaEmision desc`. Sort sobre "estado" empuja NCs al final (clave virtual `zz_anulada`).
- **Columna Estado solo para Facturas (ventas)**: en Compras se oculta (header, celda, chips de filtro de pago y export) porque ahí no hay control de pago real. El control de cobros vive en ventas.
- **Tipo sin código numérico en pantalla**: la columna Tipo muestra solo el label (Factura / Nota de Crédito / etc.), no el número de tipo DTE. Las NCs van con chip rojo.
- **Columna Abonos**: muestra el monto pagado + sub-text "Saldo $X" (warning) o "✓ N abonos" (success) cuando está totalmente pagada. NCs: "—".

## Estados de pago (`PAYMENT_STATUSES`)

5 estados manuales para facturas/boletas afectas, expuestos como `<select>` por fila. Las NCs (61/112) **no usan estos estados** — chip fijo "Anulada" rojo.

| Estado | Significado |
|---|---|
| `unpaid` | Pendiente de cobro/pago (default al importar) |
| `paid` | Completo |
| `net_only` | Cliente solo pagó NETO — retuvo IVA (típico de servicios). Aparece en tab Retenciones |
| `factored` | Factura cedida vía factoring (queda "solo IVA" en libros) |
| `cancelled` | Anulada por NC |

El select nativo lleva colores explícitos `var(--color-surface)` / `var(--color-text)` en sus `<option>` porque el dropdown nativo hereda el fondo del chip y en dark mode los soft colors hacen ilegibles los items.

## Autodetección de NC anulada (sugerencia)

- Helper `findCancellingNcs(dteDoc, allDocs)` (`utils/billingDocs.js`): matchea NCs con misma `companyId + kind + RUT contraparte + total exacto`, con NC fecha ≥ factura. `cancellingNcsByDoc` precalcula el mapa.
- **No auto-cambia** el estado — solo sugiere. En la fila aparece un badge **⚠ NC?** al lado del select; click abre el `DocDetailModal` con un banner rojo listando las NCs candidatas + botón **"Marcar como Anulada"** que en un click setea `cancelled` y agrega `[Anulada por NC tipo-folio (fecha, monto)]` a las notas como auditoría.

## Pagos / abonos (`payments[]`)

- Sección dentro del `DocDetailModal` (oculta para NCs). Lista pagos con fecha/tipo/monto/notas + botón × por fila.
- Tipos (`PAYMENT_KINDS`): `abono` / `neto` / `iva` / `total` — categorización para auditoría.
- Indicador **Pagado** / **Saldo** con color (verde si cerrada, warning si queda saldo).
- Form inline para agregar: fecha (default hoy), tipo, monto, notas. Al cambiar tipo, el monto se autocompleta: `total` = saldo pendiente, `neto` = factura.neto, `iva` = factura.iva, `abono` = vacío.
- **Validación estricta**: `amountPaid + nuevo ≤ total` — si excede, alerta con desglose y bloquea. Monto > 0, fecha obligatoria. El botón "+ Registrar pago" se deshabilita cuando saldo ≤ 0.
- Persistencia: `saveDocPayments(dteDoc, payments)` escribe `payments` + `amountPaid` denormalizado.
- `paymentStatus` es independiente de los pagos — es la etiqueta de alto nivel; los pagos son el detalle/auditoría temporal.

## Retenciones (tab + exports)

Tab **📑 Retenciones** muestra todas las facturas con `paymentStatus === "net_only"` agrupadas por contraparte (sin restricción de kind). `withholdingsByCounterpartyOf` agrupa por RUT, suma neto/iva/total, ordena por IVA desc. Lista expandible (▸/▾) en `WithholdingsView`.

**Exports** (4 botones en toolbar global, mismo set por contraparte individual):
- 📋 Copiar (toBlob al clipboard como PNG)
- 📥 PNG (toPng + download)
- 🖨 Imprimir (ventana print landscape con color-adjust: exact)
- 📊 XLSX (ExcelJS lazy, layout convención col A vacía width 6 + fila 1 vacía)

**`PrintableWithholdings`** (general): banner amarillo destacado con **IVA Retenido total del período** (font 22, weight 800), tabla resumen por contraparte, y sección **Detalle de facturas** agrupada por contraparte con subtotales por grupo + total general. Sin columna `Tipo` (solo `Documento` con el label) — el número de tipo es ruido visual.

**`PrintableWithholdingsGroup`** (individual): un printable por contraparte renderizado off-screen, mismo estilo pero limitado a una sola contraparte. Cada grupo en la vista tiene su propia toolbar de 4 botones (📋📥🖨📊) con `stopPropagation` para que no expanda el grupo. Filename: `Retencion_{empresa}_{contraparte}_{periodo}`.

**XLSX por grupo**: una hoja con banner explícito de IVA retenido (fila 4 destacada amarilla con monto grande) + tabla de facturas + total con fórmulas SUM. Las celdas IVA llevan `bold: true`.

## Ver pendientes (modal global)

Botón **⏳ Ver pendientes**, con badge contador. Abre `ReceivablesModal` con las **ventas** (kind=`venta` — no compras, son flujo distinto) de la empresa seleccionada **(cualquier período)** que tengan saldo pendiente, categorizadas:

| Categoría | Criterio |
|---|---|
| `full` (Factura completa) | status `unpaid` sin abonos → debe el total |
| `partial` (Abono parcial) | status `unpaid` con abonos → debe `total - amountPaid` |
| `iva` (IVA pendiente) | status `net_only` → debe `iva - max(0, paid - neto)` |

Skip: NCs, `paid`, `cancelled`, **`factored`** (Solo IVA / cedida — se considera pagada porque el factor ya pagó el neto al emisor; el IVA es una obligación tributaria separada que se gestiona en el F29, no acá). Helper: `pendingFor(d)` devuelve `{ category, amount }` o null.

UI: summary cards por categoría + tabla agrupada con sub-headers de color (`#ffd6d6`/`#fff2cc`/`#dde9ff`), subtotales por grupo, total general destacado al final. Cada fila tiene ℹ para abrir el detalle. Misma toolbar de 4 exports.

**`PrintableReceivables`** off-screen replica el layout para captura. **XLSX** baja workbook con secciones por categoría, subtotales con fórmulas y total general en verde.

## Exports de Facturas / Compras + centro de costo

Las tabs Facturas y Compras tienen la misma toolbar de 4 exports (📋📥🖨📊) que Retenciones, capturando el listado **tal cual filtrado y ordenado** (`sortedFiltered`). Título de print/export: `{kindTitleLabel} — {empresa} — {Mes Año}` (ventas = "Ventas/Facturas", compras = "Compras"). `PrintableDocList` (forwardRef) renderiza off-screen. La columna Estado solo aparece en ventas (`showEstado={kindTab === "venta"}`).

- **Toggle 🗂 Centro de costo** (`groupByCostCenter`, persistido en `localStorage`): agrupa por contraparte. **Afecta tanto el export como el grid en pantalla.** Helper `groupDocsByCostCenter(docs, kind)`:
  - **Combustibles** (cualquier doc con `otroImpuestoCategory === "combustible"`) se juntan en un grupo virtual único **⛽ COMBUSTIBLES**, ordenado por fecha, que va **primero** (centro de costo agregado, no por proveedor).
  - El resto se agrupa por contraparte (rutEmisor en compras / rutReceptor en ventas), ordenado por total desc.
  - Cada grupo lleva header + filas de docs + **fila Subtotal** (Neto/IVA/Total). Total general al final. En XLSX agrupado los totales son **precomputados** (no fórmulas SUM) para no doble-contar las filas de subtotal.

## Detección de combustibles (Otros Impuestos del SII)

`siiCsvParser.js` lee el campo **`Codigo Otro Impuesto`** del RCV. Mapa `OTRO_IMP_CODES` + categorías `OTRO_IMP_CATEGORIES`; códigos **28 / 35 / 271 / 272 = combustible**. El doc queda con `otroImpuestoCodigo` (number) y `otroImpuestoCategory` (string). En la tabla se muestra un `OtherTaxChip` y alimenta el agrupado por centro de costo. Helpers: `otroImpuestoLabel(code)`, `otroImpuestoCategory(code)`.

## Resumen anual (tab + balance de IVA)

Tab **📊 Resumen**: vista que **cruza los 12 meses** de un año para la empresa seleccionada, con **selector de año propio** (`summaryYear`, default año actual; opciones derivadas de los períodos de la empresa). Ignora el filtro de mes; en esta tab se ocultan Ver pendientes, los sub-filtros y las cards operativas.

- `annualSummary` (`utils/billingDocs.js`): por mes acumula ventas/compras **con signo** (NCs restan) separando **IVA Débito** (ventas) de **IVA Crédito** (compras). El IVA de facturas "Solo neto" (`net_only`) **se suma normalmente** al débito/crédito que corresponde — no se trackea aparte.
- **Métricas explícitas (KPI cards)**: IVA Débito, IVA Crédito, **IVA a pagar (año) = débito − crédito** (highlight; si es negativo → "IVA a favor (remanente)" en verde), + Ventas netas / Compras netas / Documentos.
- **Tabla mensual** (Ene–Dic + TOTAL): Ventas Neto · IVA Débito · Compras Neto · IVA Crédito · **IVA a pagar del mes**. Meses sin actividad atenuados.
- Exports: misma toolbar 📋📥🖨📊. `PrintableAnnualSummary` (forwardRef) off-screen. XLSX respeta la convención col A vacía width 6 + fila 1 vacía, con el balance de IVA en el encabezado. Filename `Resumen_{empresa}_{año}`.

## Proyección de flujo de caja (tab, solo admin)

Tab **📈 Proyección**, visible solo con `isAdmin`: proyectar plata a futuro es una decisión, no operación del día. Estima una temporada escalando la anterior — **ingresos** de los 12 meses previos, **mes a mes**, por un porcentaje (75% por default).

- **La ventana son 12 meses desde el mes elegido**: "Septiembre 2026-2027" = sep-2026 … ago-2027, y su base es sep-2025 … ago-2026. Las dos etiquetas usan la misma convención, así que nunca se superponen. Una ventana que no cruza de año se rotula "Enero 2026" a secas: `2026-2026` se lee como un error de la app.
- **Mes a mes y no un total anual repartido en doceavos.** El punto de un flujo de caja es saber *cuándo* entra la plata, y acá la temporada es estacional — el promedio parejo esconde justo eso. Cada mes proyectado se cruza contra **el mismo mes** del período anterior.
- **Un mes de la ventana que ya tiene ventas cargadas NO se proyecta: vale su dato real.** A mitad de temporada media ventana ya ocurrió, y estimar un mes que se puede leer del RCV es cambiar un número cierto por uno inventado. Cada fila lleva `esReal` y el resumen separa `totalReal` de `totalProyectado`: un total que mezcla lo facturado con lo estimado sin distinguirlos no se puede defender frente a nadie.
  - **El corte es que HAYA documentos (`count > 0`), no que el neto dé distinto de cero.** Un mes facturado y anulado con NC cierra en $0 y ese cero es el dato real; con un corte por monto volvería a estimarse en positivo y la temporada saldría inflada por algo que se anuló. Fijado en los tests.
  - En el XLSX el mes real va como **valor literal, nunca como fórmula**: si colgara de `C4`, mover el supuesto en Excel movería un número ya facturado. La celda de base queda vacía y el `SUM` de la columna suma solo las bases que sí se usaron.
  - La pantalla avisa cuando un mes real es **el mes en curso**: su dato puede estar incompleto (el RCV del mes recién cierra después) y arrastra el total para abajo.
- **Solo entran ventas.** Las compras son salidas y no tienen nada que hacer en una proyección de entradas. Las **NC restan**, y van al detalle con signo: si se filtraran, el Excel mostraría un total que sus propias filas no dan.
- **El ingreso de un documento no es su neto ni siempre su total** — lo decide `cashInOf(d)`:
  - Con **IVA retenido** (factura de compra 45/46, o cualquier documento al que el cliente le retuvo el IVA): **solo el neto**. Ese IVA no es plata que entre.
  - El resto: el **Monto Total** del SII (neto + el IVA que sí se cobra; en un documento exento, el exento).
  - **Una NC sobre una factura de compra tiene que restar con la misma regla que el documento que reversa**, o el par no cierra en cero: restarle el total a esa NC dejaría un ingreso negativo que nunca existió.
  - **La retención se deduce de los montos, no de la columna `NCE o NDE sobre Fact. de Compra` del RCV**: `neto + exento + iva` que no da el `total` **es** la retención. Así funciona con cualquier documento importado y cubre también las facturas normales a las que el cliente les retuvo el IVA. El margen de 1 peso absorbe el redondeo del SII.
  - El detalle del XLSX lleva **Neto, IVA, Total SII e Ingreso** en columnas separadas, con la celda de Ingreso resaltada cuando hubo retención: sin el desglose, una factura de compra que aporta menos que neto + IVA parece un error de la planilla.
- **El redondeo va por mes y el total es la suma de los meses redondeados**, no el redondeo de la suma. El Excel imprime la columna, así que el total al pie tiene que ser el de la columna o no cuadra a ojo.
- **Cuesta 0 lecturas**: sale entero de `docs`, que ya tiene la colección completa en memoria (TTL 10 min).
- **Lógica pura en `utils/cashFlowProjection.js`** (`projectCashFlow`, `netSalesByPeriod`, `groupByCounterparty`, `shiftPeriod`, `periodWindow`, `windowLabel`), con tests en `cashFlowProjection.test.js`. La aritmética de meses va con **enteros, nunca con `Date`**: un período es la etiqueta `YYYY-MM` del RCV, no un instante, y con `Date` una zona horaria corre un documento al mes de al lado.
- **`CREDIT_NOTE_TYPES` vive ahí** y Facturación lo importa (`utils/billingDocs.js` y las piezas del listado). La proyección y la pantalla tienen que coincidir en que una NC resta; si divergen, la base sale inflada. El Dashboard también lo importa (`utils/dashboard.js`).
- **Export XLSX de dos hojas**: `Ventas netas` (banner con el neto de la base, bloque **por cliente** ordenado por monto, y el detalle documento por documento con fecha/período/tipo DTE/folio/cliente/RUT/neto, NC en rojo) y `Proyección` (12 filas mes a mes + total). El bloque por cliente muestra de dónde viene la base: una proyección sostenida por dos clientes no se lee igual que una repartida entre veinte.
- **El porcentaje va en UNA celda (`C4` de la hoja `Proyección`) y las filas la referencian** con `ROUND(D7*$C$4,0)`. Quien recibe el archivo mueve el supuesto en Excel y ve la temporada entera recalcularse, en vez de pedir otra corrida por cada escenario.
- **`isAnalysisTab`** (`resumen` + `proyeccion`) apaga filtros, tarjetas y tabla del listado. La usan los cuatro lugares que dependen de eso, así un tab de análisis nuevo se suma solo ahí.
