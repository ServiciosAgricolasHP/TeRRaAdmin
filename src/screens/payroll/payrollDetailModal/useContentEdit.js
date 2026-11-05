import { useState } from "react";
import { fmtCurrency } from "../../../utils/format";
import { removeWorkerFromPayroll, addWorkdaysToPayroll } from "../../../services/payrollsService";
import { liveProfileOf } from "../../../services/payrollRecalc";
import { workdaysService } from "../../../services";
import { listPendingForWorkers } from "../../../services/advancesService";
import { planAddWorkdays, withPaidPeriods, cycleDetailOf, stillFreeWorkdays, asPayrollWorker } from "../../../utils/payrollItem";
import { extendSnapshot, snapshotCycleOf, snapshotWorkdayOf, snapshotAdvanceOf } from "../../../services/payrollSnapshots";
import { workerKeys } from "../../../services/workersService";
import { attempt } from "../../../utils/attempt";
import { progressOf } from "./progressSteps";

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

// Los pasos de sacar y de agregar a una persona, con el tramo de la barra de
// cada uno (`progressOf`). Sacar deshace: lleva el gato que persigue su cola.
const REMOVE_STEPS = {
  untag: { step: "Soltando sus jornadas...", unit: "Jornadas", from: 5, to: 60 },
  advances: { step: "Devolviendo sus anticipos y bonos...", from: 65, to: 65 },
  payroll: { step: "Guardando la nómina...", from: 75, to: 75 },
  snapshot: { step: "Guardando el JSON de la nómina...", from: 85, to: 85 },
};
const ADD_STEPS = {
  read: { step: "Revisando sus días y anticipos...", from: 5, to: 5 },
  payroll: { step: "Guardando la nómina...", from: 20, to: 20 },
  tag: { step: "Etiquetando las jornadas...", unit: "Jornadas", from: 25, to: 70 },
  advances: { step: "Aplicando anticipos y bonos...", from: 75, to: 75 },
  snapshot: { step: "Guardando el JSON de la nómina...", from: 85, to: 85 },
};

// "✂ Editar contenido" de una nómina pendiente: sacar a un trabajador y
// agregar los días de una persona. Los ciclos y labores se cambian con
// "✎ Editar ciclos" (`usePayrollRecalc`).
export function useContentEdit({ cycleDetails, cycles, faenas, items, onChanged, payroll, subfaenas, toast }) {
  // Modo edición: sacar un trabajador, agregar personas y editar los ciclos.
  // Solo con la nómina pendiente.
  const isPending = payroll.status !== "paid";
  const [editMode, setEditMode] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  // El gato con la barra (`ProgressOverlay`) mientras saca o agrega.
  const [editProgress, setEditProgress] = useState(null);
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
    const show = (info) => setEditProgress(info && { ...info, undo: true });
    show({ step: REMOVE_STEPS.untag.step, detail: "", percent: 2 });
    const { error: err } = await attempt(async () => {
      await removeWorkerFromPayroll(payroll.id, item.rut, (key, done, total) => {
        const info = progressOf(REMOVE_STEPS, key, done, total);
        if (info) show(info);
      });
      show({ step: "Actualizando...", detail: "", percent: 95 });
      await onChanged?.();
      show({ step: "Listo ✓", detail: "", percent: 100 });
    });
    if (err) toast.error(`Error al sacar el trabajador: ${err?.message || err}`);
    setTimeout(() => setEditProgress(null), err ? 0 : 400);
    setEditBusy(false);
  };
  const confirmRemoveAction = () => {
    const cr = confirmRemove;
    setConfirmRemove(null);
    if (cr) doRemoveWorker(cr.target);
  };

  // Agregar los días puntuales de una persona, de cualquier ciclo abierto,
  // esté o no en la nómina. Un ciclo que entra solo por estos días queda con
  // `laborIds: []`: Recalcular no trae nada más de ahí, solo refresca lo que
  // se agregó.
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const handleAddWorkerDays = async ({ worker, workdayIds }) => {
    if (!worker || !workdayIds?.length || editBusy) return;
    setEditBusy(true);
    const step = (key, done, total) => setEditProgress((prev) => progressOf(ADD_STEPS, key, done, total) || prev);
    step("read");
    const { error: err } = await attempt(async () => {
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
      }, step);
      step("snapshot");
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

      setEditProgress({ step: "Actualizando...", detail: "", percent: 95 });
      setAddWorkerOpen(false);
      await onChanged?.();
      setEditProgress({ step: "Listo ✓", detail: "", percent: 100 });
      const dayCount = new Set(freeWorkdays.map((wd) => `${wd.cycleId}|${wd.laborId}|${wd.date}`)).size;
      toast.success(
        additionSummary(`${dayCount} día(s) de ${worker.name || "la persona"} agregado(s) a la nómina.`, plan.added) +
          (takenCount > 0 ? ` ${takenCount} jornada(s) ya no estaban disponibles y quedaron afuera.` : ""),
      );
    });
    if (err) toast.error(`Error al agregar a la persona: ${err?.message || err}`);
    setTimeout(() => setEditProgress(null), err ? 0 : 400);
    setEditBusy(false);
  };
  return {
    addWorkerOpen,
    confirmRemove,
    confirmRemoveAction,
    editBusy,
    editMode,
    editProgress,
    handleAddWorkerDays,
    handleRemoveWorker,
    isPending,
    setAddWorkerOpen,
    setConfirmRemove,
    setEditMode,
  };
}
