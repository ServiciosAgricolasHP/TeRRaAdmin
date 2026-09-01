import { collection, query, where, orderBy, limit, getDocs, documentId } from "firebase/firestore";
import { db } from "../firebase";
import { workersService, workdaysService } from "./index";
import { normalizeRut, validateRut } from "../utils/rutUtils";
import { toProperName } from "../utils/nameUtils";

// Auto-detect: starts with digit → RUT search; else name search.
export function detectQueryKind(q) {
  const s = String(q || "").trim();
  if (!s) return null;
  return /^\d/.test(s) ? "rut" : "name";
}

// Server-side prefix search. Returns up to `take` workers matching the query.
export async function searchWorkers(q, { take = 50 } = {}) {
  const kind = detectQueryKind(q);
  if (!kind) return [];
  const raw = String(q).trim();
  const col = collection(db, "worker");

  if (kind === "rut") {
    // Fase 3 de "rut editable": el doc id sigue siendo el rut de creación
    // (workerId estable) pero el rut ACTUAL vive en el campo `rut`, que
    // puede haber cambiado. Buscamos por ambos y mezclamos — así encontramos
    // tanto a los que nunca editaron su rut (matchean por id) como a los que
    // sí (matchean por el campo `rut` actual aunque su id sea otro).
    const prefix = raw.replace(/[.\s]/g, "").toUpperCase();
    const [byId, byField] = await Promise.all([
      getDocs(query(col, where(documentId(), ">=", prefix), where(documentId(), "<", prefix + ""), limit(take))),
      getDocs(query(col, where("rut", ">=", prefix), where("rut", "<", prefix + ""), limit(take))),
    ]);
    const seenRut = new Map();
    for (const d of [...byId.docs, ...byField.docs]) {
      if (!seenRut.has(d.id)) seenRut.set(d.id, { id: d.id, ...d.data() });
    }
    return [...seenRut.values()].slice(0, take);
  }

  // Name search — try a couple casings since Firestore is case-sensitive.
  const variants = new Set([raw, raw.toUpperCase(), raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()]);
  const seen = new Map();
  for (const v of variants) {
    const qy = query(
      col,
      orderBy("name"),
      where("name", ">=", v),
      where("name", "<", v + ""),
      limit(take),
    );
    const snap = await getDocs(qy);
    for (const d of snap.docs) {
      if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...d.data() });
    }
    if (seen.size >= take) break;
  }
  return [...seen.values()].slice(0, take);
}

// El doc id sigue siendo el rut con el que se creó el trabajador — se trata
// como `workerId` estable, y NUNCA se vuelve a tocar aunque el rut cambie
// (Firestore no soporta rename; ver docs/data-model.md). El campo `rut` de
// abajo es el valor legal ACTUAL, editable — arranca igual al id pero puede
// divergir con el tiempo si el trabajador pasa de un rut provisorio (cédula
// extranjera -B/-H) a uno definitivo. Todo lo que necesite identidad estable
// (agrupar workdays, nóminas, auditoría) debe usar el id/workerId, no `rut`.
//
// Fase 1 de la migración: los workers viejos (creados antes de este cambio)
// no tienen el campo `rut` todavía — ver AdminConsole.jsx →
// BackfillWorkerRutFieldSection para completarlo.

export async function findWorkerByRut(rut) {
  const normalized = normalizeRut(rut);
  if (!normalized) return null;
  const found = await workersService.getById(normalized);
  return found; // { id, rut, name, groupLeader?, idQr?, bankDetails? } or null
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

// Fase 3 de "rut editable": los workdays de un trabajador pueden estar
// marcados por `workerRut` (rut al momento de crear el workday) o por
// `workerId` (id estable, agregado en fase 2) — dependiendo de cuándo se
// escribieron. Chequeamos ambos para no dejar borrar a alguien que sí tiene
// producción, solo porque su rut cambió después de esos workdays.
export async function deleteWorkerSafe(workerId) {
  const [byRut, byId] = await Promise.all([
    workdaysService.list({ wheres: [["workerRut", "==", workerId]], take: 1 }),
    workdaysService.list({ wheres: [["workerId", "==", workerId]], take: 1 }),
  ]);
  if (byRut.length || byId.length) throw new Error("No se puede eliminar: el trabajador tiene días asociados");
  return workersService.remove(workerId);
}

export { workersService };
