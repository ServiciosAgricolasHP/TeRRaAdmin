import { doc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { cyclesService, workdaysService } from "./index";
import { advancesService } from "./advancesService";
import { listCycles } from "./jobLists";
import { listEmployments } from "./employmentsService";
import { syncWorkers, workerKeys } from "./workersService";
import { commitInChunks } from "./batchWrites";
import { logAction } from "./logger";
import { mergeBlockers, planWorkerMerge } from "../utils/workerMerge";

// Unir una ficha duplicada (`clone`) a la que queda (`kept`), con el cálculo
// de `utils/workerMerge.js`.

// Los ciclos por id, leídos de nuevo.
async function freshCycles(ids) {
  const list = await Promise.all(ids.map((id) => cyclesService.getById(id)));
  return Object.fromEntries(list.filter(Boolean).map((c) => [c.id, c]));
}

// Lee lo que hace falta para unir: las jornadas del clon (por cualquiera de
// sus RUT), sus anticipos y bonos, sus contratos, los ciclos donde tiene
// jornadas o figura en una labor (leídos de nuevo), y las jornadas de la
// ficha que queda que ya ocupan un id de destino (los choques). Devuelve eso
// y lo que impide unir (`mergeBlockers`).
export async function analyzeWorkerMerge(clone, kept) {
  const keys = workerKeys(clone);
  const [workdays, advances, employments, allCycles] = await Promise.all([
    workdaysService.list({ wheres: [["workerRut", "in", keys]] }),
    advancesService.list({ wheres: [["workerRut", "in", keys]] }),
    listEmployments(),
    listCycles(),
  ]);
  const inRoster = (allCycles || [])
    .filter((c) => (c.labors || []).some((l) => (l.workers || []).some((lw) => lw.id === clone.id || keys.includes(lw.rut))))
    .map((c) => c.id);
  const cycles = await freshCycles([...new Set([...workdays.map((w) => w.cycleId), ...inRoster])].filter(Boolean));
  const targets = planWorkerMerge({ clone, kept, workdays, cycles }).moves.map((m) => m.toId);
  const found = await Promise.all(targets.map((id) => workdaysService.getById(id)));
  const existing = Object.fromEntries(found.filter(Boolean).map((w) => [w.id, w]));
  const cloneEmployments = (employments || []).filter((e) => e.workerId === clone.id);
  return {
    workdays,
    advances,
    employments: cloneEmployments,
    cycles,
    existing,
    blockers: mergeBlockers({ clone, kept, advances, employments: cloneEmployments, workdays, cycles }),
  };
}

// Escribe la unión con lo que leyó `analyzeWorkerMerge` y lo decidido en cada
// choque (`decisions`). Vuelve a leer los ciclos, por si uno se cerró. Cada
// jornada que pasa se escribe en su id nuevo y se borra del clon en el mismo
// lote, así un corte a la mitad no deja la misma jornada dos veces. Las fichas
// se marcan al final: si algo falla antes, el clon sigue a la vista y se
// puede volver a unir. Deja un solo registro de auditoría.
//
// `onProgress({ stage, done, total })`: "check", "write" (con `done` y
// `total`), "cycles" y "workers".
export async function mergeWorkers({ clone, kept, analysis, decisions, onProgress = () => {} }) {
  onProgress({ stage: "check" });
  const cycles = await freshCycles(Object.keys(analysis.cycles));
  const blockers = mergeBlockers({ clone, kept, advances: analysis.advances, employments: analysis.employments, workdays: analysis.workdays, cycles });
  if (blockers.length) throw new Error(blockers[0]);
  const plan = planWorkerMerge({ clone, kept, workdays: analysis.workdays, existing: analysis.existing, cycles, decisions });
  if (plan.unknown.length) throw new Error("Hay jornadas del clon que no se pueden pasar: avísale a quien mantiene TeRRa.");

  const uid = auth.currentUser?.uid || null;
  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: uid });
  const ref = (id) => doc(db, "workdays", id);
  const writes = [
    ...plan.moves.map((m) => (batch) => {
      batch.set(ref(m.toId), { ...m.data, ...stamp() });
      batch.delete(ref(m.fromId));
    }),
    ...plan.conflicts.map((c) => (batch) => {
      const w = plan.writes.find((x) => x.toId === c.toId);
      if (w) batch.set(ref(w.toId), { ...w.data, ...stamp() });
      batch.delete(ref(c.fromId));
    }),
    (batch) => batch.update(doc(db, "worker", kept.id), { ...plan.keptPatch, ...stamp() }),
    (batch) => batch.update(doc(db, "worker", clone.id), { ...plan.clonePatch, mergedAt: serverTimestamp(), mergedBy: uid, ...stamp() }),
  ];
  onProgress({ stage: "write", done: 0, total: writes.length });
  await commitInChunks(writes, (done) => onProgress({ stage: "write", done, total: writes.length }), 200);
  workdaysService.invalidate();

  onProgress({ stage: "cycles" });
  for (const r of plan.rosters) await cyclesService.update(r.cycleId, { labors: r.labors });

  await logAction({
    action: "workerMerge",
    entity: "worker",
    entityId: kept.id,
    meta: {
      cloneId: clone.id,
      cloneRut: clone.rut || clone.id,
      moved: plan.moves.length,
      conflicts: plan.conflicts.map((c) => ({ id: c.toId, choice: c.choice })),
      paidLeft: plan.paid.length,
      cycles: plan.rosters.map((r) => r.cycleId),
    },
  });

  // La lista de trabajadores trae las dos fichas cambiadas. Si no se puede,
  // las trae la próxima puesta al día: la escritura ya está hecha.
  onProgress({ stage: "workers" });
  try {
    await syncWorkers({ fresh: true });
  } catch {
    /* la lista se pone al día la próxima vez que se pida */
  }
  return { plan };
}
