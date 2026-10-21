import { writeBatch, doc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { createService } from "./firestoreBase";
import { invalidate } from "./cache";
import { logAction } from "./logger";

// Contratos y honorarios de los trabajadores (`employments`) y las empresas
// empleadoras (`employers`). Las altas y ediciones de a uno pasan por el
// servicio común; las acciones masivas escriben en lotes con un solo registro
// de auditoría.

const COLLECTION = "employments";

export const employersService = createService("employer", "employers");
export const employmentsService = createService("employment", COLLECTION);

// Los empleadores son pocos y cambian poco: un día en caché, también en
// `localStorage`.
export const EMPLOYERS_LIST = { order: ["name", "asc"], cache: true, persist: true, ttl: 24 * 60 * 60 * 1000 };

const EMPLOYMENTS_TTL = 2 * 60 * 60 * 1000;

// Los períodos vigentes desde una fecha: los que no tienen término y los que
// terminan ese día o después. Son dos consultas por un solo campo (sin índice
// compuesto) y ninguna lee la colección entera. Las comparten Trabajadores y
// la grilla del ciclo, en caché por 2 horas.
export async function listEmploymentsFrom(date) {
  const opts = { cache: true, persist: true, ttl: EMPLOYMENTS_TTL };
  const [open, ending] = await Promise.all([
    employmentsService.list({ wheres: [["endDate", "==", ""]], ...opts }),
    employmentsService.list({ wheres: [["endDate", ">=", date]], ...opts }),
  ]);
  const byId = new Map([...open, ...ending].map((e) => [e.id, e]));
  return [...byId.values()];
}

// Todos los períodos de una persona, del más nuevo al más antiguo.
export async function listWorkerEmployments(workerId) {
  const list = await employmentsService.list({ wheres: [["workerId", "==", workerId]] });
  return list.sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
}

// Todos los períodos de varias personas, para revisar que uno nuevo no se
// cruce. `in` acepta hasta 30 valores por consulta.
export async function listEmploymentsOfWorkers(workerIds) {
  const ids = [...new Set(workerIds)].filter(Boolean);
  const out = [];
  for (let i = 0; i < ids.length; i += 30) {
    out.push(...(await employmentsService.list({ wheres: [["workerId", "in", ids.slice(i, i + 30)]] })));
  }
  return out;
}

// Contratos terminados con el finiquito pendiente o solicitado, y los que
// quedaron listos desde `doneSince`.
export async function listSettlements(doneSince) {
  const [open, done] = await Promise.all([
    employmentsService.list({ wheres: [["settlementStatus", "in", ["pending", "requested"]]] }),
    employmentsService.list({ wheres: [["settlementDoneAt", ">=", doneSince]] }),
  ]);
  const byId = new Map([...open, ...done].map((e) => [e.id, e]));
  return [...byId.values()];
}

const CHUNK = 450;

async function commitInChunks(writes) {
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + CHUNK)) w(batch);
    await batch.commit();
  }
}

const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null });

// Crea los períodos de un plan de `planStartEmployments` (`utils/employment.js`)
// y deja un solo registro de auditoría con los ids, el tipo, el empleador y
// la fecha. Devuelve los períodos creados, con su id.
export async function startEmployments(drafts) {
  const uid = auth.currentUser?.uid || null;
  const created = drafts.map((d) => ({ id: doc(collection(db, COLLECTION)).id, ...d }));
  await commitInChunks(
    created.map(({ id, ...data }) => (batch) =>
      batch.set(doc(db, COLLECTION, id), { ...data, createdAt: serverTimestamp(), createdBy: uid, ...stamp() }),
    ),
  );
  invalidate(COLLECTION);
  const first = drafts[0] || {};
  await logAction({
    action: "bulkStart",
    entity: "employment",
    entityId: null,
    meta: { ids: created.map((e) => e.id), count: created.length, type: first.type || null, employerId: first.employerId || null, startDate: first.startDate || null },
  });
  return created;
}

// Escribe un plan de `planEndEmployments` y deja un solo registro de auditoría.
export async function endEmployments(updates, { endDate, endReason }) {
  await commitInChunks(updates.map(({ id, patch }) => (batch) => batch.update(doc(db, COLLECTION, id), { ...patch, ...stamp() })));
  invalidate(COLLECTION);
  await logAction({
    action: "bulkEnd",
    entity: "employment",
    entityId: null,
    meta: { ids: updates.map((u) => u.id), count: updates.length, endDate, endReason },
  });
}

// Cambia el estado del finiquito de varios contratos. `requested` anota la
// fecha de solicitud y `done` la fecha en que quedó listo.
export async function setSettlementStatus(ids, status, date) {
  const patch = { settlementStatus: status };
  if (status === "requested") patch.settlementRequestedAt = date;
  if (status === "done") patch.settlementDoneAt = date;
  await commitInChunks(ids.map((id) => (batch) => batch.update(doc(db, COLLECTION, id), { ...patch, ...stamp() })));
  invalidate(COLLECTION);
  await logAction({ action: "settlement", entity: "employment", entityId: null, meta: { ids, count: ids.length, status, date } });
}
