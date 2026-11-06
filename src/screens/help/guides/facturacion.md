# Facturación

Facturación lleva el libro de compras y ventas de cada empresa, con lo que se baja del Registro de Compras y Ventas (RCV) del SII. Las facturas se emiten en el portal del SII; acá se importan, se marca si están pagadas y se ve cuánto falta por cobrar.
<!-- preguntas: facturas; libro de compras y ventas; registro de compras y ventas; para qué sirve facturación -->

## Las empresas
<!-- preguntas: agregar una empresa; cambiar de empresa; facturas de otra empresa; empresa nueva en facturación -->

Cada empresa tiene su propio libro, y la que se ve se elige en el selector **🏢**, junto a las pestañas. En **⏳ Pendientes**, el selector también ofrece **Todas las empresas**.

Para agregar una, toca **🏢 Empresas** y **+ Nueva empresa**. Escribe el **RUT**, la **Razón Social** y un **Alias**, el nombre corto que se ve en la pantalla, y toca **Guardar**.

![Las empresas](help/facturacion/01-empresas.webp)

## Importar el registro del SII
<!-- preguntas: cómo importo las facturas; cargar el RCV; subir el csv del SII; importar compras y ventas; actualizar las facturas del mes -->

1. En el portal del SII, baja en CSV el registro de ventas o de compras del mes.
2. Toca **📥 Importar CSV del SII**, elige la empresa y toca **📥 Elegir archivos...**. Puedes elegir varios a la vez: de ventas y de compras, y de varios meses.
3. Revisa la vista previa: cuántos documentos trae, cuántos son **Nuevos** y cuántos **Sobreescriben** a los que ya estaban. Si el RUT del nombre del archivo no es el de la empresa, avisa. Para dejar un archivo afuera, desmárcalo.
4. Toca **Confirmar**.

![La vista previa de un archivo de ventas](help/facturacion/02-importar.webp)

**Qué pasa por detrás:** importar un mes que ya estaba lo reemplaza entero. Los documentos que ya no vienen en el archivo se borran, y los que siguen conservan su estado de pago, sus abonos y sus notas. Por eso un mes se puede volver a importar las veces que haga falta.

## Ver las facturas y las compras
<!-- preguntas: ver las facturas del mes; buscar una factura; ver las compras; facturas de un cliente; buscar por folio; facturas de otro mes -->

**📤 Facturas** son las ventas y **📥 Compras**, las compras. Las dos abren en el mes actual.

- El selector de período cambia de mes, y **Todos los períodos** los junta.
- El buscador encuentra por cliente o proveedor, RUT o folio, en todos los meses.
- Se filtra por tipo de documento y, en Facturas, por estado de pago.
- Al tocar un encabezado (**Fecha**, **Total**…) se ordena por esa columna.
- Arriba están los totales del período. Las notas de crédito restan.

![Las facturas del mes](help/facturacion/03-facturas.webp)

## Marcar si una factura está pagada
<!-- preguntas: marcar una factura pagada; estado de pago de una factura; factura anulada; solo neto; factura cedida; factoring; nota de crédito -->

En **📤 Facturas**, la columna **Estado** de cada fila dice cómo está:

- **No pagado**: falta cobrarla. Así llega al importarla.
- **Pagado**.
- **Solo neto**: el cliente pagó el neto y retuvo el IVA. Sale en **📑 Retenciones**.
- **Solo IVA**: la factura se cedió por factoring, y el neto ya lo pagó la empresa de factoring.
- **Anulada**: una nota de crédito la anuló.

Cuando una nota de crédito tiene el mismo cliente y el mismo total que una factura, la fila muestra **⚠ NC?**. Tócalo: el detalle muestra la nota, y **Marcar como Anulada** cambia el estado y lo anota en las notas de la factura.

![Una nota de crédito que podría anular una factura](help/facturacion/04-nota-de-credito.webp)

## Anotar un pago o un abono
<!-- preguntas: registrar un pago de una factura; abono a una factura; pago parcial; cuánto falta por cobrar de una factura; agregar una nota a una factura -->

1. Toca **ℹ** en la fila de la factura.
2. En el detalle, toca **+ Registrar pago / abono**.
3. Elige la fecha, el tipo y el monto. Con **Total**, el monto es lo que falta; con **Solo neto** o **Solo IVA**, el neto o el IVA de la factura.
4. Toca **Registrar pago**.

![Un abono en el detalle de una factura](help/facturacion/05-abono.webp)

La columna **Abonos** muestra lo pagado y el saldo. Un pago no cambia el estado: cuando la factura quede pagada, márcala **Pagado**. En el mismo detalle se escriben notas internas, en **Notas / glosa (interno)**.

## Ver lo que falta por cobrar
<!-- preguntas: facturas pendientes; cuánto nos deben; facturas sin pagar; pendientes de cobro; quién nos debe; iva pendiente por cliente; iva retenido por mes; marcar pagada una factura; pendientes de todas las empresas -->

