import { workersService, workdaysService } from "./index";
import { createSyncedList } from "./syncedList";
import { normalizeRut, validateRut } from "../utils/rutUtils";
import { toProperName } from "../utils/nameUtils";

// Si empieza con un dígito se busca por RUT; si no, por nombre.
export function detectQueryKind(q) {
  const s = String(q || "").trim();
  if (!s) return null;
  return /^\d/.test(s) ? "rut" : "name";
}

// ── La lista completa de trabajadores ────────────────────────────────────────
// Toda pantalla que la necesita la pide con `listWorkers()`. Es una lista
// sincronizada (`createSyncedList`, services/syncedList.js): la copia del
// navegador se pone al día con lo que cambió, y cada puesta al día cuenta los
// trabajadores (4 lecturas por ~3.300) para que entre lo que se creó o se
// eliminó en otro equipo. Se lee entera en un navegador nuevo, si el conteo no
// calza y cada 30 días, por lo que se edite sin `updatedAt` (a mano en la
// consola de Firebase; el escáner, si vuelve a usarse, tiene que mandarlo).
const workersList = createSyncedList(workersService, {
  order: ["name", "asc"],
  syncKey: "workers.sync",
  fullEveryDays: 30,
  checkCount: true,
});

// La lista y cuántas lecturas costó (0 si salió de la copia). `fresh` pone
// al día sin esperar el minuto.
export const syncWorkers = (opts) => workersList.sync(opts);

export const listWorkers = (opts) => workersList.list(opts);

// El doc id es el rut con el que se creó el trabajador: se trata como
// `workerId` estable y no cambia aunque cambie el rut (Firestore no renombra
// documentos; ver docs/data-model.md). El campo `rut` es el valor legal
// ACTUAL, editable: nace igual al id y puede divergir, p. ej. si el trabajador
// pasa de un rut provisorio (cédula extranjera -B/-H) a uno definitivo. Todo
// lo que necesite identidad estable (agrupar workdays, nóminas, auditoría) usa
// el id/workerId, no `rut`.
//
// Un trabajador puede no tener el campo `rut`; AdminConsole.jsx →
// BackfillWorkerRutFieldSection lo completa.

export async function findWorkerByRut(rut) {
  const normalized = normalizeRut(rut);
  if (!normalized) return null;
  // Primero por docId, el caso más común, que cuesta una sola lectura. La
  // consulta por el campo `rut` corre solo si esa falla: el trabajador cambió
  // de rut y el actual ya no coincide con el id. Quien llama recibe el doc
  // completo; para escribir contra ese trabajador usa `.id`, no el rut buscado.
  // Una ficha unida a otra (`mergedInto`, ver Unir fichas) devuelve la otra.
  const byId = await workersService.getById(normalized);
  const [found] = byId ? [byId] : await workersService.list({ wheres: [["rut", "==", normalized]], take: 1 });
  if (!found?.mergedInto) return found || null; // { id, rut, name, groupLeader?, idQr?, bankDetails? } o null
  return (await workersService.getById(found.mergedInto)) || found;
}

export async function createWorker({ rut, name }) {
  const normalized = normalizeRut(rut);
  if (!validateRut(normalized)) throw new Error("RUT inválido");
  const existing = await findWorkerByRut(normalized);
  if (existing) return existing;
  return workersService.create(
    { rut: normalized, name: toProperName(name) },
    { id: normalized },
  );
}

// Todos los ruts con los que un trabajador puede figurar en documentos: el
// doc id (su rut de creación, inmutable), el `rut` vigente y los intermedios
// de `rutHistory`. Un workday guarda en `workerRut` el rut que tenía el roster
// de la labor cuando se escribió, así que puede ser cualquiera de ellos.
//
// Sirve para resolver con UNA consulta `in`. También acepta un string con una
// sola clave.
export function workerKeys(worker) {
  if (!worker) return [];
  const w = typeof worker === "string" ? { id: worker } : worker;
  const claves = [w.id, w.rut, ...(w.rutHistory || [])].filter(Boolean).map(String);
  return [...new Set(claves)].slice(0, 10); // tope de claves para la consulta `in`
}

// No deja borrar a quien tiene producción cargada, con su rut actual o con
// uno anterior.
export async function deleteWorkerSafe(worker) {
  const claves = workerKeys(worker);
  if (claves.length === 0) throw new Error("Trabajador inválido");
  const id = typeof worker === "string" ? worker : worker.id;
  const conDias = await workdaysService.list({
    wheres: [["workerRut", "in", claves]],
    take: 1,
  });
  if (conDias.length) throw new Error("No se puede eliminar: el trabajador tiene días asociados");
  return workersService.remove(id);
}

export { workersService };
