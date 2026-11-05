import { doc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { cyclesService, workdaysService, workersService } from "./index";
import { syncWorkers } from "./workersService";
import { commitInChunks } from "./batchWrites";
import { logAction } from "./logger";
import { normalizeDayPricesEntry } from "../utils/cosechaCombos";
import { toProperName } from "../utils/nameUtils";
import { ACCOUNT_TYPE_RUT, CASH_BANK_CODE, rutWithoutDv } from "../utils/banks";

// Lo que se guarda de una ficha nueva: el RUT, el nombre y, según
// `newWorkerDefaults`, el líder y el pago en efectivo.
const newWorkerDoc = (c) => ({
  rut: c.rut,
  name: toProperName(c.name),
  ...(c.groupLeader ? { groupLeader: [c.groupLeader] } : {}),
  ...(c.cash ? { bankDetails: [c.rut, rutWithoutDv(c.rut), ACCOUNT_TYPE_RUT, CASH_BANK_CODE] } : {}),
});

// Escribe una importación de cosecha armada con `buildHarvestImportPlan`
// (utils/harvestImport.js), en lotes de 450: las fichas nuevas (con el líder
// y la forma de pago que les toca por su RUT), el RUT y el
// nombre con que trae la empresa a quien se eligió a mano (`fileAliases`) y
// las jornadas que se escriben y se borran. Después pone al día el ciclo (los
// días, las personas de la labor y el monto de los pisos que el día no tenía)
// y deja un solo registro de auditoría. No escribe en un ciclo cerrado: lo
// vuelve a leer antes.
//
// `onProgress({ stage, done, total })` dice en qué va: "check" (revisa el
// ciclo y las fichas nuevas), "write" (los lotes, con `done` y `total`),
// "cycle" y "workers" (pone al día la lista de trabajadores).
//
// Devuelve lo que la pantalla necesita para ponerse al día sin releer: las
// jornadas escritas (con su id) y borradas, los días y las labores del ciclo,
// y los precios por día de la labor.
export async function importHarvest({ cycleId, laborId, plan, fileName, onProgress = () => {} }) {
  onProgress({ stage: "check" });
  const cycle = await cyclesService.getById(cycleId);
  if (!cycle) throw new Error("No se encontró el ciclo.");
  if (cycle.status === "closed") throw new Error("El ciclo está cerrado. Reábrelo para poder importar.");
  const labor = (cycle.labors || []).find((l) => l.id === laborId);
  if (!labor) throw new Error("No se encontró la labor en el ciclo.");

  // Las fichas nuevas. Si ya hay una con ese RUT (otro equipo la creó
  // recién), se usa esa.
  const existing = await Promise.all(plan.creates.map((c) => workersService.getById(c.rut)));
  const creates = plan.creates.filter((_, i) => !existing[i]);

  const uid = auth.currentUser?.uid || null;
  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: uid });
  const written = [];
  const writes = [
    ...creates.map((c) => (batch) =>
      batch.set(doc(db, "worker", c.rut), { ...newWorkerDoc(c), createdAt: serverTimestamp(), createdBy: uid, ...stamp() })),
    ...plan.aliases.map((a) => (batch) =>
      batch.update(doc(db, "worker", a.workerId), { fileAliases: a.fileAliases, ...stamp() })),
    ...plan.writes.map((w) => (batch) => {
      const created = w.isNew ? { createdAt: serverTimestamp(), createdBy: uid } : {};
      batch.set(doc(db, "workdays", w.docId), { ...w.data, ...created, ...stamp() }, { merge: true });
      written.push({ mapKey: w.mapKey, wd: { id: w.docId, ...w.data } });
    }),
    ...plan.deletes.map((d) => (batch) => batch.delete(doc(db, "workdays", d.docId))),
  ];
  onProgress({ stage: "write", done: 0, total: writes.length });
  await commitInChunks(writes, (done) => onProgress({ stage: "write", done, total: writes.length }));
  workdaysService.invalidate();

  // El ciclo, sobre lo que hay ahora en la base.
  onProgress({ stage: "cycle" });
  const days = [...new Set([...(cycle.days || []), ...plan.daysToAdd])].sort();
  const addWorkers = plan.laborWorkersToAdd.filter((w) => !(labor.workers || []).some((x) => x.id === w.id || x.rut === w.rut));
  const labors = (cycle.labors || []).map((l) => (l.id === laborId ? { ...l, workers: [...(l.workers || []), ...addWorkers] } : l));
  const dayPrices = { ...(cycle.dayPrices || {}) };
  const laborPrices = {};
  for (const [date, entry] of Object.entries(dayPrices[laborId] || {})) laborPrices[date] = normalizeDayPricesEntry(entry);
  for (const f of plan.floorConfig) {
    const day = { ...normalizeDayPricesEntry(laborPrices[f.date]) };
    if (f.container == null) {
      if (!(Number(day.piso) > 0)) day.piso = f.amount;
    } else if (!(Number(day.floorByContainer?.[f.container]) > 0)) {
      day.floorByContainer = { ...(day.floorByContainer || {}), [f.container]: f.amount };
    }
    laborPrices[f.date] = day;
  }
  dayPrices[laborId] = laborPrices;
  const patch = {};
  if (plan.daysToAdd.length) patch.days = days;
  if (addWorkers.length) patch.labors = labors;
  if (plan.floorConfig.length) patch.dayPrices = dayPrices;
  if (Object.keys(patch).length) await cyclesService.update(cycleId, patch);

  await logAction({
    action: "harvestImport",
    entity: "cycle",
    entityId: cycleId,
    meta: {
      laborId,
      file: fileName || null,
      written: plan.writes.length,
      deleted: plan.deletes.length,
      blocked: plan.blocked.length + plan.blockedDeletes.length,
      floors: plan.writes.filter((w) => w.data.pisoOnly).length,
      created: creates.map((c) => c.rut),
      aliases: plan.aliases.map((a) => ({ workerId: a.workerId, added: a.added })),
      daysAdded: plan.daysToAdd,
      workersAdded: addWorkers.length,
      floorDays: plan.floorConfig.length,
    },
  });

  // La lista de trabajadores trae las fichas nuevas y las cambiadas. Si no
  // se puede, las trae la próxima puesta al día: la escritura ya está hecha.
  if (creates.length || plan.aliases.length) {
    onProgress({ stage: "workers" });
    try {
      await syncWorkers({ fresh: true });
    } catch {
      /* la lista se pone al día la próxima vez que se pida */
    }
  }

  return {
    written,
    deleted: plan.deletes.map((d) => d.mapKey),
    days,
    labors,
    laborDayPrices: laborPrices,
  };
}
