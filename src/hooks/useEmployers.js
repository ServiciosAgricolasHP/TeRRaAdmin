import { employersService, EMPLOYERS_LIST } from "../services/employmentsService";
import { useNamedList } from "./useNamedList";

// Las empresas empleadoras, en caché por un día. `reload` vuelve a leerlas
// después de editarlas.
export function useEmployers() {
  const { items, ...rest } = useNamedList(employersService, EMPLOYERS_LIST);
  return { employers: items, ...rest };
}
