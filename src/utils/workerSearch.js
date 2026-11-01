// Buscar trabajadores en la lista ya cargada: por nombre o por RUT.
import { matchesSearchQuery } from "./textSearch";

// Caracteres que hay que escribir para buscar, sin contar puntos, guiones ni
// espacios.
export const MIN_WORKER_QUERY = 2;

const compact = (s) => String(s || "").replace(/[.\s-]/g, "").toUpperCase();

// Lo que se escribe o se pega en un buscador de trabajadores, sin puntos: un
// RUT con puntos queda como se guarda, y un nombre no los lleva.
export const workerSearchInput = (text) => String(text ?? "").replace(/\./g, "");

// Si lo escrito alcanza para buscar.
export const workerQueryReady = (query) => compact(query).length >= MIN_WORKER_QUERY;

// Si el trabajador calza con lo escrito: cada palabra en el nombre, en
// cualquier orden y sin acentos ("perez ana" encuentra a "Ana Pérez"), o una
// parte del RUT vigente o del de creación (el id), sin puntos ni guion.
export function workerMatchesQuery(worker, query) {
  const needle = compact(query);
  if (!needle) return false;
  if (matchesSearchQuery(worker?.name || "", query)) return true;
  return compact(worker?.id).includes(needle) || compact(worker?.rut).includes(needle);
}

// Los primeros `take` trabajadores de `workers` que calzan, en el orden de la
// lista. Vacío mientras lo escrito no alcance.
export function searchWorkerList(workers, query, take = 30) {
  if (!workerQueryReady(query)) return [];
  const out = [];
  for (const w of workers || []) {
    if (workerMatchesQuery(w, query)) out.push(w);
    if (out.length >= take) break;
  }
  return out;
}
