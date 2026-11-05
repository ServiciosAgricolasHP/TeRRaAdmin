import { doc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { cyclesService, subjobsService, workdaysService } from "./index";
import { commitInChunks } from "./batchWrites";
import { logAction } from "./logger";
import { movedWorkday } from "../utils/cycleCreation";

// Una jornada movida se escribe en su id nuevo y se borra del viejo en el
// mismo lote: dos operaciones.
const MOVES_PER_BATCH = 225;

// Escribe jornadas en lotes (`commitInChunks`): cada una cuesta su escritura,
// sin la lectura y el registro de auditoría que pone `workdaysService` en
// cada una. Quien llama deja un solo registro por toda la acción.
// - `sets`: `{ id, data, isNew, merge }`. Toda escritura lleva `updatedAt`
//   (las copias del Calendario se ponen al día con él); una nueva, además,
//   `createdAt`.
// - `deletes`: los ids que se borran.
// - `moves`: `{ fromId, toId, data }`, la jornada escrita en su id nuevo y
//   borrada del viejo en el mismo lote: nunca queda en los dos ni en ninguno.
// `onProgress(done, total)` después de cada lote. Al terminar borra la caché
// de jornadas.
export async function writeWorkdays({ sets = [], deletes = [], moves = [], onProgress }) {
  const uid = auth.currentUser?.uid || null;
  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: uid });
  const ref = (id) => doc(db, "workdays", id);
  const writes = [
    ...sets.map((s) => (batch) => {
      const data = { ...s.data, ...(s.isNew ? { createdAt: serverTimestamp(), createdBy: uid } : {}), ...stamp() };
      if (s.merge) batch.set(ref(s.id), data, { merge: true });
      else batch.set(ref(s.id), data);
    }),
    ...deletes.map((id) => (batch) => batch.delete(ref(id))),
  ];
  const total = writes.length + moves.length;
  await commitInChunks(writes, (done) => onProgress?.(done, total));
  await commitInChunks(
    moves.map((m) => (batch) => {
      batch.set(ref(m.toId), { ...m.data, ...stamp() });
      batch.delete(ref(m.fromId));
    }),
    (done) => onProgress?.(writes.length + done, total),
    MOVES_PER_BATCH,
  );
  workdaysService.invalidate();
}

// Elimina en cascada ciclos con sus jornadas, y las subfaenas que se pidan:
// las jornadas en lotes y después cada ciclo y cada subfaena, con su propio
// registro. Las jornadas dejan uno solo, `cascadeDelete`, a nombre de lo que
// se eliminó (`entity`, `entityId`: la faena o el ciclo). Quien llama ya
// revisó que ninguna jornada esté en una nómina.
//
// `onProgress({ stage, done, total })`: "workdays" (con `done` y `total`) y
// "cycles".
export async function deleteCascade({ entity, entityId, cycles, subjobs = [], workdays, onProgress = () => {} }) {
  const ids = workdays.map((w) => w.id);
  onProgress({ stage: "workdays", done: 0, total: ids.length });
  await writeWorkdays({ deletes: ids, onProgress: (done, total) => onProgress({ stage: "workdays", done, total }) });
  onProgress({ stage: "cycles" });
  for (const c of cycles) await cyclesService.remove(c.id);
  for (const s of subjobs) await subjobsService.remove(s.id);
  if (ids.length) {
    const byCycle = {};
    for (const w of workdays) byCycle[w.cycleId] = (byCycle[w.cycleId] || 0) + 1;
    await logAction({ action: "cascadeDelete", entity, entityId, meta: { workdays: ids.length, byCycle } });
  }
}

// Mueve al ciclo nuevo las jornadas de las labores que se importaron de otro
// ciclo (`labors`: `[{ from, to }]`, los ids de la labor en cada uno), solo
// las de los días elegidos (`days`, un Set). Las que están en una nómina
// quedan en el origen. Cada una se recrea con su id nuevo (`movedWorkday`,
// utils/cycleCreation.js) y se borra del origen en el mismo lote. Deja un solo
// registro, `workdaysMove`, a nombre del ciclo nuevo.
//
// `onProgress({ stage, done, total })`: "read" y "move" (con `done` y
// `total`). Devuelve `{ moved, skippedPaid }`.
export async function moveWorkdaysToCycle({ fromCycleId, toCycleId, labors, days, onProgress = () => {} }) {
  onProgress({ stage: "read" });
  const moves = [];
  let skippedPaid = 0;
  for (const { from, to } of labors) {
    const wds = await workdaysService.list({ wheres: [["cycleId", "==", fromCycleId], ["laborId", "==", from]] });
    for (const w of wds) {
      if (!days.has(w.date)) continue;
      if (w.payrollId) { skippedPaid += 1; continue; }
      const target = movedWorkday(w, toCycleId, to);
      moves.push({ fromId: w.id, toId: target.id, data: target.data });
    }
  }
  onProgress({ stage: "move", done: 0, total: moves.length });
  await writeWorkdays({ moves, onProgress: (done, total) => onProgress({ stage: "move", done, total }) });
  if (moves.length) {
    await logAction({ action: "workdaysMove", entity: "cycle", entityId: toCycleId, meta: { fromCycleId, moved: moves.length, skippedPaid } });
  }
  return { moved: moves.length, skippedPaid };
}
