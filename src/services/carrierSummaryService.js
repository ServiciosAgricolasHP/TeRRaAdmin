import { paymentsService, tripsService, fortnightsService } from "./transportsService";
import { listCycles, listJobs, listSubjobs } from "./jobLists";
import { carrierSummaryPayments } from "../utils/carrierSummary";

// Lee lo que muestra el resumen de un transportista (`utils/carrierSummary.js`)
// y devuelve `{ payments, fortnightsById, trips, faenaById, subfaenaById,
// cycleById }`. Todo sale de copias: las vueltas, los resúmenes y las
// quincenas (services/transportLists.js), puestas al día con unas pocas
// lecturas, y las faenas, subfaenas y ciclos, que comparten las pantallas (los
// ciclos, solo si alguna vuelta no trae su faena ni su subfaena).
//
// Las vueltas son las pendientes del transportista y las de los resúmenes que
// entran. Una quincena o una vuelta eliminada no está en la copia.
export async function loadCarrierSummaryData(carrierId, { includePaid = false, from = "", to = "" } = {}) {
  const [allPayments, fortnights, allTrips, faenas, subfaenas] = await Promise.all([
    paymentsService.listByCarrier(carrierId),
    fortnightsService.listAll(),
    tripsService.listAll(),
    listJobs(),
    listSubjobs(),
  ]);
  const fortnightsById = new Map(fortnights.map((q) => [q.id, q]));
  const payments = carrierSummaryPayments(allPayments, {
    openFortnightIds: new Set(fortnights.filter((q) => q.status === "pending").map((q) => q.id)),
    includePaid,
    from,
    to,
  });

  const pendingTrips = allTrips.filter((t) => t.carrierId === carrierId && t.status === "pending");
  const pendingIds = new Set(pendingTrips.map((t) => t.id));
  const tripById = new Map(allTrips.map((t) => [t.id, t]));
  const otherTrips = [...new Set(payments.flatMap((p) => p.tripIds || []))]
    .filter((id) => !pendingIds.has(id))
    .map((id) => tripById.get(id))
    .filter(Boolean);
  const trips = [...pendingTrips, ...otherTrips];

  const cycles = trips.some((t) => !t.faenaId && !t.subfaenaId) ? await listCycles() : [];
  return {
    payments,
    fortnightsById,
    trips,
    faenaById: new Map(faenas.map((f) => [f.id, f])),
    subfaenaById: new Map(subfaenas.map((s) => [s.id, s])),
    cycleById: new Map(cycles.map((c) => [c.id, c])),
  };
}
