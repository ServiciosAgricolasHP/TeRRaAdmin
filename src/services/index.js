import { createService, createAdditiveService } from "./firestoreBase";

// Faenas, subfaenas y ciclos: ver `listJobs`, `listSubjobs` y `listCycles` en
// jobLists.js.
export const jobsService = createAdditiveService("faena", "faenas");
export const subjobsService = createAdditiveService("subfaena", "subfaenas");
export const cyclesService = createAdditiveService("cycle", "cycles");

// Trabajadores: ver `listWorkers` en workersService.js.
export const workersService = createAdditiveService("worker", "worker");

export const workdaysService = createService("workday", "workdays");

// Interruptor del registro de lecturas (`readLogConfig/main`, ver readMeter.js).
export const readLogConfigService = createService("readLogConfig", "readLogConfig");
// Lo que anotó el registro de lecturas, un documento por persona y día. Solo
// lo lee el informe de la Consola admin.
export const readLogsService = createService("readLog", "readLogs");

// Los workdays de un ciclo, la consulta más repetida de la app (Nómina y el
// resumen de producción por faena). Las pantallas pasan por acá para compartir
// la clave de caché `workdays::{wheres,order,take}` y el TTL: cualquier
// diferencia en cómo se escribe la consulta forma otra clave, y el TTL lo sella
// el último que escribe la entrada.
//
// Un minuto, porque de estos documentos sale lo que se le paga a la gente:
// alcanza para que dos lecturas seguidas de un mismo flujo no se paguen dos
// veces, sin armar una nómina sobre datos viejos. Cualquier escritura por
// `workdaysService` invalida el scope completo.
export const WORKDAYS_BY_CYCLE_TTL = 60_000;

export function listWorkdaysByCycle(cycleId) {
  return workdaysService.list({
    wheres: [["cycleId", "==", cycleId]],
    cache: true,
    ttl: WORKDAYS_BY_CYCLE_TTL,
  });
}

// Los workdays de varios ciclos en un solo array plano, sin repetir ciclos.
export async function listWorkdaysByCycles(cycleIds) {
  const uniq = [...new Set(cycleIds)].filter(Boolean);
  const porCiclo = await Promise.all(uniq.map((id) => listWorkdaysByCycle(id)));
  return porCiclo.flat();
}
export const groupLeadersService = createService("groupLeader", "groupLeader");
export const payrollSnapshotsService = createService("payrollSnapshot", "payrollSnapshots");
export const interestLinksService = createService("interestLink", "interestLinks");

// Perfiles de la app (doc id = uid de Firebase). `AuthContext` lee el doc del
// usuario logueado directo; este servicio es para las pantallas de admin que
// necesitan la lista completa o escribir en un perfil ajeno.
export const usersService = createService("user", "users");
// Empresas emisoras/receptoras, cada una con su RUT, razón social y alias.
// Los DTE se separan por `companyId`, así no chocan los folios entre empresas
// (un mismo proveedor puede facturarles a varias con el mismo folio).
export const companiesService = createService("company", "companies");

// Documentos tributarios electrónicos (DTE) importados desde el SII
// (`source: "sii_import"`). El doc id es determinístico
// (`{companyId}_V_{tipo}_{folio}` para ventas; `{companyId}_C_{rutProveedorSinDV}_{tipo}_{folio}`
// para compras), así reimportar el mismo período es idempotente: escribe
// encima del existente sin duplicar.
// Ver `listDteDocuments` en dteDocumentsList.js.
export const dteDocumentsService = createAdditiveService("dteDocument", "dteDocuments");
export { tripsService as transportsService, paymentsService as transportPaymentsService } from "./transportsService";
export const logsService = createService("log", "logs");

// Fichas de "Agenda y Cuentas" — libreta compartida de contactos (persona
// o empresa) con datos bancarios de fácil acceso para copiar/pegar. Modelo
// independiente: no se vincula a `worker` ni `companies`; el usuario crea sus
// propias fichas. Ver `src/screens/InfoAccounts.jsx`.
export const contactCardsService = createService("contactCard", "contactCards");

// Indicadores del banner (sueldo base, valor día, valor hora extra). Se editan
// manualmente desde el header y se muestran tipo ticker del dólar. Un único doc
// `indicators/main` con los 3 valores.
export const indicatorsService = createService("indicator", "indicators");

// Pesajes de cosecha escaneados por QR (app scan_IS) — colección plana,
// log de eventos (N por trabajador por día). Fuente de verdad; nunca se edita
// desde acá, solo se lee para sincronizar hacia `workdays`. Ver HarvestQr.jsx.
export const harvestWeightsService = createService("harvestWeight", "harvestWeights");

// Config/puente entre un prefijo de QR físico y el (faena, ciclo, labor)
// vigente al que debe sincronizarse. Doc id = el prefijo (ej. "HP"). El
// ciclo/labor vigente se reapunta a mano cada vez que se abre un ciclo nuevo
// — deliberadamente semi-manual, ver HarvestQr.jsx.
export const qrPrefixesService = createService("qrPrefix", "qrPrefixes");

// Libro de precios — registro contable independiente de faenas/labores y sus
// precios (histórico, incluye faenas "dummy" que no viven en `faenas`). No
// alimenta ni depende de cycles/workdays. Ver PriceBook.jsx.
export const priceBookService = createService("priceBookEntry", "priceBookEntries");
// Config chica y compartida del libro de precios (ej. qué faenas reales se
// esconden del selector porque su nombre no es legible). Un único doc `main`,
// mismo patrón que `indicators/main`.
export const priceBookConfigService = createService("priceBookConfig", "priceBookConfig");

// Centros de costo ficticios para el Libro de Facturación — catálogo global
// (compartido entre empresas) para etiquetar manualmente documentos que no
// calzan con la agrupación por proveedor (ej. "Arriendo", "Mantención").
// "Combustibles" es aparte: se arma solo por el código SII de "otro impuesto"
// y no vive en esta colección. Ver Billing.jsx.
export const costCentersService = createService("costCenter", "costCenters");

// Gastos informales por centro de costo — plata sin factura/boleta formal
// (o con boleta pedida pero nunca ingresada al SII). Puramente informativo:
// NO son dteDocuments, no se mezclan con la data fiscal real, solo se
// muestran dentro de la vista de un centro de costo en Billing.jsx.
export const informalExpensesService = createService("informalExpense", "informalExpenses");

// Grupos de labores entre ciclos, dentro de una subfaena (puede haber varios
// por subfaena: Poda, Riego, etc.). `cycle.labors[].laborGroupId` apunta acá
// sin reemplazar el id local de la labor: workdays y nómina usan
// cycleId+laborId. Ver CycleDetail.jsx (alta/edición de labor).
export const laborGroupsService = createService("laborGroup", "laborGroups");

// Lo que alguien buscó en la ayuda sin encontrarlo, guardado con "Avisar que
// falta". Dice qué guías o secciones faltan.
export const helpQuestionsService = createService("helpQuestion", "helpQuestions");

// Estado editable del resumen de ciclo (tarifas de cobro, overrides por fila,
// títulos), compartido entre usuarios. Servicio propio, no `createService`:
// ver el comentario del archivo.
export { cycleSummariesService } from "./cycleSummariesService";

export { logAction } from "./logger";
