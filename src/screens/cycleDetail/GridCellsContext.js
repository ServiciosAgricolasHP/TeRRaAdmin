import { createContext, useContext } from "react";

// Lo que las celdas de la grilla del ciclo leen sin que se rehagan las
// columnas: las acciones vigentes (en `actionsRef`), los setters de los
// modales que abren, los líderes, si se está asignando uno y si el ciclo está
// en solo lectura.
export const GridCellsContext = createContext(null);

export function useGridCells() {
  return useContext(GridCellsContext);
}
