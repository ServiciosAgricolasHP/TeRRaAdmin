import { useState } from "react";
import { fmtCurrency } from "../../../utils/format";
import { removeWorkerFromPayroll, addWorkdaysToPayroll } from "../../../services/payrollsService";
import { liveProfileOf } from "../../../services/payrollRecalc";
import { workdaysService } from "../../../services";
import { listPendingForWorkers } from "../../../services/advancesService";
import { aggregateWorkerAmounts } from "../../../utils/payroll";
import { resolveCurrentRut } from "../helpers";
import { planAddWorkdays, withPaidPeriods, cycleDetailOf, stillFreeWorkdays, asPayrollWorker } from "../../../utils/payrollItem";
import { extendSnapshot, snapshotCycleOf, snapshotWorkdayOf, snapshotAdvanceOf } from "../../../services/payrollSnapshots";
import { workerKeys } from "../../../services/workersService";

// Lo que pasó con la plata al agregar algo a una nómina, para el aviso.
function additionSummary(lead, added = []) {
  const parts = [lead];
  const newCount = added.filter((x) => x.isNew).length;
  const existingCount = added.length - newCount;
  if (newCount) parts.push(`${newCount} trabajador(es) nuevo(s).`);
  if (existingCount) parts.push(`${existingCount} ya estaba(n) y suma(n) producción.`);
  const advances = added.reduce((s, x) => s + (x.anticipos || 0), 0);
  const bonuses = added.reduce((s, x) => s + (x.bonos || 0), 0);
  if (advances > 0) parts.push(`Se descuentan ${fmtCurrency(advances)} de anticipos pendientes.`);
  if (bonuses > 0) parts.push(`Se suman ${fmtCurrency(bonuses)} de bonos pendientes.`);
  return parts.join(" ");
}

