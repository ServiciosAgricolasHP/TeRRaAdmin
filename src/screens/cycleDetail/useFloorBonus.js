import { useState, useMemo } from "react";
import { normalizeDayPricesEntry, pisoAssigned, workdayDocId, PISO_COMBO_KEY, workdayMapKey, pisoTargets, effectivePiso } from "../../utils/cosechaCombos";

// Piso del día (bono para trato y cosecha): el monto de cada día, el bono de
// cada persona, asignarlo a todos los que tienen producción y quitarlo con sus
// bonos libres.
export function useFloorBonus({ activeLabor, cycle, cycleWrite, dayPrices, id, setDayPrices, setWorkdaysByLabor, toast, wdWrite, workdaysByLabor, workerIdFor }) {
  "use no memo";
  // Confirmación del piso masivo: { laborId, date, ruts, amount }.
  const [floorBulk, setFloorBulk] = useState(null);
  const [floorBulkBusy, setFloorBulkBusy] = useState(false);
  // Confirmación de quitar el piso del día: { laborId, date, libres, liquidados }.
  const [floorRemove, setFloorRemove] = useState(null);
  const [floorRemoveBusy, setFloorRemoveBusy] = useState(false);

  // Piso: monto fijo por día, guardado como campo `piso` de
  // `dayPrices[laborId][date]`, junto a los combos o tiers. En 0 se quita el
  // campo.
  const writeDayFloor = async (laborId, date, value) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const nextDay = { ...dayEntry, piso: Number(value) || 0 };
    if (!nextDay.piso) delete nextDay.piso;
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // Quitar el piso del día (el ✕, o dejar el monto en cero) también borra los
  // bonos de ese día que no están en una nómina. Si hay bonos asignados, antes
  // pide confirmación.
  const persistDayFloor = async (laborId, date, value) => {
    const floorAmount = Number(value) || 0;
    if (!floorAmount) {
      const { libres, liquidados } = pisoAssigned(workdaysByLabor[laborId] || {}, date);
      if (libres.length || liquidados.length) {
        setFloorRemove({ laborId, date, libres, liquidados });
        return;
      }
    }
    await writeDayFloor(laborId, date, floorAmount);
  };

  const removeDayFloor = async () => {
    if (!floorRemove) return;
    const { laborId, date, libres } = floorRemove;
    setFloorRemoveBusy(true);
    try {
      const removedKeys = [];
      for (const wd of libres) {
        const docId = wd.id || workdayDocId(id, laborId, wd.workerRut, date, PISO_COMBO_KEY);
        await wdWrite.remove(docId);
        removedKeys.push(workdayMapKey(wd.workerRut, date, PISO_COMBO_KEY));
      }
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        for (const k of removedKeys) delete lab[k];
        return { ...prev, [laborId]: lab };
      });
      await writeDayFloor(laborId, date, 0);
      setFloorRemove(null);
      toast.success(
        removedKeys.length
          ? `Piso del día quitado · ${removedKeys.length} bono${removedKeys.length === 1 ? "" : "s"} eliminado${removedKeys.length === 1 ? "" : "s"}.`
          : "Piso del día quitado.",
      );
    } catch (err) {
      toast.error("No se pudo quitar el piso: " + (err.message || err));
    } finally {
      setFloorRemoveBusy(false);
    }
  };

  // Cuántos trabajadores con producción quedan sin piso, por día. Alimenta el
  // contador del botón "a todos" del panel de precios.
  const floorPendingByDate = useMemo(() => {
    const out = {};
    if (!activeLabor) return out;
    const wds = workdaysByLabor[activeLabor.id] || {};
    const dates = new Set(Object.values(wds).map((wd) => wd?.date).filter(Boolean));
    for (const d of dates) out[d] = pisoTargets(wds, d).length;
    return out;
  }, [activeLabor, workdaysByLabor]);

  // Abre la confirmación del piso masivo, con la cantidad de personas y el
  // total. No escribe nada.
  const askApplyFloorToAll = (laborId, date) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const amount = effectivePiso(labor, dayPrices, date);
    if (!amount) {
      toast.warning("Configura primero el piso de este día.");
      return;
    }
    const ruts = pisoTargets(workdaysByLabor[laborId] || {}, date);
    if (ruts.length === 0) {
      toast.info("Todos los que tienen producción ese día ya tienen el piso.");
      return;
    }
    setFloorBulk({ laborId, date, ruts, amount });
  };

  // Escribe un workday `_piso` por cada trabajador pendiente. Es exactamente lo
  // mismo que apretar el toggle de cada uno en la columna 🪙, en lote.
  const applyFloorToAll = async () => {
    if (!floorBulk) return;
    const { laborId, date, ruts, amount } = floorBulk;
    setFloorBulkBusy(true);
    try {
      const written = {};
      for (const rut of ruts) {
        const mapKey = workdayMapKey(rut, date, PISO_COMBO_KEY);
        const docId = workdayDocId(id, laborId, rut, date, PISO_COMBO_KEY);
        const next = {
          cycleId: id, laborId, workerRut: rut, date,
          qty: 0, amount,
          pisoOnly: true,
          workerId: workerIdFor(laborId, rut),
        };
        await wdWrite.upsert(docId, next);
        written[mapKey] = { id: docId, ...next };
      }
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...written },
      }));
      setFloorBulk(null);
      toast.success(`Piso asignado a ${ruts.length} trabajador${ruts.length === 1 ? "" : "es"}.`);
    } catch (err) {
      toast.error("No se pudo asignar el piso: " + (err.message || err));
    } finally {
      setFloorBulkBusy(false);
    }
  };

  // Toggle del piso de un trabajador en un día: crea o borra su workday `_piso`
  // (`pisoOnly: true`) con el piso configurado para ese día.
  const toggleFloor = async (laborId, date, workerRut) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const mapKey = workdayMapKey(workerRut, date, PISO_COMBO_KEY);
    const docId = workdayDocId(id, laborId, workerRut, date, PISO_COMBO_KEY);
    const existing = (workdaysByLabor[laborId] || {})[mapKey];
    if (existing) {
      // Un piso que ya está en una nómina no se borra: le descuadraría el total.
      if (existing.payrollId) {
        toast.warning("Ese piso ya está en una nómina. Hay que eliminar o editar la nómina para poder quitarlo.");
        return;
      }
      await wdWrite.remove(docId);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        delete lab[mapKey];
        return { ...prev, [laborId]: lab };
      });
      return;
    }
    const amount = effectivePiso(labor, dayPrices, date);
    if (!amount) {
      toast.warning("Configura primero el piso por día o el piso por defecto de la labor.");
      return;
    }
    const next = {
      cycleId: id, laborId, workerRut, date,
      qty: 0, amount,
      pisoOnly: true,
      workerId: workerIdFor(laborId, workerRut),
    };
    await wdWrite.upsert(docId, next);
    setWorkdaysByLabor((prev) => {
      const lab = { ...(prev[laborId] || {}) };
      lab[mapKey] = { id: docId, ...next };
      return { ...prev, [laborId]: lab };
    });
  };
  return {
    applyFloorToAll,
    askApplyFloorToAll,
    floorBulk,
    floorBulkBusy,
    floorPendingByDate,
    floorRemove,
    floorRemoveBusy,
    persistDayFloor,
    removeDayFloor,
    setFloorBulk,
    setFloorRemove,
    toggleFloor,
  };
}
