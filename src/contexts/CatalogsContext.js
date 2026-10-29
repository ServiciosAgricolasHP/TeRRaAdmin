import { createContext, useContext } from "react";

// Las tablas de lookup precargadas. Lo provee `CatalogsProvider`.
export const CatalogsContext = createContext(null);

export function useCatalogs() {
  const ctx = useContext(CatalogsContext);
  if (!ctx) throw new Error("useCatalogs must be used inside CatalogsProvider");
  return ctx;
}
