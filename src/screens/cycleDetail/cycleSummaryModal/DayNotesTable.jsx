import { dateLabel } from "../../../utils/cycleSummary";
import { cellH, cell } from "./tableStyles";

// ============================================================
// Observaciones por día (pagar)
// ============================================================
// Una fila por fecha y, dentro, una línea por labor. `showLaborNames` llega
// apagado cuando el ciclo tiene una sola labor.
export function DayNotesTable({ notes, showLaborNames }) {
  return (
    <div style={{ marginTop: 20, breakInside: "avoid" }}>
      <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.5, marginBottom: 6 }}>
        OBSERVACIONES POR DÍA
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#9dc3e6" }}>
            <th style={{ ...cellH, width: 90 }}>Fecha</th>
            <th style={cellH}>Observación</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((g) => {
            // La nota compartida va primero, rotulada "Todas las labores" para
            // no leerla como la observación de una labor sola.
            const lines = g.shared
              ? [{ key: "__all__", name: "Todas las labores", text: g.shared }]
              : [];
            for (const e of g.entries) lines.push({ key: e.laborId, name: e.name, text: e.text });
            return (
              <tr key={g.date} style={{ background: "#fff" }}>
                <td style={{ ...cell, fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" }}>
                  {dateLabel(g.date)}
                </td>
                <td style={cell}>
                  {lines.map((l, i) => (
                    <div key={l.key} style={{ marginTop: i === 0 ? 0 : 4 }}>
                      {showLaborNames && <span style={{ fontWeight: 700 }}>{l.name} — </span>}
                      <span style={{ whiteSpace: "pre-wrap" }}>{l.text}</span>
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
