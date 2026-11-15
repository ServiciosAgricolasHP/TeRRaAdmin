// El orden de la lista de anticipos y bonos.

import { millisOf } from "./syncedList";

export const ADVANCE_SORTS = [
  { value: "date", label: "Fecha" },
  { value: "modified", label: "Última modificación" },
];

export const DEFAULT_ADVANCE_SORT = "date";

export const isAdvanceSort = (value) => ADVANCE_SORTS.some((s) => s.value === value);

// Cuándo se creó o se editó por última vez; sin `updatedAt`, cuándo se creó.
const modifiedMs = (advance) => millisOf(advance.updatedAt) || millisOf(advance.createdAt);

const byId = (a, b) => String(a.id || "").localeCompare(String(b.id || ""));

// Una copia ordenada, lo más nuevo primero.
// "date": por la fecha del anticipo, y los del mismo día por última modificación.
// "modified": por última modificación, sea cual sea la fecha del anticipo.
export function sortAdvances(list, sort = DEFAULT_ADVANCE_SORT) {
  const byModified = (a, b) => modifiedMs(b) - modifiedMs(a);
  const byDate = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
  const compare =
    sort === "modified"
      ? (a, b) => byModified(a, b) || byDate(a, b) || byId(a, b)
      : (a, b) => byDate(a, b) || byModified(a, b) || byId(a, b);
  return [...(list || [])].sort(compare);
}
