import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { logAction } from "./logger";
import {
  cacheKey,
  getCache,
  setCache,
  invalidate as invalidateCache,
  mergeListItem,
  removeListItem,
} from "./cache";

const stamp = () => ({
  updatedAt: serverTimestamp(),
  updatedBy: auth.currentUser?.uid || null,
});

// Campos de referencia que, si el doc los tiene, se copian al `meta` del log de
// auditoría, para buscar todo lo que le pasó a un trabajador o a un ciclo (el
// log de un update solo guarda el diff, ver logger.js). Aplica a cualquier
// colección que tenga el campo, sin importar la entidad.
// Ver Audit.jsx → EntitySearchPanel.
const REF_META_FIELDS = ["workerRut", "cycleId"];
function extractRefMeta(obj) {
  if (!obj) return null;
  const meta = {};
  for (const f of REF_META_FIELDS) if (obj[f] != null) meta[f] = obj[f];
  return Object.keys(meta).length ? meta : null;
}

export function createService(entityName, collectionName = entityName) {
  const col = () => collection(db, collectionName);
  const ref = (id) => doc(db, collectionName, id);
  const scope = collectionName;

  function invalidate() {
    invalidateCache(scope);
  }

  async function list({
    wheres = [],
    order,
    take,
    cache = false,
    ttl = 60_000,
    persist = false,
  } = {}) {
    const key = cacheKey(scope, { wheres, order, take });
    if (cache) {
      const hit = getCache(key, { persist });
      if (hit !== undefined) return hit;
    }
    const parts = [];
    for (const [field, op, value] of wheres) parts.push(where(field, op, value));
    if (order) parts.push(orderBy(order[0], order[1] || "asc"));
    if (take) parts.push(limit(take));
    const q = parts.length ? query(col(), ...parts) : col();
    const snap = await getDocs(q);
    const result = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (cache) setCache(key, result, { ttl, persist });
    return result;
  }

  async function getById(id) {
    const snap = await getDoc(ref(id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  // Con `additive: true` no se invalida el scope: los listados completos
  // cacheados se parchan en su lugar (agregar, reemplazar o quitar), así una
  // escritura no obliga a releer la colección entera (p. ej. trabajadores).
  async function create(data, { id, additive = false } = {}) {
    const payload = {
      ...data,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || null,
      ...stamp(),
    };
    let docId;
    if (id) {
      await setDoc(ref(id), payload);
      docId = id;
    } else {
      const created = await addDoc(col(), payload);
      docId = created.id;
    }
    const result = { id: docId, ...data };
    if (additive) mergeListItem(scope, result);
    else invalidate();
    await logAction({ action: "create", entity: entityName, entityId: docId, after: data, meta: extractRefMeta(data) });
    return result;
  }

  async function update(id, data, { additive = false } = {}) {
    const before = await getById(id);
    const payload = { ...data, ...stamp() };
    await updateDoc(ref(id), payload);
    const after = { ...(before || {}), ...data };
    const result = { id, ...after };
    if (additive) mergeListItem(scope, result);
    else invalidate();
    await logAction({ action: "update", entity: entityName, entityId: id, before, after, meta: extractRefMeta(after) });
    return result;
  }

  // `before` recibe el documento que el llamador ya leyó, para no volver a
  // leerlo. `undefined`: no se pasó y hay que leerlo; `null`: se leyó y no
  // existe. La diferencia decide si el doc se crea con `createdAt`/`createdBy`,
  // así que no se puede colapsar en un chequeo de verdad/falsedad.
  async function upsert(id, data, { additive = false, before: knownBefore } = {}) {
    const before = knownBefore !== undefined ? knownBefore : await getById(id);
    const payload = before
      ? { ...data, ...stamp() }
      : { ...data, createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid || null, ...stamp() };
    await setDoc(ref(id), payload, { merge: true });
    const after = { ...(before || {}), ...data };
    const result = { id, ...after };
    if (additive) mergeListItem(scope, result);
    else invalidate();
    await logAction({
      action: before ? "update" : "create",
      entity: entityName,
      entityId: id,
      before: before || null,
      after,
      meta: extractRefMeta(after),
    });
    return result;
  }

  // Un documento que ya no existe no se borra ni deja log; igual sale de la
  // caché.
  async function remove(id, { additive = false } = {}) {
    const before = await getById(id);
    if (before) await deleteDoc(ref(id));
    if (additive) removeListItem(scope, id);
    else invalidate();
    if (!before) return;
    await logAction({ action: "delete", entity: entityName, entityId: id, before, meta: extractRefMeta(before) });
  }

  return {
    list,
    getById,
    create,
    update,
    upsert,
    remove,
    ref,
    col,
    invalidate,
    name: entityName,
    collectionName,
  };
}
