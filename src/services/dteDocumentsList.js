import { dteDocumentsService } from "./index";
import { createSyncedList } from "./syncedList";

// Los documentos del RCV (`dteDocuments`) de todas las empresas, del más nuevo
// al más viejo: una lista sincronizada (`createSyncedList`) que comparten
// Facturación y el Dashboard. Se lee entera una vez por semana en cada
// navegador, o cuando el conteo no calza con la copia (se eliminó uno en otro
// equipo), y entre medio se pone al día con lo que cambió. Las escrituras de
// este equipo la corrigen en su lugar: las de Facturación (`additive`,
// services/index.js) y la importación del SII (`importDteRecords`).
const dteDocumentsList = createSyncedList(dteDocumentsService, {
  order: ["fechaEmision", "desc"],
  syncKey: "dteDocuments.sync",
  fullEveryDays: 7,
  checkCount: true,
});

// La lista y cuántas lecturas costó (0 si salió de la copia).
export const syncDteDocuments = (opts) => dteDocumentsList.sync(opts);

export const listDteDocuments = (opts) => dteDocumentsList.list(opts);
