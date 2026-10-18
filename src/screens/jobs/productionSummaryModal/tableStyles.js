// Paleta y estilos de las tablas de cobrar (CycleSummaryModal), inline porque
// las tablas tienen fondo blanco fijo: el modal se dibuja listo para imprimir
// y la imagen o la impresión salen igual que en pantalla.
export const cellH = { border: "1px solid #555", padding: "6px 8px", fontSize: 12, fontWeight: 700, textAlign: "left" };
export const cell = { border: "1px solid #999", padding: "5px 8px", fontSize: 12 };
export const HDR_BLUE = "#9dc3e6";    // azul de encabezado — tablas por labor
export const HDR_GREEN = "#a9d08e";   // verde de encabezado — tabla general
export const ROW_TOTAL_LIGHT = "#c6efce"; // verde claro — fila total por labor
export const ROW_TOTAL_DARK = "#6aa84f";  // verde oscuro — fila total general
export const ROW_HIGHLIGHT = "#fffbeb";   // amarillo pálido — fila con el nombre de la labor en la tabla general
// Rampa de verdes para el bloque TOTAL/GANANCIAS/TOTAL GENERAL/IVA/BRUTO de
// la tabla general — mismo tono base que el resto, pero cada fila con un
// matiz distinto para que no se vea como un solo bloque sólido pegado.
export const ROW_GANANCIAS = "#93c47d";      // verde más claro que TOTAL — fila GANANCIAS
export const ROW_TOTAL_GENERAL = "#38761d";  // verde bosque — fila TOTAL GENERAL
export const ROW_IVA = "#d9ead3";            // verde muy pálido — fila IVA (informativa, texto oscuro)
export const ROW_BRUTO = "#274e13";          // verde más oscuro — fila BRUTO (el total final)

// Reusa la misma paleta hex de arriba como fill de ExcelJS, así el XLSX
// exportado queda visualmente alineado con la tabla en pantalla/impresión.
export const toArgbFill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex.replace("#", "").toUpperCase() } });
export const XLSX_BORDER = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
export const XLSX_MONEY_FMT = '"$"#,##0';
