import { principalsService, PRINCIPALS_LIST } from "../services/employmentsService";
import { useNamedList } from "./useNamedList";

// Las empresas mandantes, en caché por un día. `reload` vuelve a leerlas
// después de editarlas.
export function usePrincipals() {
  const { items, ...rest } = useNamedList(principalsService, PRINCIPALS_LIST);
  return { principals: items, ...rest };
}
