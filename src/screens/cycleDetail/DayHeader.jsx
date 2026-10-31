import { useGridCells } from "./GridCellsContext";

// Encabezado de las columnas (o del grupo de columnas) de un día: la fecha y
// un 📝 que se resalta si el día tiene anotación. Un click abre el modal de
// la anotación (`openDayNote`, de GridCellsContext) y el tooltip muestra su
// texto. Con `clickable=false` (día sin producción ni anotación en esta
// labor) muestra solo la fecha.
export function DayHeader(props) {
  const { actionsRef } = useGridCells();
  const { date, note, displayName, clickable = true } = props;
  const hasNote = !!String(note || "").trim();
  if (!clickable) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", width: "100%", height: "100%", padding: "0 4px",
      }}>
        <span>{displayName || date}</span>
      </span>
    );
  }
  return (
    <span
      onClick={(e) => { e.stopPropagation(); actionsRef.current.openDayNote(date); }}
      title={hasNote ? note : "Agregar anotación del día"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        width: "100%",
        height: "100%",
        userSelect: "none",
        padding: "0 4px",
      }}
    >
      <span>{displayName || date}</span>
      <span style={{
        fontSize: 12,
        color: hasNote ? "var(--color-accent)" : "var(--color-muted)",
        opacity: hasNote ? 1 : 0.55,
      }}>📝</span>
    </span>
  );
}
