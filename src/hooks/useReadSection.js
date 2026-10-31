import { useEffect } from "react";
import { pushReadSection } from "../services/readMeter";

// Mientras `active`, lo que se lee queda en el registro de lecturas bajo esta
// sección (un modal) dentro de la pantalla: "/payroll › Detalle de nómina".
// `name` es fijo: nunca lleva el nombre de una persona ni un folio.
export function useReadSection(name, active = true) {
  useEffect(() => {
    if (!name || !active) return undefined;
    return pushReadSection(name);
  }, [name, active]);
}
