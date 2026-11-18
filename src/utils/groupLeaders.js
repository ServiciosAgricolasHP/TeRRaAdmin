// La lista de líderes de grupo (`groupLeader`), por nombre.
import { normalizeLeader } from "./payroll";

// El nombre de un líder de la lista, en mayúsculas: `name` o, en los
// documentos viejos, `nombre` o el id.
export const leaderNameOf = (d) => normalizeLeader(d?.name || d?.nombre || d?.id);

// Los líderes de la lista por nombre: `true` si está habilitado. Con dos
// documentos del mismo nombre, basta uno habilitado.
export function leaderIndex(leaders) {
  const map = new Map();
  for (const d of leaders || []) {
    const name = leaderNameOf(d);
    if (name) map.set(name, map.get(name) || d.habilitado === true);
  }
  return map;
}

// Los nombres de los líderes habilitados, sin repetir y en orden alfabético.
export function enabledLeaderNames(leaders) {
  return [...leaderIndex(leaders)].filter(([, on]) => on).map(([name]) => name).sort();
}
