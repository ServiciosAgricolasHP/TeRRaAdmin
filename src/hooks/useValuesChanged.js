import { useState } from "react";

// Si alguno de `values` cambió desde el render anterior (con `Object.is`, como
// las dependencias de un efecto). Sirve para ajustar estado cuando cambia una
// prop, durante el render y sin un efecto, como recomienda React ("Adjusting
// some state when a prop changes"):
//
//   if (useValuesChanged([open, labor], { onMount: true }) && open) setDraft(...);
//
// Con `onMount`, el primer render también cuenta como cambio, igual que un
// efecto, que corre al montar.
export function useValuesChanged(values, { onMount = false } = {}) {
  const [prev, setPrev] = useState(onMount ? null : values);
  const changed = prev === null || prev.length !== values.length || values.some((v, i) => !Object.is(v, prev[i]));
  if (changed) setPrev(values);
  return changed;
}
