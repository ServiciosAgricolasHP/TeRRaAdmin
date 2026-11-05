import { useState, useMemo } from "react";
import {
  dayFloorAmount,
  floorContainerOf,
  floorsByDateOf,
  normalizeDayPricesEntry,
  pisoAssigned,
  pisoTargets,
  workdayDocId,
  workdayMapKey,
  PISO_COMBO_KEY,
} from "../../utils/cosechaCombos";
import { attempt } from "../../utils/attempt";
import { addFloorBonuses, removeFloorBonuses } from "../../services/workdayBatches";

// Piso del día (bono para trato y cosecha): el monto de cada día, el bono de
// cada persona, asignarlo a todos los que tienen producción y quitarlo con sus
// bonos libres. En cosecha, cada día puede tener además un piso por envase
// (`floorKey` = `_piso_<envase>`, ver utils/cosechaCombos.js), con su monto y
// sus bonos; todo lo de abajo recibe la clave del piso. Asignar un piso a
// todos y quitarlo con sus bonos escriben en lotes (services/workdayBatches.js),
// con su avance en `floorProgress`.
export function useFloorBonus({ activeLabor, cycle, cycleWrite, dayPrices, guardedWrite, id, setDayPrices, setWorkdaysByLabor, toast, wdWrite, workdaysByLabor, workerIdFor }) {
  // Confirmación del piso masivo: { laborId, date, floorKey, ruts, amount }.
  const [floorBulk, setFloorBulk] = useState(null);
  const [floorBulkBusy, setFloorBulkBusy] = useState(false);
  // Confirmación de quitar un piso del día: { laborId, date, floorKey, libres, liquidados }.
  const [floorRemove, setFloorRemove] = useState(null);
  const [floorRemoveBusy, setFloorRemoveBusy] = useState(false);
  // { label, done, total } mientras se asigna o se quita un piso.
  const [floorProgress, setFloorProgress] = useState(null);

  // El workday de un bono de piso. El de un envase guarda además el envase.
  const floorWorkday = (laborId, date, workerRut, floorKey, amount) => {
    const container = floorContainerOf(floorKey);
    return {
      cycleId: id, laborId, workerRut, date,
      qty: 0, amount,
      pisoOnly: true,
      ...(container == null ? {} : { containerY: container }),
      workerId: workerIdFor(laborId, workerRut),
    };
  };

  // Piso: monto fijo por día, guardado como campo `piso` de
  // `dayPrices[laborId][date]`, junto a los combos o tiers; el de un envase, en
  // `floorByContainer[envase]`. En 0 se quita.
  const writeDayFloor = async (laborId, date, value, floorKey = PISO_COMBO_KEY) => {
    const dayEntry = normalizeDayPricesEntry(dayPrices[laborId]?.[date]);
    const amount = Number(value) || 0;
    const container = floorContainerOf(floorKey);
    const nextDay = { ...dayEntry };
    if (container == null) {
      nextDay.piso = amount;
      if (!amount) delete nextDay.piso;
    } else {
      const byContainer = { ...(dayEntry.floorByContainer || {}), [container]: amount };
      if (!amount) delete byContainer[container];
      nextDay.floorByContainer = byContainer;
      if (!Object.keys(byContainer).length) delete nextDay.floorByContainer;
    }
    const next = { ...dayPrices, [laborId]: { ...(dayPrices[laborId] || {}), [date]: nextDay } };
    setDayPrices(next);
    await cycleWrite({ dayPrices: next });
  };

  // Quitar el piso del día (el ✕, o dejar el monto en cero) también borra los
  // bonos de ese día que no están en una nómina. Si hay bonos asignados, antes
  // pide confirmación.
  const persistDayFloor = async (laborId, date, value, floorKey = PISO_COMBO_KEY) => {
    const floorAmount = Number(value) || 0;
    if (!floorAmount) {
      const { libres, liquidados } = pisoAssigned(workdaysByLabor[laborId] || {}, date, floorKey);
      if (libres.length || liquidados.length) {
        setFloorRemove({ laborId, date, floorKey, libres, liquidados });
        return;
      }
    }
    await writeDayFloor(laborId, date, floorAmount, floorKey);
  };

  const removeDayFloor = async () => {
    if (!floorRemove) return;
    const { laborId, date, floorKey, libres } = floorRemove;
    setFloorRemoveBusy(true);
    const { error: err } = await attempt(async () => {
      const ids = libres.map((wd) => wd.id || workdayDocId(id, laborId, wd.workerRut, date, floorKey));
      const onProgress = (done, total) => setFloorProgress({ label: "Quitando los bonos…", done, total });
      onProgress(0, ids.length);
      await guardedWrite(() => removeFloorBonuses({ cycleId: id, laborId, date, floorKey, ids, onProgress }));
      const removedKeys = libres.map((wd) => workdayMapKey(wd.workerRut, date, floorKey));
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[laborId] || {}) };
        for (const k of removedKeys) delete lab[k];
        return { ...prev, [laborId]: lab };
      });
      await writeDayFloor(laborId, date, 0, floorKey);
      setFloorRemove(null);
      toast.success(
        removedKeys.length
          ? `Piso del día quitado · ${removedKeys.length} bono${removedKeys.length === 1 ? "" : "s"} eliminado${removedKeys.length === 1 ? "" : "s"}.`
          : "Piso del día quitado.",
      );
    });
    if (err) toast.error("No se pudo quitar el piso: " + (err.message || err));
    setFloorRemoveBusy(false);
    setFloorProgress(null);
  };

  // Cuántos trabajadores con producción quedan sin cada piso, por día:
  // `{ [fecha]: { [floorKey]: n } }`. Alimenta el contador del botón "a todos"
  // del panel de precios.
  const floorPendingByDate = useMemo(() => {
    const out = {};
    if (!activeLabor) return out;
    const wds = workdaysByLabor[activeLabor.id] || {};
    for (const [date, floors] of Object.entries(floorsByDateOf(dayPrices, activeLabor.id, wds))) {
      out[date] = {};
      for (const f of floors) out[date][f.key] = pisoTargets(wds, date, f.key).length;
    }
    return out;
  }, [activeLabor, dayPrices, workdaysByLabor]);

  // Abre la confirmación del piso masivo, con la cantidad de personas y el
  // total. No escribe nada.
  const askApplyFloorToAll = (laborId, date, floorKey = PISO_COMBO_KEY) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const amount = dayFloorAmount(dayPrices, laborId, date, floorKey);
    if (!amount) {
      toast.warning("Configura primero el monto de este piso.");
      return;
    }
    const ruts = pisoTargets(workdaysByLabor[laborId] || {}, date, floorKey);
    if (ruts.length === 0) {
      toast.info("Todos los que tienen producción ese día ya tienen el piso.");
      return;
    }
    setFloorBulk({ laborId, date, floorKey, ruts, amount });
  };

  // Escribe un workday de piso por cada trabajador pendiente. Es exactamente lo
  // mismo que apretar el toggle de cada uno en la columna 🪙, en lote.
  const applyFloorToAll = async () => {
    if (!floorBulk) return;
    const { laborId, date, floorKey, ruts, amount } = floorBulk;
    setFloorBulkBusy(true);
    const { error: err } = await attempt(async () => {
      const workdays = ruts.map((rut) => ({
        rut,
        id: workdayDocId(id, laborId, rut, date, floorKey),
        data: floorWorkday(laborId, date, rut, floorKey, amount),
      }));
      const onProgress = (done, total) => setFloorProgress({ label: "Asignando el piso…", done, total });
      onProgress(0, workdays.length);
      await guardedWrite(() => addFloorBonuses({ cycleId: id, laborId, date, floorKey, amount, workdays, onProgress }));
      const written = {};
      for (const w of workdays) written[workdayMapKey(w.rut, date, floorKey)] = { id: w.id, ...w.data };
      setWorkdaysByLabor((prev) => ({
        ...prev,
        [laborId]: { ...(prev[laborId] || {}), ...written },
      }));
      setFloorBulk(null);
      toast.success(`Piso asignado a ${ruts.length} trabajador${ruts.length === 1 ? "" : "es"}.`);
    });
    if (err) toast.error("No se pudo asignar el piso: " + (err.message || err));
    setFloorBulkBusy(false);
    setFloorProgress(null);
  };

  // Toggle de un piso de un trabajador en un día: crea o borra su workday
  // (`pisoOnly: true`) con el monto configurado para ese piso.
  const toggleFloor = async (laborId, date, workerRut, floorKey = PISO_COMBO_KEY) => {
    const labor = cycle.labors.find((l) => l.id === laborId);
    if (!labor) return;
    const mapKey = workdayMapKey(workerRut, date, floorKey);
    const docId = workdayDocId(id, laborId, workerRut, date, floorKey);
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
    const amount = dayFloorAmount(dayPrices, laborId, date, floorKey);
    if (!amount) {
      toast.warning("Configura primero el monto de este piso en Precios.");
      return;
    }
    const next = floorWorkday(laborId, date, workerRut, floorKey, amount);
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
    floorProgress,
    floorRemove,
    floorRemoveBusy,
    persistDayFloor,
    removeDayFloor,
    setFloorBulk,
    setFloorRemove,
    toggleFloor,
  };
}
