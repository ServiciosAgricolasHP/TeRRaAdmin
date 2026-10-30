import { useRef } from "react";

const NAVIGATION_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Tab", "Enter", "PageUp", "PageDown", "Home", "End", "Escape",
]);

// Varias celdas seguidas de una misma columna de la grilla del ciclo, como en
// Excel: Shift+clic o Shift+↑/↓ desde la celda con foco. Copiar, pegar y
// borrar la usan (useCellEdits). La selección vive en un ref y se pinta con
// `cellClassRules`, así elegir celdas no vuelve a dibujar la pantalla.
//
// La grilla avisa el foco, el clic y la tecla un instante después de
// procesarlos, en ese orden: al llegar el aviso de Shift+↓, el foco ya bajó.
export function useCellRange({ gridRef, laborId }) {
  // { laborId, field, anchorId, endId }: la columna, la celda donde empezó
  // y la del otro extremo, por el id de su fila.
  const rangeRef = useRef(null);
  // La celda con foco y la anterior, { id, field }.
  const focusRef = useRef({ current: null, previous: null });

  const bounds = (api) => {
    const r = rangeRef.current;
    if (!r || !api || r.laborId !== laborId || !api.getColumn(r.field)) return null;
    const a = api.getRowNode(r.anchorId)?.rowIndex;
    const b = api.getRowNode(r.endId)?.rowIndex;
    if (a == null || b == null || a === b) return null;
    return { field: r.field, top: Math.min(a, b), bottom: Math.max(a, b) };
  };

  // La selección vigente: su columna, su primera fila y sus filas de arriba
  // abajo, con los encabezados de grupo que queden en medio. Null si no hay
  // dos o más filas elegidas en la labor y la columna que se ven.
  const selection = () => {
    const api = gridRef.current?.api;
    const b = bounds(api);
    if (!b) return null;
    const nodes = [];
    for (let i = b.top; i <= b.bottom; i++) {
      const node = api.getDisplayedRowAtIndex(i);
      if (node) nodes.push(node);
    }
    return { field: b.field, top: b.top, nodes };
  };

  const setRange = (next) => {
    const prev = rangeRef.current;
    rangeRef.current = next;
    const api = gridRef.current?.api;
    if (!api) return;
    const columns = [...new Set([prev?.field, next?.field])].filter((f) => f && api.getColumn(f));
    if (columns.length) api.refreshCells({ columns });
  };

  const clear = () => {
    if (rangeRef.current) setRange(null);
  };

  // Extiende la selección desde su celda de inicio, o desde `from` si no hay
  // una, hasta `to`. Solo dentro de una columna: otra columna la deshace.
  const extend = (from, to) => {
    const r = rangeRef.current;
    const anchor = r && r.laborId === laborId ? { id: r.anchorId, field: r.field } : from;
    if (!anchor || !to || anchor.field !== to.field || anchor.id === to.id) {
      clear();
      return;
    }
    setRange({ laborId, field: to.field, anchorId: anchor.id, endId: to.id });
  };

  const onCellFocused = (e) => {
    const node = e.rowIndex != null && !e.rowPinned ? e.api.getDisplayedRowAtIndex(e.rowIndex) : null;
    const field = e.column && typeof e.column === "object" ? e.column.getColDef().field : null;
    let current = null;
    // Un encabezado de grupo es una fila entera, sin columnas: el foco que pasa
    // por él sigue en la columna de antes, así Shift+↓ lo cruza.
    if (node?.data?._isHeader) current = { id: node.id, field: focusRef.current.current?.field };
    else if (node && field) current = { id: node.id, field };
    focusRef.current = { previous: focusRef.current.current, current };
  };

  const onCellClicked = (e) => {
    if (!e.event?.shiftKey) {
      clear();
      return;
    }
    // Lo que el navegador marcó como texto entre los dos clics no es parte
    // de la selección.
    window.getSelection?.()?.removeAllRanges();
    extend(focusRef.current.previous, { id: e.node.id, field: e.colDef.field });
  };

  // Lo llama useCellEdits con cada tecla fuera de la edición de una celda.
  const onKey = (params) => {
    const e = params.event;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const from = params.colDef?.field ? { id: params.node.id, field: params.colDef.field } : null;
      extend(from, focusRef.current.current);
    } else if (NAVIGATION_KEYS.has(e.key)) {
      clear();
    }
  };

  // Para `cellClassRules`: si la celda está en la selección.
  const isSelected = (p) => {
    const r = rangeRef.current;
    if (!r || p.colDef?.field !== r.field) return false;
    const b = bounds(p.api);
    const i = p.node?.rowIndex;
    return !!b && i != null && i >= b.top && i <= b.bottom;
  };

  // Para `suppressKeyboardEvent`: con varias celdas elegidas, Supr y
  // Retroceso las borran todas (useCellEdits), y la grilla no borra ni abre
  // por su cuenta la celda con foco.
  const suppressKeyboardEvent = (p) =>
    !p.editing && (p.event.key === "Delete" || p.event.key === "Backspace") && !!bounds(p.api);

  return { clear, isSelected, onCellClicked, onCellFocused, onKey, selection, suppressKeyboardEvent };
}
