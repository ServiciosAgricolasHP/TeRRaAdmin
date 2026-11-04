import { listEmployers } from "../services/employmentsService";
import { useNamedList } from "./useNamedList";

// Las empresas empleadoras, de su lista sincronizada. `reload` vuelve a
// pedirlas después de editarlas.
export function useEmployers() {
  const { items, ...rest } = useNamedList(listEmployers);
  return { employers: items, ...rest };
}