La pestaña **⏳ Pendientes**, la última, junta las facturas de venta que tienen saldo, de cualquier mes. Muestra las de la empresa del selector **🏢** o, con **Todas las empresas**, las de todas, y su número dice cuántas son. Los botones **Factura completa**, **Abono parcial** e **IVA pendiente** filtran, el buscador encuentra por cliente, RUT o folio, y los cuadros dicen cuánto suma cada uno.

- **Facturas por cobrar**: las que se deben completas y las que tienen abonos, por cliente, con el total de cada uno. Con todas las empresas, cada factura dice de cuál es, y el total de un cliente que les debe a dos dice cuánto a cada una.
- **IVA pendiente**: las facturas **Solo neto**, por cliente y por mes, del más viejo al más nuevo, con el IVA pendiente de cada mes y el total del cliente.

![Lo que falta por cobrar, de todas las empresas](help/facturacion/06-pendientes.webp)

El estado de cada factura se cambia en su fila, en la columna **Estado**, igual que en **📤 Facturas**. Cuando el cliente paga el IVA retenido, elige **Pagado** en su fila del IVA pendiente. Lo que cambias queda a la vista, atenuado y con el estado nuevo, hasta que sales de la pestaña; si te equivocaste, vuelve a elegir el estado en la misma fila. **ℹ** abre el detalle, donde se anotan los abonos; al cerrarlo, sigues en el mismo lugar.

![El IVA pendiente de un cliente, mes a mes](help/facturacion/07-iva-pendiente.webp)

Para marcar varias de una vez, **✓ Septiembre pagado**, en el subtotal de un mes del IVA, o **✓ Todo el IVA pagado** y **✓ Todas pagadas**, en el total de un cliente: TeRRa pregunta antes, con cuántas son y cuánto suman. Lo que se ve se copia, se descarga, se imprime o se baja en Excel.

## Las retenciones de IVA
<!-- preguntas: iva retenido; retenciones; facturas solo neto; cuánto iva nos retuvieron -->

**📑 Retenciones** lista las facturas marcadas **Solo neto**, agrupadas por cliente, con el IVA que retuvo cada uno. **▸** abre un cliente, y cada uno tiene sus botones para copiar, imprimir o bajar su detalle en Excel.

## Centros de costo y gastos informales
<!-- preguntas: centro de costo; agrupar gastos; gastos de arriendo; gasto sin factura; gasto informal; combustibles -->

- En la columna **C. Costo** de una fila se elige su centro de costo (Arriendo, Mantención…). Los combustibles se reconocen solos y llevan **⛽**.
- **🏷 Gestionar centros de costo** crea, edita y elimina centros (**🗂 Gestión de centros**), y muestra todos los documentos de un centro, de todas las empresas y meses.
- Ahí mismo, **+ Gasto informal** anota un gasto sin factura. Se suma al centro, pero no entra a las facturas ni al IVA.
- **🗂 Agrupar tabla por centro** agrupa la lista, y lo que se exporta, por centro de costo: los combustibles juntos y el resto por proveedor.

![Los documentos de un centro de costo](help/facturacion/08-centros-de-costo.webp)

## El resumen del año y el IVA
<!-- preguntas: iva a pagar; resumen anual; iva débito y crédito; ventas del año; iva del mes -->

**📊 Resumen** cruza los 12 meses del año elegido: las ventas y compras netas, el IVA débito (de las ventas), el IVA crédito (de las compras) y el **IVA a pagar** de cada mes y del año. Si da negativo, es IVA a favor.

![El resumen del año](help/facturacion/09-resumen.webp)

Un administrador ve además **📈 Proyección**, que estima los ingresos de 12 meses a partir de las ventas de los mismos meses del año anterior.

## Copiar, imprimir o bajar en Excel
<!-- preguntas: exportar las facturas a excel; imprimir las compras; copiar la tabla de facturas; bajar el libro de ventas -->

Arriba de la lista, **📋 Copiar**, **📥 PNG**, **🖨 Imprimir** y **📊 XLSX** sacan la lista tal como se ve, con sus filtros y su orden. Las demás pestañas y ventanas tienen los mismos botones.

## Si algo no funciona
<!-- preguntas: no aparece una factura; se borró una factura al importar; el rut del archivo no coincide; no puedo registrar el pago; no puedo importar -->

- **No aparece una factura**: revisa la empresa y el mes, o búscala, que la búsqueda mira todos los meses. Si es de este mes, puede que el SII todavía no la tuviera al bajar el archivo: vuelve a importarlo.
- **Una factura desapareció al importar**: ya no venía en el archivo de ese mes, y el mes se reemplaza entero.
- **La vista previa avisa que el RUT es otro**: el archivo parece de otra empresa. Revisa la empresa elegida antes de confirmar.
- **No deja registrar un pago**: los pagos de una factura no pueden pasar su total.
- **📥 Importar CSV del SII está apagado**: primero hay que agregar una empresa.
