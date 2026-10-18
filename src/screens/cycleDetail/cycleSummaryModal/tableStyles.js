// Estilos de las tablas del resumen del ciclo: celdas y los inputs de las
// filas editables del modo cobrar.
// Estilos compartidos para los inputs editables en modo cobrar. Fondo amarillo
// para señalar visualmente las celdas modificables (igual que en el XLSX).
export const cobrarInputStyle = {
  width: 90,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  border: "1px solid #ccc",
  borderRadius: 3,
  padding: "1px 4px",
  background: "#fffbeb",
  fontSize: 12,
};

export const cobrarDateInputStyle = {
  border: "1px solid #ccc",
  borderRadius: 3,
  padding: "1px 4px",
  background: "#fffbeb",
  fontSize: 12,
};

export const inputVal = (v) => (v === 0 || v == null || v === "") ? "" : v;

export const cellH = { border: "1px solid #555", padding: "6px 8px", fontSize: 12, fontWeight: 700, textAlign: "left" };

export const cell = { border: "1px solid #999", padding: "5px 8px", fontSize: 12 };
