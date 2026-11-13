import { logsService } from "./index";
import { toDate } from "../utils/auditLogs";
import { attempt } from "../utils/attempt";
import { indexLinkOf } from "../utils/auditRecord";

// Las consultas de la Auditoría sobre `logs`: un rango de fechas, con tope, y
// el historial completo de un registro.

export const HARD_CAP = 5000;

// Logs del rango [from, to] (inclusive), ordenados por timestamp
// ascendente, con tope HARD_CAP.
export async function fetchLogsInRange(from, to) {
  const raw = await logsService.list({
    wheres: [
      ["timestamp", ">=", from],
      ["timestamp", "<=", to],
    ],
    order: ["timestamp", "asc"],
    take: HARD_CAP,
  });
  return raw;
}

// Historial "satélite": logs de otra entidad que pertenecen a un registro y
// se atribuyen vía `meta`: las jornadas y anticipos de un trabajador, las
// vueltas y resúmenes de un transportista, las jornadas de un ciclo y las
// sincronizaciones de Pesajes QR hacia él. Un log sin ese campo en `meta` no
// aparece acá; los de la ficha del registro, siempre. Las acciones en lote de
// un ciclo (importar cosecha, limpiar labor, pisos) se registran en el ciclo.
const SATELLITE_ENTITIES = {
  worker: [
    { entity: "workday", field: "meta.workerRut" },
    { entity: "advance", field: "meta.workerRut" },
  ],
  carrier: [
    { entity: "transport", field: "meta.carrierId" },
    { entity: "transportPayment", field: "meta.carrierId" },
  ],
  cycle: [
    { entity: "workday", field: "meta.cycleId" },
    { entity: "qrPrefix", field: "meta.cycleId" },
  ],
};

// Lo que pasa dentro de los ciclos de una faena o subfaena: los cambios de cada
// ciclo (sus acciones en lote incluidas), sus jornadas y las sincronizaciones
// de Pesajes QR.
const CYCLE_SCOPE = [
  { entity: "cycle", field: "entityId" },
  { entity: "workday", field: "meta.cycleId" },
  { entity: "qrPrefix", field: "meta.cycleId" },
];

// Firestore acepta hasta 30 valores en un `in`.
const IN_LIMIT = 30;
const chunksOf = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += IN_LIMIT) out.push(list.slice(i, i + IN_LIMIT));
  return out;
};

// Una consulta del historial, por un valor (`==`) o por varios (`in`). Con
// `since` y `until`, solo los logs de ese rango (`until` sin incluir): pide un
// índice compuesto (entity + el campo + timestamp), y si falta, Firestore lo
// dice con el enlace para crearlo.
const historyQuery = (entity, field, values, { since, until }) =>
  logsService.list({
    wheres: [
      ["entity", "==", entity],
      values.length === 1 ? [field, "==", values[0]] : [field, "in", values],
      ...(since ? [["timestamp", ">=", since]] : []),
      ...(until ? [["timestamp", "<", until]] : []),
    ],
  });

// Las consultas del historial de un registro: su ficha primero, después sus
// satélites y, en una faena o subfaena, sus subfaenas y sus ciclos (`scope`,
// ver `recordScope`).
function historySpecs(entityType, recordId, { cycleIds = [], subjobIds = [] }) {
  const specs = [{ entity: entityType, field: "entityId", values: [recordId] }];
  for (const s of SATELLITE_ENTITIES[entityType] || []) specs.push({ ...s, values: [recordId] });
  for (const ids of chunksOf(subjobIds)) specs.push({ entity: "subfaena", field: "entityId", values: ids });
  for (const ids of chunksOf(cycleIds)) for (const s of CYCLE_SCOPE) specs.push({ ...s, values: ids });
  return specs;
}

// El historial de un registro, del más nuevo al más viejo, entre `since` y
// `until` (o todo, sin ellos). Las consultas van sin orderBy para no pedir otro índice;
// se ordena en el cliente. Una consulta a la que le falta su índice no corta
// las demás: su enlace va en `missingIndexes`, una vez por índice.
export async function fetchRecordLogs(entityType, recordId, { since = null, until = null, scope = {} } = {}) {
  const missingIndexes = [];
  const results = await Promise.all(
    historySpecs(entityType, recordId, scope).map(async (spec, i) => {
      const { value, error } = await attempt(() => historyQuery(spec.entity, spec.field, spec.values, { since, until }));
      if (!error) return value;
      const link = indexLinkOf(error);
      if (link) {
        if (!missingIndexes.includes(link)) missingIndexes.push(link);
      } else if (i === 0) throw error;
      else console.error(`No se pudieron cargar los logs de ${spec.entity}:`, error);
      return [];
    }),
  );
  const logs = results.flat();
  logs.sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp));
  return { logs, missingIndexes };
}

// Todo el historial de un registro, sin rango de fechas ni tope, del más
// nuevo al más viejo.
export async function fetchRecordHistory(entityType, recordId) {
  const { logs } = await fetchRecordLogs(entityType, recordId);
  return logs;
}
