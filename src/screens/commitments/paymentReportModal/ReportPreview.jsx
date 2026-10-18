import { cellOf } from "./reportDocument";

// Una hoja A4 aproximada, con la misma tipografía y colores que el PDF.
const S = {
  page: {
    background: "#ffffff",
    color: "#111827",
    padding: "28px 32px",
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: 11,
    minWidth: 640,
    maxWidth: 800,
    margin: "0 auto",
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
  },
  h1: { fontSize: 20, fontWeight: 700, margin: 0 },
  sub: { color: "#4b5563", marginTop: 2 },
  h2: { fontSize: 14, fontWeight: 700, margin: "20px 0 6px" },
  h3: { fontSize: 12, fontWeight: 700, margin: "12px 0 5px" },
  p: { margin: "6px 0" },
  table: { borderCollapse: "collapse", width: "100%" },
  th: { background: "#374151", color: "#ffffff", textAlign: "left", padding: "4px 6px", border: "1px solid #374151", fontWeight: 700 },
  td: { padding: "4px 6px", border: "1px solid #d1d5db", verticalAlign: "top" },
  num: { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  total: { background: "#f3f4f6", fontWeight: 700 },
  small: { color: "#6b7280", fontSize: 10 },
};

const TONE_COLOR = { danger: "#b91c1c", warn: "#b45309" };

const TONE_TINT = { danger: "#fef2f2", warn: "#fffbeb" };

export function ReportPreview({ doc }) {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>{doc.title}</h1>
      <div style={S.sub}>{doc.subtitle}</div>
      {doc.blocks.map((b, i) => {
        if (b.kind === "h2") return <h2 key={i} style={S.h2}>{b.text}</h2>;
        if (b.kind === "h3") return <h3 key={i} style={S.h3}>{b.text}</h3>;
        if (b.kind === "p") return <p key={i} style={{ ...S.p, ...(b.muted ? { color: "#6b7280" } : {}) }}>{b.text}</p>;
        return <PreviewTable key={i} table={b} />;
      })}
    </div>
  );
}

function PreviewTable({ table }) {
  return (
    <table style={S.table}>
      <thead>
        <tr>
          {table.columns.map((col) => (
            <th key={col.label} style={{ ...S.th, ...(col.num ? { textAlign: "right" } : {}), ...(col.width ? { width: `${col.width}mm` } : {}) }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r} style={row.total ? S.total : row.tone ? { background: TONE_TINT[row.tone] } : undefined}>
            {row.cells.map((raw, i) => {
              const cell = cellOf(raw);
              const tone = cell.tone || (i === 0 ? row.tone : "");
              const subTone = cell.subTone || cell.tone;
              return (
                <td key={i} style={{ ...S.td, ...(table.columns[i]?.num ? S.num : {}) }}>
                  <span style={{ fontWeight: cell.bold || row.bold ? 700 : undefined, color: TONE_COLOR[tone] || (cell.muted ? "#6b7280" : undefined) }}>
                    {cell.text}
                  </span>
                  {cell.sub && <div style={{ ...S.small, ...(TONE_COLOR[subTone] ? { color: TONE_COLOR[subTone] } : {}) }}>{cell.sub}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
