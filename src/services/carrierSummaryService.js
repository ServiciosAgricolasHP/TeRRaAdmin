import { paymentsService, tripsService, fortnightsService } from "./transportsService";
import { cyclesService } from "./index";
import { listJobs, listSubjobs } from "./jobLists";
import { carrierSummaryPayments } from "../utils/carrierSummary";

// Las mismas opciones que la pestaña Resúmenes, así comparten la caché.
const CYCLES_LIST = { cache: true, persist: true, ttl: 5 * 60 * 1000 };

// Lee lo que muestra el resumen de un transportista (`utils/carrierSummary.js`)
// y devuelve `{ payments, fortnightsById, trips, faenaById, subfaenaById,
// cycleById }`. Cuesta:
// - una consulta por sus resúmenes (`carrierId`), una por las quincenas
//   abiertas y una por sus vueltas pendientes, que son las de sus resúmenes
//   pendientes y las que no están en ninguno;
// - una lectura por cada vuelta y quincena pagada que entra. `paidCache` las
//   guarda mientras el modal está abierto, porque lo pagado no cambia;
// - las faenas y subfaenas, de la copia que comparten las pantallas. Los
//   ciclos solo si alguna vuelta no trae su faena ni su subfaena.
export async function loadCarrierSummaryData(carrierId, { includePaid = false, from = "", to = "" } = {}, paidCache = new Map()) {
  const [allPayments, openFortnights, pendingTrips, faenas, subfaenas] = await Promise.all([
    paymentsService.listByCarrier(carrierId),
    fortnightsService.listOpen(),
    tripsService.listByCarrier(carrierId, { onlyPending: true }),
    listJobs(),
    listSubjobs(),
  ]);
  const fortnightsById = new Map(openFortnights.map((q) => [q.id, q]));
  const payments = carrierSummaryPayments(allPayments, {
    openFortnightIds: new Set(fortnightsById.keys()),
    includePaid,
    from,
    to,
  });

  const readOnce = (kind, id, read) => {
    const key = `${kind}:${id}`;
    if (!paidCache.has(key)) paidCache.set(key, read(id).catch(() => null));
    return paidCache.get(key);
  };
  const otherFortnightIds = [...new Set(payments.map((p) => p.payrollId).filter((id) => id && !fortnightsById.has(id)))];
  const pendingIds = new Set(pendingTrips.map((t) => t.id));
  const otherTripIds = [...new Set(payments.flatMap((p) => p.tripIds || []))].filter((id) => !pendingIds.has(id));
  const [otherFortnights, otherTrips] = await Promise.all([
    Promise.all(otherFortnightIds.map((id) => readOnce("fortnight", id, (x) => fortnightsService.getById(x)))),
    Promise.all(otherTripIds.map((id) => readOnce("trip", id, (x) => tripsService.getById(x)))),
  ]);
  for (const q of otherFortnights) if (q) fortnightsById.set(q.id, q);
  const trips = [...pendingTrips, ...otherTrips.filter(Boolean)];

  const cycles = trips.some((t) => !t.faenaId && !t.subfaenaId) ? await cyclesService.list(CYCLES_LIST) : [];
  return {
    payments,
    fortnightsById,
    trips,
    faenaById: new Map(faenas.map((f) => [f.id, f])),
    subfaenaById: new Map(subfaenas.map((s) => [s.id, s])),
    cycleById: new Map(cycles.map((c) => [c.id, c])),
  };
}
