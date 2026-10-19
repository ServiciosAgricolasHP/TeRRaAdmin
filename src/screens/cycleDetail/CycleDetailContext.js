import { createContext, useContext } from "react";

// Lo que la grilla del ciclo comparte con sus secciones: el ciclo, la labor
// activa, sus jornadas y precios, el estado de la pantalla y las acciones que
// escriben.
export const CycleDetailContext = createContext(null);

export function useCycleDetail() {
  return useContext(CycleDetailContext);
}
