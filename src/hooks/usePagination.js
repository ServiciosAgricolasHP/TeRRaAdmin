import { useMemo, useState } from "react";
import { useValuesChanged } from "./useValuesChanged";

// Una lista partida en páginas de `pageSize`, para dibujar con `Pager`.
// Cambiar alguno de `resetOn` (un filtro, la búsqueda, el orden) vuelve a la
// página 1. La página se acota al total: si la lista se achica antes de que
// corra la vuelta a la 1, no queda una página vacía.
export function usePagination(items, pageSize, resetOn) {
  const [page, setPage] = useState(1);
  if (useValuesChanged(resetOn)) setPage(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize],
  );
  return { page: currentPage, pageCount, pageItems, setPage };
}
