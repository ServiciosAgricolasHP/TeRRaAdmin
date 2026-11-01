// La guía que abre el botón "?" de la barra superior en cada pantalla. Una
// pantalla sin guía abre el índice de la ayuda.
export const HELP_GUIDE_BY_PATH = [
  ["/cycles/", "grilla-del-ciclo"],
];

export function helpPathFor(pathname) {
  const hit = HELP_GUIDE_BY_PATH.find(([prefix]) => String(pathname || "").startsWith(prefix));
  return hit ? `/ayuda/${hit[1]}` : "/ayuda";
}
