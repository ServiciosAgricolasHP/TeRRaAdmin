import { createAdditiveService } from "./firestoreBase";
import { createSyncedList } from "./syncedList";
import { leaderIndex } from "../utils/groupLeaders";
import { normalizeLeader } from "../utils/payroll";

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

// Deja en la lista, habilitados, los líderes de `names` que no están, sobre la
// lista puesta al día. Un líder que está deshabilitado no se toca. Devuelve los
// nombres, en mayúsculas, que creó y los que están deshabilitados.
export async function ensureGroupLeaders(names) {
  const wanted = [...new Set((names || []).map(normalizeLeader).filter(Boolean))];
  if (!wanted.length) return { created: [], disabled: [] };
  const index = leaderIndex(await listGroupLeaders({ fresh: true }));
  const created = wanted.filter((n) => !index.has(n));
  for (const name of created) await groupLeadersService.create({ name, habilitado: true });
  return { created, disabled: wanted.filter((n) => index.get(n) === false) };
}
