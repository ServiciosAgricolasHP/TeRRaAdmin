import { logsService } from "./index";
import { toDate } from "../utils/auditLogs";

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
// vueltas y resúmenes de un transportista. Un log sin ese campo en `meta` no
// aparece acá; los de la ficha del registro, siempre.
const SATELLITE_ENTITIES = {
  worker: [
    { entity: "workday", field: "meta.workerRut" },
    { entity: "advance", field: "meta.workerRut" },
  ],
  carrier: [
    { entity: "transport", field: "meta.carrierId" },
    { entity: "transportPayment", field: "meta.carrierId" },
  ],
};

async function fetchSatelliteLogs(entityType, recordId) {
  const specs = SATELLITE_ENTITIES[entityType];
  if (!specs || !recordId) return [];
  const results = await Promise.all(
    specs.map((spec) =>
      logsService
        .list({ wheres: [["entity", "==", spec.entity], [spec.field, "==", recordId]] })
        .catch((err) => {
          console.error(`No se pudieron cargar los logs de ${spec.entity}:`, err);
          return [];
        }),
    ),
  );
  return results.flat();
}

// Todo el historial de un registro, sin rango de fechas ni tope, del más
// nuevo al más viejo. La consulta va acotada a entity + entityId, sin orderBy
// para no pedir otro índice compuesto; se ordena en el cliente.
export async function fetchRecordHistory(entityType, recordId) {
  const rows = await logsService.list({
    wheres: [
      ["entity", "==", entityType],
      ["entityId", "==", recordId],
    ],
  });
  // Suma el historial satélite: logs de entidades sin catálogo propio
  // cuyo "dueño" va denormalizado en `meta`:
  //   - worker    → workday, advance        vía meta.workerRut (firestoreBase.js)
  //   - carrier   → transport,              vía meta.carrierId (transportsService.js)
  //                 transportPayment
  const satelliteRows = await fetchSatelliteLogs(entityType, recordId);
  const merged = [...rows, ...satelliteRows];
  merged.sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp));
  return merged;
}