// "✂ Editar contenido" de una nómina pendiente: sacar a un trabajador, agregar
// ciclos o labores y agregar los días de una persona.
export function useContentEdit({ cycleDetails, cycles, faenas, items, onChanged, payroll, subfaenas, toast, workers }) {
  "use no memo";
  // Modo edición: sacar un trabajador, o destildar ciclos y labores y
  // recalcular sin ellos. Solo con la nómina pendiente.
  const isPending = payroll.status !== "paid";
  const [editMode, setEditMode] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // { target, message }
  const handleRemoveWorker = (item) => {
    if (!isPending || editBusy) return;
    const label = `${item.name || item.rut} (${fmtCurrency(item.amount || 0)})`;
    setConfirmRemove({
      target: item,
      message: `¿Sacar a ${label} de esta nómina?\n\nSe liberan sus jornadas y se restauran sus anticipos aplicados. Se puede volver a sumar con "+ Agregar persona".`,
    });
  };
  const doRemoveWorker = async (item) => {
    setEditBusy(true);
    try {
      await removeWorkerFromPayroll(payroll.id, item.rut);
      await onChanged?.();
    } catch (err) {
      toast.error(`Error al sacar el trabajador: ${err?.message || err}`);
    } finally {
      setEditBusy(false);
    }
  };
  const confirmRemoveAction = () => {
    const cr = confirmRemove;
    setConfirmRemove(null);
    if (cr) doRemoveWorker(cr.target);
  };

  // Datos de cuenta y grupo de la ficha del trabajador: con estos entra quien
  // se agrega a la nómina, y contra estos compara Recalcular.
  const workerByKey = (key) => workers.find((w) => w.id === key) || workers.find((w) => w.rut === key);
  const profileForAgg = (a) => {
    const w = workerByKey(a.workerId || a.rut) || workers.find((x) => x.id === a.rut);
    return w ? liveProfileOf(w) : null;
  };

  // Agregar ciclos o labores (de la misma u otra subfaena) a una nómina ya
  // creada. `selection` es [{ cycleId, laborIds }]: se eligen las labores, y
  // un ciclo que ya está en la nómina con algunas aparece con las que le
  // faltan. La cuenta vive en `planAddWorkdays` (src/utils/payrollItem.js):
  // quien ya está suma la producción y los anticipos pendientes que esta
  // nómina no le tocaba; quien no está entra con el reparto completo.
  const [addCyclesOpen, setAddCyclesOpen] = useState(false);
  const handleAddCycles = async (selection) => {
    if (!selection?.length || editBusy) return;
    setEditBusy(true);
    try {
      const chosenLabors = new Map(selection.map((s) => [s.cycleId, new Set(s.laborIds)]));
      const cycleIdsToAdd = [...chosenLabors.keys()];
      const selectedCycles = cycles.filter((c) => chosenLabors.has(c.id));
      const laborTypeById = new Map();
      for (const cycle of selectedCycles) {
        for (const labor of cycle.labors || []) laborTypeById.set(labor.id, labor.type);
      }

      // Directo de Firestore, sin caché: de acá sale lo que se etiqueta.
      const newWorkdays = [];
      for (let i = 0; i < cycleIdsToAdd.length; i += 10) {
        const chunk = cycleIdsToAdd.slice(i, i + 10);
        const wds = await workdaysService.list({ wheres: [["cycleId", "in", chunk]] });
        for (const wd of wds) {
          if (wd.payrollId) continue;
          if (String(wd.workerRut || "").startsWith("TEMP-")) continue;
          if (!chosenLabors.get(wd.cycleId)?.has(wd.laborId)) continue;
          newWorkdays.push(wd);
        }
      }
      const pendingAdvances = await listPendingForWorkers(
        aggregateWorkerAmounts(newWorkdays, laborTypeById).map(resolveCurrentRut(workers)),
      );
      const plan = planAddWorkdays({
        items,
        workdays: newWorkdays,
        laborTypeById,
        pendingAdvances,
        profileFor: profileForAgg,
      });
      if (plan.workdayIds.length === 0) {
        toast.warning("No hay producción disponible para agregar en esas labores (ya está en otra nómina o no tiene monto).");
        return;
      }

      // El período de cada ciclo es el de los días que se agregan; en uno que
      // ya estaba, el servicio lo estira para cubrirlos.
      const includedIds = new Set(plan.workdayIds);
      const addedWorkdays = newWorkdays.filter((wd) => includedIds.has(wd.id));
      const cycleDetailsToAdd = withPaidPeriods(selectedCycles.map((c) => {
        const detail = cycleDetailOf(c, { faenas, subfaenas });
        const allLaborIds = (c.labors || []).map((l) => l.id);
        const laborIds = allLaborIds.filter((id) => chosenLabors.get(c.id).has(id));
        // Entero solo si es nuevo en la nómina y se eligieron todas sus
        // labores; si no, Recalcular traería después lo que se dejó afuera.
        const alreadyIn = cycleDetails.some((cd) => cd.id === c.id);
        return !alreadyIn && laborIds.length === allLaborIds.length ? detail : { ...detail, laborIds };
      }), addedWorkdays);

      const aggregates = await addWorkdaysToPayroll(payroll.id, {
        items: plan.items,
        cycleDetailsToAdd,
        workdayIds: plan.workdayIds,
        workdays: addedWorkdays,
        advanceApplications: plan.newAdvanceApplications,
      });
      const advanceById = new Map(pendingAdvances.map((a) => [a.id, a]));
      await extendSnapshot(payroll.id, {
        items: plan.items,
        aggregates,
        cycles: cycleDetailsToAdd.map((cd) => snapshotCycleOf(cd, selectedCycles.find((c) => c.id === cd.id))),
        workdays: addedWorkdays.map(snapshotWorkdayOf),
        advances: plan.newAdvanceApplications
          .map((x) => advanceById.get(x.advanceId))
          .filter(Boolean)
          .map(snapshotAdvanceOf),
      });

      setAddCyclesOpen(false);
      await onChanged?.();
      toast.success(additionSummary(`${selectedCycles.length} ciclo(s) agregado(s) a la nómina.`, plan.added));
    } catch (err) {
      toast.error(`Error al agregar ciclos: ${err?.message || err}`);
    } finally {
      setEditBusy(false);
    }
  };

  // Agregar los días puntuales de una persona, de cualquier ciclo abierto,
  // esté o no en la nómina. Un ciclo que entra solo por estos días queda con
  // `laborIds: []`: Recalcular no trae nada más de ahí, solo refresca lo que
  // se agregó.
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const handleAddWorkerDays = async ({ worker, workdayIds }) => {
    if (!worker || !workdayIds?.length || editBusy) return;
    setEditBusy(true);
    try {
      const keys = workerKeys(worker);
      // Se releen: entre que se abrió el modal y ahora, otra nómina pudo
      // tomar alguno de esos días.
      const freshWorkdays = await workdaysService.list({ wheres: [["workerRut", "in", keys]] });
      const { libres: freeWorkdays, tomadas: takenCount } = stillFreeWorkdays(freshWorkdays, workdayIds);
      if (freeWorkdays.length === 0) {
        toast.error("Esos días ya no están disponibles: los tomó otra nómina.");
        return;
      }
      const person = asPayrollWorker({
        items,
        keys: keys,
        fallbackKey: worker.id,
        rut: worker.rut || worker.id,
        workdays: freeWorkdays,
        advances: await listPendingForWorkers(keys),
      });
      const laborTypeById = new Map(cycles.flatMap((c) => (c.labors || []).map((l) => [l.id, l.type])));
      const plan = planAddWorkdays({
        items,
        workdays: person.workdays,
        laborTypeById,
        pendingAdvances: person.advances,
        profileFor: () => liveProfileOf(worker),
      });
      if (plan.workdayIds.length === 0) {
        toast.warning("Lo elegido suma $0 y esta persona no está en la nómina: no hay nada que pagarle.");
        return;
      }

      const alreadyInIds = new Set([...cycleDetails.map((c) => c.id), ...(payroll.cycleIds || [])]);
      const newCycles = [...new Set(freeWorkdays.map((wd) => wd.cycleId))]
        .filter((cid) => !alreadyInIds.has(cid))
        .map((cid) => cycles.find((c) => c.id === cid))
        .filter(Boolean);
      const includedIds = new Set(plan.workdayIds);
      const addedWorkdays = freeWorkdays.filter((wd) => includedIds.has(wd.id));
      const cycleDetailsToAdd = withPaidPeriods(
        newCycles.map((c) => ({ ...cycleDetailOf(c, { faenas, subfaenas }), laborIds: [] })),
        addedWorkdays,
      );

      const aggregates = await addWorkdaysToPayroll(payroll.id, {
        items: plan.items,
        cycleDetailsToAdd,
        workdayIds: plan.workdayIds,
        workdays: addedWorkdays,
        advanceApplications: plan.newAdvanceApplications,
      });
      const advanceById = new Map(person.advances.map((a) => [a.id, a]));
      await extendSnapshot(payroll.id, {
        items: plan.items,
        aggregates,
        cycles: cycleDetailsToAdd.map((cd) => snapshotCycleOf(cd, newCycles.find((c) => c.id === cd.id))),
        workdays: addedWorkdays.map(snapshotWorkdayOf),
        advances: plan.newAdvanceApplications
          .map((x) => advanceById.get(x.advanceId))
          .filter(Boolean)
          .map(snapshotAdvanceOf),
      });

      setAddWorkerOpen(false);
      await onChanged?.();
      const dayCount = new Set(freeWorkdays.map((wd) => `${wd.cycleId}|${wd.laborId}|${wd.date}`)).size;
      toast.success(
        additionSummary(`${dayCount} día(s) de ${worker.name || "la persona"} agregado(s) a la nómina.`, plan.added) +
          (takenCount > 0 ? ` ${takenCount} jornada(s) ya no estaban disponibles y quedaron afuera.` : ""),
      );
    } catch (err) {
      toast.error(`Error al agregar a la persona: ${err?.message || err}`);
    } finally {
      setEditBusy(false);
    }
  };
  return {
    addCyclesOpen,
    addWorkerOpen,
    confirmRemove,
    confirmRemoveAction,
    editBusy,
    editMode,
    handleAddCycles,
    handleAddWorkerDays,
    handleRemoveWorker,
    isPending,
    setAddCyclesOpen,
    setAddWorkerOpen,
    setConfirmRemove,
    setEditMode,
  };
}
