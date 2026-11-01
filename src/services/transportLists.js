import { createService } from "./firestoreBase";
import { createSyncedList } from "./syncedList";

// Las vueltas (`transports`), los resúmenes de transporte (`transportPayments`)
// y las quincenas (`transportPayrolls`): listas sincronizadas
// (`createSyncedList`). Se leen enteras una vez por semana en cada navegador,
// o cuando el conteo no calza con la copia (se eliminó una en otro equipo), y
// entre medio se ponen al día con lo que cambió: toda escritura de
// `transportsService` pone `updatedAt`.
//
// Las escrituras no corrigen la copia, salvo las eliminaciones, que la sacan
// de ahí para que el conteo siga calzando. Las pestañas de Transportes la ponen
// al día cada vez que la piden (`transportsService`); el Dashboard ve lo
// escrito con la siguiente puesta al día, como mucho un minuto después.
//
// Sin orden: un `orderBy` deja afuera los que no tienen ese campo.
const SYNC_OPTS = { fullEveryDays: 7, checkCount: true };

export const TRIPS = "transports";
export const PAYMENTS = "transportPayments";
export const FORTNIGHTS = "transportPayrolls";

// Solo para leer: las escrituras van por `transportsService`.
const tripsReader = createService("transport", TRIPS);
const paymentsReader = createService("transportPayment", PAYMENTS);
const fortnightsReader = createService("transportPayroll", FORTNIGHTS);

const tripsList = createSyncedList(tripsReader, { ...SYNC_OPTS, syncKey: "transports.sync" });
const paymentsList = createSyncedList(paymentsReader, { ...SYNC_OPTS, syncKey: "transportPayments.sync" });
const fortnightsList = createSyncedList(fortnightsReader, { ...SYNC_OPTS, syncKey: "transportPayrolls.sync" });

// La lista y cuántas lecturas costó (0 si salió de la copia).
export const syncTrips = (opts) => tripsList.sync(opts);
export const listTrips = (opts) => tripsList.list(opts);
export const syncTransportPayments = (opts) => paymentsList.sync(opts);
export const listTransportPayments = (opts) => paymentsList.list(opts);
export const syncFortnights = (opts) => fortnightsList.sync(opts);
export const listFortnights = (opts) => fortnightsList.list(opts);
