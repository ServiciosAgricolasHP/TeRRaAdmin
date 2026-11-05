import { doc } from "firebase/firestore";
import { db } from "../firebase";
import { cyclesService, workdaysService } from "./index";
import { tripsService } from "./transportsService";
import { commitInChunks } from "./batchWrites";
import { logAction } from "./logger";
import { planLaborClear } from "../utils/laborClear";

// Limpia una labor del ciclo con `planLaborClear` (utils/laborClear.js): lee
// de nuevo el ciclo, todas sus jornadas y sus vueltas, borra las jornadas de
// la labor en lotes de 450 y pone al día las personas de la labor y los días
// del ciclo. Deja un solo registro de auditoría con lo que hizo. No escribe en
// un ciclo cerrado.
//
// `onProgress({ stage, done, total })` dice en qué va: "read", "delete" (con
// `done` y `total`) y "cycle".
//
// Devuelve el plan con que limpió, y los días y las labores del ciclo para
// que la pantalla se ponga al día sin releer.
export async function clearLabor({ cycleId, laborId, onProgress = () => {} }) {
  onProgress({ stage: "read" });
  const cycle = await cyclesService.getById(cycleId);
  if (!cycle) throw new Error("No se encontró el ciclo.");
  if (cycle.status === "closed") throw new Error("El ciclo está cerrado. Reábrelo para poder limpiar una labor.");
  const labor = (cycle.labors || []).find((l) => l.id === laborId);
  if (!labor) throw new Error("No se encontró la labor en el ciclo.");
  const [workdays, trips] = await Promise.all([
    workdaysService.list({ wheres: [["cycleId", "==", cycleId]] }),
    tripsService.listByCycle(cycleId),
  ]);
  const plan = planLaborClear({ cycle, laborId, workdays, trips });

  const deletes = plan.deletes.map((w) => (batch) => batch.delete(doc(db, "workdays", w.id)));
  onProgress({ stage: "delete", done: 0, total: deletes.length });
  await commitInChunks(deletes, (done) => onProgress({ stage: "delete", done, total: deletes.length }));
  workdaysService.invalidate();

  onProgress({ stage: "cycle" });
  const labors = (cycle.labors || []).map((l) => (l.id === laborId ? { ...l, workers: plan.workers } : l));
  const patch = {};
  if (plan.workersRemoved) patch.labors = labors;
  if (plan.daysRemoved.length) patch.days = plan.days;
  if (Object.keys(patch).length) await cyclesService.update(cycleId, patch);

  await logAction({
    action: "laborClear",
    entity: "cycle",
    entityId: cycleId,
    meta: {
      laborId,
      laborName: labor.name || null,
      deleted: plan.deletes.length,
      kept: plan.kept.length,
      workersRemoved: plan.workersRemoved,
      daysRemoved: plan.daysRemoved,
      tripDays: plan.tripDays,
      pendingTrips: plan.pendingTrips.length,
    },
  });

  return { plan, days: plan.days, labors };
}
