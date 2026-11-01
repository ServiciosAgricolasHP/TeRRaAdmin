import { createService } from "./firestoreBase";
import { createSyncedList } from "./syncedList";

// Los resúmenes de transporte (`transportPayments`) y las quincenas
// (`transportPayrolls`): listas sincronizadas (`createSyncedList`). Se leen
// enteras una vez por semana en cada navegador, o cuando el conteo no calza
// con la copia (se eliminó uno en otro equipo), y entre medio se ponen al día
// con lo que cambió: toda escritura de `transportsService` pone `updatedAt`.
// Lo que se escribe en Transportes llega con la siguiente puesta al día, como
// mucho un minuto después.
//
// Sin orden: un `orderBy` deja afuera los que no tienen ese campo.
const SYNC_OPTS = { fullEveryDays: 7, checkCount: true };

// Solo para leer: las escrituras van por `transportsService`.
const paymentsReader = createService("transportPayment", "transportPayments");
const fortnightsReader = createService("transportPayroll", "transportPayrolls");

const paymentsList = createSyncedList(paymentsReader, { ...SYNC_OPTS, syncKey: "transportPayments.sync" });
const fortnightsList = createSyncedList(fortnightsReader, { ...SYNC_OPTS, syncKey: "transportPayrolls.sync" });

// La lista y cuántas lecturas costó (0 si salió de la copia).
export const syncTransportPayments = (opts) => paymentsList.sync(opts);
export const listTransportPayments = (opts) => paymentsList.list(opts);
export const syncFortnights = (opts) => fortnightsList.sync(opts);
export const listFortnights = (opts) => fortnightsList.list(opts);
