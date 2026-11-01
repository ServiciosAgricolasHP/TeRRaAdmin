import { cyclesService, jobsService, subjobsService } from "./index";
import { createSyncedList } from "./syncedList";

// Faenas, subfaenas y ciclos: listas sincronizadas (`createSyncedList`) que
// comparten todas las pantallas. Se leen enteras una vez por semana en cada
// navegador, o cuando el conteo no calza con la copia (se eliminó uno en otro
// equipo), y entre medio se ponen al día con lo que cambió. Las escrituras de
// este equipo las corrigen en su lugar (`additive`, services/index.js). Una
// pantalla que filtra (las subfaenas o los ciclos de una faena) filtra la
// copia, sin una consulta propia.
const SYNC_OPTS = { fullEveryDays: 7, checkCount: true };

// Las faenas y subfaenas, por nombre. Los ciclos, sin orden: un `orderBy`
// deja afuera los que no tienen ese campo. Quien los quiere del más nuevo al
// más viejo usa `newestFirst` (utils/syncedList.js).
const jobsList = createSyncedList(jobsService, { ...SYNC_OPTS, order: ["name", "asc"], syncKey: "faenas.sync" });
const subjobsList = createSyncedList(subjobsService, { ...SYNC_OPTS, order: ["name", "asc"], syncKey: "subfaenas.sync" });
const cyclesList = createSyncedList(cyclesService, { ...SYNC_OPTS, syncKey: "cycles.sync" });

// La lista y cuántas lecturas costó (0 si salió de la copia).
export const syncJobs = (opts) => jobsList.sync(opts);
export const listJobs = (opts) => jobsList.list(opts);
export const syncSubjobs = (opts) => subjobsList.sync(opts);
export const listSubjobs = (opts) => subjobsList.list(opts);
export const syncCycles = (opts) => cyclesList.sync(opts);
export const listCycles = (opts) => cyclesList.list(opts);

// Los documentos de `list` con esos ids. Los que no están (creados en otro
// equipo después de la última puesta al día) se leen uno por uno.
export async function pickByIds(list, ids, service) {
  const byId = new Map(list.map((d) => [d.id, d]));
  const missing = ids.filter((id) => !byId.has(id));
  const fetched = await Promise.all(missing.map((id) => service.getById(id)));
  for (const d of fetched) if (d) byId.set(d.id, d);
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
