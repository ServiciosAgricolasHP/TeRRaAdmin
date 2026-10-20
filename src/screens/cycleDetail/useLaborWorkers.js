import { useState } from "react";
import { workdayDocId, workdayMapKey } from "../../utils/cosechaCombos";
import { SINGLE_COMBO } from "./rows";
import { workdaysService } from "../../services";

// Trabajadores de la labor activa: agregar a alguien, sueldo mensual con su
// asistencia, quitar a una persona y pasar un temporal a su RUT real.
export function useLaborWorkers({ activeLabor, cycle, cycleWrite, id, isOvertimeDayLabor, readOnly, setCycle, setWorkdaysByLabor, showToast, toast, wdWrite, workdaysRef, workerIdFor, workers }) {
  "use no memo";
  const [pickerOpen, setPickerOpen] = useState(false);
  // RUT sintético (TEMP-*) del temporal al que se le está asignando un RUT
  // real. Con valor, abre un segundo selector que reemplaza esa entrada (y
  // reescribe todas sus jornadas) por el trabajador elegido.
  const [assignTempRut, setAssignTempRut] = useState(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const [removeWorker, setRemoveWorker] = useState(null);
  // Aviso al marcar como mensual a alguien con días con monto (ver toggleMonthly).
  const [monthlyConfirm, setMonthlyConfirm] = useState(null);
  const [monthlyBusy, setMonthlyBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  const persistLabor = async (next) => {
    try {
      const nextLabors = cycle.labors.map((l) => (l.id === next.id ? next : l));
      await cycleWrite({ labors: nextLabors });
      setCycle((c) => ({ ...c, labors: nextLabors }));
      return true;
    } catch (err) {
      toast.error("No se pudo guardar el cambio: " + (err.message || err));
      return false;
    }
  };

  // ============================================================
  // Trabajadores
  // ============================================================

  const pickWorker = async (worker) => {
    const pickedId = worker.id || worker.rut;
    if (workers.find((w) => (w.id || w.rut) === pickedId)) { setPickerOpen(false); return; }
    const entry = { id: pickedId, rut: worker.rut, name: worker.name };
    if (worker.isTemp) {
      entry.isTemp = true;
      // Los temporales no tienen doc en `worker`: su líder se guarda en la
      // entrada de labor.workers y lo lee la vista por grupo.
      if (worker.groupLeader) entry.groupLeader = String(worker.groupLeader).toUpperCase();
    }
    const ok = await persistLabor({ ...activeLabor, workers: [...workers, entry] });
    setPickerOpen(false);
    if (ok) showToast(`${worker.name || "Trabajador"} agregado`);
  };

  // Toggle de sueldo mensual de un trabajador en la labor activa (`monthly:
  // true` en su entrada de labor.workers). Solo donde `allowsMonthly`: las
  // celdas del día pasan a casilla de asistencia y el workday se guarda con
  // amount 0, así no suma a la transferencia de la nómina.
  //
  // Al marcarlo, si ya tiene días con monto en la labor, pregunta antes
  // (`monthlyConfirm`): la grilla mostraría ✓ en esos días, pero sus montos se
  // seguirían pagando. Los días que ya están en una nómina no se tocan.
  const setMonthlyFlag = async (rut, monthly) => {
    const nextWorkers = workers.map((w) => (w.rut === rut ? { ...w, monthly } : w));
    await persistLabor({ ...activeLabor, workers: nextWorkers });
  };

  const toggleMonthly = async (rut) => {
    if (readOnly || !activeLabor) return;
    const worker = workers.find((w) => w.rut === rut);
    if (!worker) return;
    if (worker.monthly) {
      await setMonthlyFlag(rut, false);
      return;
    }
    // Las columnas de la grilla guardan esta función de un render anterior:
    // las jornadas se leen del ref para no decidir con datos viejos.
    const lab = workdaysRef.current[activeLabor.id] || {};
    const withAmount = Object.entries(lab).filter(
      ([, wd]) => wd?.workerRut === rut && Number(wd.amount) !== 0,
    );
    if (withAmount.length === 0) {
      await setMonthlyFlag(rut, true);
      return;
    }
    const free = withAmount.filter(([, wd]) => !wd.payrollId);
    setMonthlyConfirm({
      rut,
      name: worker.name || rut,
      free,
      freeTotal: free.reduce((s, [, wd]) => s + (Number(wd.amount) || 0), 0),
      inPayroll: withAmount.length - free.length,
    });
  };

  // Marca al trabajador como mensual. Con `convert`, deja en asistencia de $0
  // los días con monto que todavía no están en una nómina.
  const confirmMonthly = async (convert) => {
    const req = monthlyConfirm;
    if (!req || !activeLabor) return;
    setMonthlyBusy(true);
    try {
      if (convert) {
        const patch = { amount: 0, attendanceOnly: true };
        if (isOvertimeDayLabor) {
          Object.assign(patch, { qty: 0, overtimeHours: 0, extras: 0, hasManejo: false, hasSupervision: false });
        }
        for (const [, wd] of req.free) {
          const docId = wd.id || workdayDocId(id, activeLabor.id, req.rut, wd.date, SINGLE_COMBO);
          await wdWrite.upsert(docId, patch);
        }
        setWorkdaysByLabor((prev) => {
          const lab = { ...(prev[activeLabor.id] || {}) };
          for (const [mapKey] of req.free) {
            if (lab[mapKey]) lab[mapKey] = { ...lab[mapKey], ...patch };
          }
          return { ...prev, [activeLabor.id]: lab };
        });
      }
      await setMonthlyFlag(req.rut, true);
      setMonthlyConfirm(null);
    } catch (err) {
      toast.error("No se pudo marcar como mensual: " + (err.message || err));
    } finally {
      setMonthlyBusy(false);
    }
  };

  // Crea o borra el workday en $0 (`attendanceOnly`) de un trabajador mensual:
  // la casilla "presente sin pago" de la celda del día. Como es un workday más,
  // cuenta en las métricas y en las jornadas. El llamador pasa
  // `currentlyPresent` desde la fila, sin depender del wdMap del closure.
  const toggleAttendance = async (rut, date, currentlyPresent) => {
    if (readOnly || !activeLabor) return;
    const mapKey = workdayMapKey(rut, date, SINGLE_COMBO);
    const docId = workdayDocId(id, activeLabor.id, rut, date, SINGLE_COMBO);
    if (currentlyPresent) {
      await wdWrite.remove(docId);
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[activeLabor.id] || {}) };
        delete lab[mapKey];
        return { ...prev, [activeLabor.id]: lab };
      });
    } else {
      const workerId = workerIdFor(activeLabor.id, rut);
      await wdWrite.upsert(docId, {
        cycleId: id, laborId: activeLabor.id, workerRut: rut, date,
        amount: 0, attendanceOnly: true, workerId,
      });
      setWorkdaysByLabor((prev) => {
        const lab = { ...(prev[activeLabor.id] || {}) };
        lab[mapKey] = { cycleId: id, laborId: activeLabor.id, workerRut: rut, date, amount: 0, attendanceOnly: true, workerId };
        return { ...prev, [activeLabor.id]: lab };
      });
    }
  };

  const askRemoveWorker = (rut) => {
    const w = workers.find((x) => x.rut === rut);
    if (w) setRemoveWorker(w);
  };

  // Quita a un trabajador de la labor activa, sin pasar por el ConfirmDialog:
  // la usan el diálogo de escritorio y el modal mobile, que confirma por su
  // cuenta. Devuelve true si lo quitó.
  const removeWorkerNow = async (worker) => {
    if (!worker || !activeLabor) return false;
    // Temporales: también se borran sus workdays en todo el ciclo.
    if (worker.isTemp) {
      const all = await workdaysService.list({
        wheres: [["cycleId", "==", id], ["workerRut", "==", worker.rut]],
      });
      for (const wd of all) await wdWrite.remove(wd.id);
      setWorkdaysByLabor((prev) => {
        const next = {};
        for (const [lid, m] of Object.entries(prev)) {
          const filtered = {};
          for (const [k, v] of Object.entries(m)) {
            if (v?.workerRut !== worker.rut) filtered[k] = v;
          }
          next[lid] = filtered;
        }
        return next;
      });
      const ok = await persistLabor({ ...activeLabor, workers: workers.filter((w) => w.rut !== worker.rut) });
      if (ok) showToast(`${worker.name || "Trabajador"} quitado`);
      return ok;
    }
    const existing = await workdaysService.list({
      wheres: [["cycleId", "==", id], ["laborId", "==", activeLabor.id], ["workerRut", "==", worker.rut]],
      take: 1,
    });
    if (existing.length) {
      toast.warning("No se puede quitar: el trabajador tiene producción registrada en esta labor.");
      return false;
    }
    const ok = await persistLabor({ ...activeLabor, workers: workers.filter((w) => w.rut !== worker.rut) });
    if (ok) showToast(`${worker.name || "Trabajador"} quitado`);
    return ok;
  };

  const confirmRemoveWorker = async () => {
    if (!removeWorker) return;
    setRemoveBusy(true);
    try {
      await removeWorkerNow(removeWorker);
    } finally {
      setRemoveBusy(false);
      setRemoveWorker(null);
    }
  };

  // Wrapper por rut para el modal mobile, que solo conoce el rut (viene de
  // rowDataRaw) y no la entrada cruda de activeLabor.workers.
  const removeWorkerByRut = async (rut) => {
    const w = workers.find((x) => x.rut === rut);
    if (!w) return false;
    return await removeWorkerNow(w);
  };

  // Convierte un temporal (TEMP-…) en un trabajador real: reemplaza su entrada
  // en labor.workers y reescribe cada workday del ciclo con el rut temporal.
  // El docId incluye el rut, así que cada doc se copia a un id nuevo y se
  // borra el viejo (Firestore no renombra documentos).
  const convertTempToReal = async (real) => {
    const tempRut = assignTempRut;
    if (!tempRut || !real?.rut) { setAssignTempRut(null); return; }
    if (real.isTemp) { setAssignTempRut(null); return; }
    if (real.rut === tempRut) { setAssignTempRut(null); return; }
    if (workers.some((w) => w.rut === real.rut)) {
      toast.warning("Ese trabajador ya existe en este ciclo. Quita primero la fila duplicada antes de asignar.");
      return;
    }
    setAssignBusy(true);
    try {
      const wds = await workdaysService.list({
        wheres: [["cycleId", "==", id], ["workerRut", "==", tempRut]],
      });
      for (const wd of wds) {
        const parts = String(wd.id).split("__");
        if (parts.length < 4) continue;
        parts[2] = real.rut;
        const newDocId = parts.join("__");
        const { id: _omit, ...rest } = wd;
        await wdWrite.upsert(newDocId, { ...rest, workerRut: real.rut, workerId: real.id || real.rut });
        await wdWrite.remove(wd.id);
      }
      // Reemplaza la entrada en labor.workers, conservando el orden.
      const nextWorkers = workers.map((w) =>
        w.rut === tempRut ? { id: real.id || real.rut, rut: real.rut, name: real.name } : w,
      );
      await persistLabor({ ...activeLabor, workers: nextWorkers });
      // Cambia la clave de las entradas del mapa local (de todas las labores)
      // que apuntaban al temporal.
      setWorkdaysByLabor((prev) => {
        const next = { ...prev };
        for (const [lid, m] of Object.entries(prev)) {
          const newMap = {};
          for (const [k, v] of Object.entries(m)) {
            if (v?.workerRut === tempRut) {
              const newKey = workdayMapKey(real.rut, v.date, k.split("__")[2] || SINGLE_COMBO);
              newMap[newKey] = { ...v, workerRut: real.rut };
            } else {
              newMap[k] = v;
            }
          }
          next[lid] = newMap;
        }
        return next;
      });
      setAssignTempRut(null);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo asignar el RUT: " + (err.message || err));
    } finally {
      setAssignBusy(false);
    }
  };
  return {
    askRemoveWorker,
    assignBusy,
    assignTempRut,
    confirmMonthly,
    confirmRemoveWorker,
    convertTempToReal,
    monthlyBusy,
    monthlyConfirm,
    pickerOpen,
    pickWorker,
    removeBusy,
    removeWorker,
    removeWorkerByRut,
    setAssignTempRut,
    setMonthlyConfirm,
    setPickerOpen,
    setRemoveWorker,
    toggleAttendance,
    toggleMonthly,
  };
}
