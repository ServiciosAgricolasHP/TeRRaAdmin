// Estilos de las tablas del resumen del trabajador, inline porque la tabla se
// captura como imagen y se imprime con fondo blanco fijo.
export const cellH = { border: "1px solid #555", padding: "6px 8px", fontSize: 12, fontWeight: 700, textAlign: "left" };

export const cell = { border: "1px solid #999", padding: "5px 8px", fontSize: 12 };

// Estilos por estado de pago, para el badge de la columna Estado y los chips
// del filtro: los mismos colores asocian el chip con el badge de la fila.
export const STATUS_STYLES = {
  paid:       { bg: "#dcfce7", color: "#166534", label: "✓ Pagado" },
  in_pending: { bg: "#fef3c7", color: "#92400e", label: "⏳ En nómina" },
  unpaid:     { bg: "#f3f4f6", color: "#6b7280", label: "○ Sin pagar" },
};
