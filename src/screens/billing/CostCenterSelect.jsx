// Select inline en cada fila para etiquetar el centro de costo ficticio
// manual de un documento. Combustibles no pasan por acá — se muestran como
// chip fijo "⛽ auto" porque su agrupación es automática y no se puede pisar
// con un tag manual (ver groupDocsByCostCenter).
export function CostCenterSelect({ value, costCenters, onChange }) {
  const optionStyle = { backgroundColor: "var(--color-surface)", color: "var(--color-text)" };
  const selected = costCenters.find((c) => c.id === value);
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium outline-none border-0 cursor-pointer ${
        selected
          ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
          : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
      }`}
    >
      <option value="" style={optionStyle}>—</option>
      {costCenters.map((c) => (
        <option key={c.id} value={c.id} style={optionStyle}>
          {c.emoji ? `${c.emoji} ` : ""}{c.label}
        </option>
      ))}
    </select>
  );
}
