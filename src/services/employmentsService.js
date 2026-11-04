import { doc, collection, serverTimestamp } from "firebase/firestore";
import { writeBatch } from "./readMeter";
import { db, auth } from "../firebase";
import { createAdditiveService } from "./firestoreBase";
import { createSyncedList } from "./syncedList";
import { logAction } from "./logger";
import { listCycles, listJobs } from "./jobLists";
import { fetchWorkdaysInRange } from "./calendarService";
import { earnedByDay, employmentsOf, openFrom, settlementsSince, workedDays } from "../utils/employment";
import { workdayPayAmount } from "../utils/payroll";
import { workerIdResolver } from "../utils/workerRut";

// Contratos y honorarios de los trabajadores (`employments`), las empresas
// empleadoras (`employers`) y las mandantes (`principals`). Las altas y
// ediciones de a uno pasan por el servicio común; las acciones masivas
// escriben en lotes con un solo registro de auditoría.

const COLLECTION = "employments";

export const employersService = createAdditiveService("employer", "employers");
export const principalsService = createAdditiveService("principal", "principals");
export const employmentsService = createAdditiveService("employment", COLLECTION);

// Los períodos, los empleadores y los mandantes son listas sincronizadas
// (`createSyncedList`): la copia del navegador se pone al día con lo que
// cambió en cualquier equipo, como mucho una vez por minuto, y con un conteo
// que la vuelve a leer entera si se eliminó algo en otro equipo. Se leen
// enteras una vez por semana. Las altas y ediciones de a uno la corrigen en
// su lugar (`additive`) y las acciones masivas la ponen al día al terminar.
// Las pantallas filtran la copia, sin consultas propias.
const SYNC_OPTS = { fullEveryDays: 7, checkCount: true };
const employmentsList = createSyncedList(employmentsService, { ...SYNC_OPTS, syncKey: "employments.sync" });
const employersList = createSyncedList(employersService, { ...SYNC_OPTS, order: ["name", "asc"], syncKey: "employers.sync" });
const principalsList = createSyncedList(principalsService, { ...SYNC_OPTS, order: ["name", "asc"], syncKey: "principals.sync" });

// `fresh` pone al día sin esperar el minuto.
export const listEmployments = (opts) => employmentsList.list(opts);
export const listEmployers = (opts) => employersList.list(opts);
export const listPrincipals = (opts) => principalsList.list(opts);

// Los períodos que pueden estar vigentes desde una fecha (`openFrom`). Los
// comparten Contratos, el filtro de Trabajadores, la grilla del ciclo y las
// listas de honorarios e imposiciones.
export async function listEmploymentsFrom(date, opts) {
  return openFrom(await listEmployments(opts), date);
}

// Todos los períodos de una persona, del más nuevo al más antiguo.
export async function listWorkerEmployments(workerId, opts) {
  return employmentsOf(await listEmployments(opts), [workerId]);
}

// Todos los períodos de varias personas, para revisar que uno nuevo no se
// cruce. Pone al día la copia antes de revisar.
export async function listEmploymentsOfWorkers(workerIds) {
  return employmentsOf(await listEmployments({ fresh: true }), workerIds);
}

// Contratos terminados con el finiquito pendiente o solicitado, y los que
// quedaron listos desde `doneSince`.
export async function listSettlements(doneSince, opts) {
  return settlementsSince(await listEmployments(opts), doneSince);
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

// Después de una escritura en lote, la copia trae lo escrito. Si no se puede,
// lo trae la próxima puesta al día: la escritura ya está hecha.
async function catchUp() {
  try {
    await employmentsList.sync({ fresh: true });
  } catch {
    /* la copia se pone al día la próxima vez que se pida */
  }
}

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
  await catchUp();
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
  await catchUp();
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
  await catchUp();
  await logAction({ action: "settlement", entity: "employment", entityId: null, meta: { ids, count: ids.length, status, date } });
}

// Le pone el mismo mandante a varios períodos (`""` se lo quita) y deja un
// solo registro de auditoría.
export async function setPrincipal(ids, principalId) {
  await commitInChunks(ids.map((id) => (batch) => batch.update(doc(db, COLLECTION, id), { principalId, ...stamp() })));
  await catchUp();
  await logAction({ action: "setPrincipal", entity: "employment", entityId: null, meta: { ids, count: ids.length, principalId } });
}

// Lo que hace falta para contar días en un rango: los días trabajados de cada
// persona por faena (`workedDays`), lo ganado cada día (`earnedByDay`), los
// contratos y honorarios vigentes en el rango, y las faenas con su nombre. Las jornadas se leen enteras (una lectura
// por jornada); `reads` dice cuántas fueron. La usan las listas de honorarios
// y de imposiciones.
export async function loadWorkedDays(from, to, workers) {
  const [workdays, cycles, faenas, employments] = await Promise.all([
    fetchWorkdaysInRange(from, to),
    listCycles(),
    listJobs(),
    listEmploymentsFrom(from),
  ]);
  const faenaOfCycle = new Map(cycles.map((c) => [c.id, c.faenaId || ""]));
  const laborTypeOf = new Map(cycles.flatMap((c) => (c.labors || []).map((l) => [`${c.id}|${l.id}`, l.type])));
  const names = new Map(faenas.map((f) => [f.id, f.name || ""]));
  const workerIdOf = workerIdResolver(workers);
  return {
    worked: workedDays(workdays, faenaOfCycle, { workerIdOf }),
    earned: earnedByDay(workdays, { workerIdOf, amountOf: (wd) => workdayPayAmount(wd, laborTypeOf.get(`${wd.cycleId}|${wd.laborId}`)) }),
    employments,
    faenas: faenas.map((f) => ({ id: f.id, name: f.name || "" })).sort((a, b) => a.name.localeCompare(b.name, "es")),
    faenaNameOf: (id) => names.get(id) || "",
    reads: workdays.length,
  };
}
