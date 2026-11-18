import { createAdditiveService } from "./firestoreBase";
import { createSyncedList } from "./syncedList";

// La lista de líderes de grupo (`groupLeader`): el único lugar donde nace un
// grupo. Una ficha solo lleva un líder que está en esta lista.
export const groupLeadersService = createAdditiveService("groupLeader", "groupLeader");

// Una lista sincronizada (`createSyncedList`) que comparten la ficha del
// trabajador, la grilla del ciclo y la revisión de la nómina: un líder creado
// en otro equipo llega con la siguiente puesta al día.
const groupLeadersList = createSyncedList(groupLeadersService, {
  syncKey: "groupLeader.sync",
  fullEveryDays: 7,
  checkCount: true,
});

// `fresh` pone al día sin esperar el minuto.
export const listGroupLeaders = (opts) => groupLeadersList.list(opts);
