import { createContext, useContext } from "react";

// Los transportistas precargados y sus altas y cambios. Lo provee `CarriersProvider`.
export const CarriersContext = createContext(null);

export function useCarriers() {
  const ctx = useContext(CarriersContext);
  if (!ctx) throw new Error("useCarriers must be used inside CarriersProvider");
  return ctx;
}
