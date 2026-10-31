import { cyclesService, workdaysService } from "../../services";

// Candado de escritura del ciclo: si está cerrado, la grilla queda de solo
// lectura y toda escritura del ciclo o de sus jornadas se rechaza.
export function useCycleWriteGuard({ cycle, id, toast }) {
  const closed = cycle?.status === "closed";
  // Un ciclo cerrado es de solo lectura para todos, admin incluido; para
  // editarlo hay que reabrirlo.
  //
  // El corte es el cierre del ciclo, no el `payrollId` del workday: se paga a
  // mitad de ciclo y se sigue trabajando ahí para revisar y generar
  // diferencias.
  const readOnly = closed;

  // Toda escritura del ciclo y de sus workdays pasa por `cycleWrite`/`wdWrite`, que
  // verifican en un solo punto que el ciclo esté abierto. assertOpen lanza en
  // vez de devolver: los llamadores actualizan el estado local justo después
  // de escribir.
  //
  // Quedan fuera la normalización del loader (corre al montar, no es una
  // edición del usuario) y cerrar/reabrir el ciclo, que es lo que levanta el
  // candado.
  const assertOpen = () => {
    if (!closed) return;
    toast.warning("El ciclo está cerrado. Reábrelo para poder editarlo.");
    throw new Error("Ciclo cerrado: no se puede editar");
  };
  const cycleWrite = async (patch) => {
    assertOpen();
    return cyclesService.update(id, patch);
  };
  const wdWrite = {
    upsert: async (docId, data, opts) => {
      assertOpen();
      return workdaysService.upsert(docId, data, opts);
    },
    remove: async (docId) => {
      assertOpen();
      return workdaysService.remove(docId);
    },
  };
  return { closed, cycleWrite, readOnly, wdWrite };
}
