import { createContext, useContext } from "react";

// Lo que la ficha de una persona en el ciclo comparte con sus piezas: la
// persona y su fila, los textos en edición, lo que se está guardando y las
// sub-vistas (configurar el día, bonos, líder).
export const WorkerEditContext = createContext(null);

export function useWorkerEdit() {
  return useContext(WorkerEditContext);
}
