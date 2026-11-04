import { listPrincipals } from "../services/employmentsService";
import { useNamedList } from "./useNamedList";

// Las empresas mandantes, de su lista sincronizada. `reload` vuelve a
// pedirlas después de editarlas.
export function usePrincipals() {
  const { items, ...rest } = useNamedList(listPrincipals);
  return { principals: items, ...rest };
}
