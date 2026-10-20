// Lo que comparten la pantalla de Faenas y sus hooks de formularios.
import { initialLaborPlan } from "../../utils/laborTypes";
import { localIsoDate } from "../../utils/dates";

// Un formulario de faena, subfaena o ciclo con una copia de cómo se abrió
// (`initial`), para avisar si se cierra con cambios sin guardar.
export const withInitial = (form) => ({ ...form, initial: form.data });

export const todayStr = () => localIsoDate();

export const newId = () => (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);

// Los trabajadores van solo en la primera labor: la de supervisión arranca
// vacía (la supervisa otra gente, no la misma cuadrilla).
export function defaultLabors(workers = [], opts = {}) {
  return initialLaborPlan(opts).map((l, i) => ({
    ...l,
    id: newId(),
    workers: i === 0 ? workers : [],
  }));
}
