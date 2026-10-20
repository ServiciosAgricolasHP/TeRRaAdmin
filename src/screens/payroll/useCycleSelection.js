import { useState } from "react";
import { chosenCyclesOf } from "../../utils/payrollCycles";

const SELECTION_KEY = "payroll_cycle_selection";

const loadSelection = () => {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
};

const saveSelection = (set) => {
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify([...set])); } catch {}
};

// Lo que se elige para una nómina nueva: los ciclos (guardados en el
// dispositivo), sus labores y las personas sueltas.
export function useCycleSelection({ cycles }) {
  "use no memo";
  const [selectedCycleIds, setSelectedCycleIds] = useState(loadSelection);
  // Labores que entran a la nómina, por ciclo seleccionado. No se persiste,
  // a diferencia de selectedCycleIds. Al marcar un ciclo entran todas sus
  // labores, y un ciclo marcado sin entrada en el mapa también entra con todas.
  const [selectedLaborsByCycle, setSelectedLaborsByCycle] = useState(() => new Map());
  // Personas sueltas: días puntuales de alguien, elegidos en el mismo modal que
  // "+ Agregar persona" del detalle de una nómina. Se suman a lo que traen los
  // ciclos (o arman la nómina por sí solas) y no se persisten.
  // [{ worker, workdayIds, rowKeys, filas: [{ cycleId, laborId, date, amount }] }]
  const [people, setPeople] = useState([]);
  // null = cerrado; {} abre el modal en la búsqueda, { worker } directo en esa
  // persona, para corregir lo que se le eligió.
  const [personModal, setPersonModal] = useState(null);

  const toggleCycle = (id) => {
    const marcar = !selectedCycleIds.has(id);
    setSelectedCycleIds((prev) => {
      const next = new Set(prev);
      if (marcar) next.add(id);
      else next.delete(id);
      saveSelection(next);
      return next;
    });
    // Sigue a la selección de ciclos, no a si el ciclo ya tenía entrada en
    // este mapa: marcar le pone todas sus labores y desmarcar lo saca.
    setSelectedLaborsByCycle((prev) => {
      const next = new Map(prev);
      if (marcar) {
        const cycle = cycles.find((c) => c.id === id);
        next.set(id, new Set((cycle?.labors || []).map((l) => l.id)));
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleLaborInCycle = (cycleId, laborId) => {
    setSelectedLaborsByCycle((prev) => {
      const next = new Map(prev);
      const todas = (cycles.find((c) => c.id === cycleId)?.labors || []).map((l) => l.id);
      const set = new Set(next.get(cycleId) ?? todas);
      if (set.has(laborId)) set.delete(laborId);
      else set.add(laborId);
      next.set(cycleId, set);
      return next;
    });
  };

  // Los ciclos elegidos y qué labores de cada uno (ver `chosenCyclesOf`).
  const chosenCycles = chosenCyclesOf(cycles, selectedCycleIds, selectedLaborsByCycle);

  // Agregar o corregir una persona suelta: la elección nueva reemplaza la que
  // tenía, en el mismo lugar de la lista.
  const savePerson = ({ worker, workdayIds, rowKeys, filas }) => {
    setPeople((prev) => {
      const entrada = { worker, workdayIds, rowKeys, filas };
      const i = prev.findIndex((p) => p.worker.id === worker.id);
      if (i < 0) return [...prev, entrada];
      const next = [...prev];
      next[i] = entrada;
      return next;
    });
    setPersonModal(null);
  };
  const removePerson = (workerId) => setPeople((prev) => prev.filter((p) => p.worker.id !== workerId));
  // Limpia lo elegido, después de guardar la nómina.
  const resetSelection = () => {
    setSelectedCycleIds(new Set());
    saveSelection(new Set());
    setSelectedLaborsByCycle(new Map());
    setPeople([]);
  };
  return {
    chosenCycles,
    people,
    personModal,
    removePerson,
    resetSelection,
    savePerson,
    selectedCycleIds,
    selectedLaborsByCycle,
    setPersonModal,
    toggleCycle,
    toggleLaborInCycle,
  };
}
