// Encabezado de tabla clickeable con indicador de orden: agrega el cursor y
// una flecha ▲/▼ en la columna activa.
export function SortHeader({ sortKey, sortBy, onToggle, align = "left", children }) {
  const active = sortBy.key === sortKey;
  const arrow = active ? (sortBy.dir === "asc" ? "▲" : "▼") : "";
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      onClick={() => onToggle(sortKey)}
      title="Click para ordenar"
      className={`cursor-pointer select-none px-2 py-2 ${alignCls} hover:text-[var(--color-text)] ${active ? "text-[var(--color-text)]" : ""}`}
    >
      {children}
      {arrow && <span className="ml-1 text-[10px]">{arrow}</span>}
    </th>
  );
}
