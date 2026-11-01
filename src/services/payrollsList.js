import { payrollsService } from "./payrollsService";
import { createSyncedList } from "./syncedList";
import { newestFirst } from "../utils/syncedList";

// Las nóminas: una lista sincronizada (`createSyncedList`) que comparten
// Nómina, su historial por trabajador y el Dashboard. Se lee entera una vez por
// semana en cada navegador, o cuando el conteo no calza con la copia (se
// eliminó una en otro equipo), y entre medio se pone al día con lo que cambió.
// Las escrituras de este equipo la corrigen en su lugar (`additive`,
// payrollsService.js).
//
// Sin orden en la consulta: un `orderBy` deja afuera las que no tienen ese
// campo. Se entregan de la más nueva a la más vieja (`newestFirst`).
const payrollsList = createSyncedList(payrollsService, {
  syncKey: "payrolls.sync",
  fullEveryDays: 7,
  checkCount: true,
});

// La lista y cuántas lecturas costó (0 si salió de la copia).
export async function syncPayrolls(opts) {
  const { data, reads } = await payrollsList.sync(opts);
  return { data: newestFirst(data), reads };
}

export const listPayrolls = async (opts) => (await syncPayrolls(opts)).data;
