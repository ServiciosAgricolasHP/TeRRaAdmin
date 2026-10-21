import { workersService, workdaysService } from "./index";
import { normalizeRut, validateRut } from "../utils/rutUtils";
import { toProperName } from "../utils/nameUtils";

// Si empieza con un dígito se busca por RUT; si no, por nombre.
export function detectQueryKind(q) {
  const s = String(q || "").trim();
  if (!s) return null;
  return /^\d/.test(s) ? "rut" : "name";
}

// La lista completa de trabajadores, ordenada por nombre y en caché 2 h, también
// en localStorage. Todas las pantallas la piden con estas mismas opciones:
// la clave de la caché sale de ellas, y así la comparten.
export const WORKERS_LIST = { order: ["name", "asc"], cache: true, persist: true, ttl: 2 * 60 * 60 * 1000 };

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
  const byId = await workersService.getById(normalized);
  if (byId) return byId;
  const [byField] = await workersService.list({ wheres: [["rut", "==", normalized]], take: 1 });
  return byField || null; // { id, rut, name, groupLeader?, idQr?, bankDetails? } o null
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
