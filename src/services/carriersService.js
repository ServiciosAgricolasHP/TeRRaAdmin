import { doc, serverTimestamp } from "firebase/firestore";
import { updateDoc } from "./readMeter";
import { db, auth } from "../firebase";
import { logAction } from "./logger";
import { createService } from "./firestoreBase";
import { cacheKey, getCache, invalidate, mergeListItem } from "./cache";
import { toTitleName, unshout } from "../utils/textCase";

const COLLECTION = "carriers";

export const CARRIER_TYPES = [
  { value: "own", label: "Propio" },
  { value: "contracted", label: "Contratado" },
];

export const carrierTypeLabel = (t) =>
  CARRIER_TYPES.find((x) => x.value === t)?.label || t;

const base = createService("carrier", COLLECTION);

// La lista completa se pide al abrir la app (`CarriersProvider`) y casi no
// cambia: se guarda 30 min, también en `localStorage`. Lo que se escribe en
// este navegador la corrige en su lugar, sin releerla; lo que cambie en otro
// equipo llega cuando vence.
export const CARRIERS_LIST = { cache: true, persist: true, ttl: 30 * 60 * 1000 };

// Cambia campos de un transportista en la lista guardada, sin leerlo. Si la
// lista ya no está guardada, la próxima carga la lee entera.
function patchCachedCarrier(id, patch) {
  const list = getCache(cacheKey(COLLECTION, { wheres: [] }), { persist: true });
  const current = Array.isArray(list) ? list.find((c) => c.id === id) : null;
  if (current) mergeListItem(COLLECTION, { ...current, ...patch });
  else invalidate(COLLECTION);
}

export const carriersService = {
  ...base,

  async listAll({ includeInactive = false } = {}) {
    const out = await base.list(CARRIERS_LIST);
    return includeInactive ? out : out.filter((c) => c.active !== false);
  },

  async createCarrier({ alias, name, type, defaultRate = 0, vehicles = [], notes = "" }) {
    return base.create({
      // Nombre y alias como título (utils/textCase.js). Los alias de vehículos
      // no: las vueltas los guardan como texto y dejarían de calzar.
      alias: toTitleName(alias || ""),
      name: toTitleName(name || ""),
      type: type || "contracted",
      defaultRate: Number(defaultRate) || 0,
      vehicles: vehicles.map(normalizeVehicle).filter(Boolean),
      notes: unshout(notes || ""),
      active: true,
    }, { additive: true });
  },

  async updateCarrier(id, patch) {
    const data = { ...patch };
    if ("alias" in data) data.alias = toTitleName(data.alias || "");
    if ("name" in data) data.name = toTitleName(data.name || "");
    if ("notes" in data) data.notes = unshout(data.notes || "");
    if ("vehicles" in data) data.vehicles = (data.vehicles || []).map(normalizeVehicle).filter(Boolean);
    if ("defaultRate" in data) data.defaultRate = Number(data.defaultRate) || 0;
    return base.update(id, data, { additive: true });
  },

  async softDelete(id) {
    await updateDoc(doc(db, COLLECTION, id), {
      active: false,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    });
    patchCachedCarrier(id, { active: false });
    await logAction({ action: "update", entity: "carrier", entityId: id, after: { active: false } });
  },

  async restore(id) {
    await updateDoc(doc(db, COLLECTION, id), {
      active: true,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null,
    });
    patchCachedCarrier(id, { active: true });
    await logAction({ action: "update", entity: "carrier", entityId: id, after: { active: true } });
  },
};

function normalizeVehicle(v) {
  const alias = String(v?.alias || "").trim();
  if (!alias) return null;
  const out = { alias };
  if (v.plate) out.plate = String(v.plate).trim();
  if (v.capacity != null && v.capacity !== "") out.capacity = String(v.capacity).trim();
  if (v.notes) out.notes = String(v.notes).trim();
  return out;
}

// El alias del vehículo es único dentro del transportista.
export function validateVehicleAlias(carrier, alias, ignoreAlias = null) {
  const a = String(alias || "").trim();
  if (!a) return "Alias requerido";
  const list = carrier?.vehicles || [];
  if (list.some((v) => v.alias === a && v.alias !== ignoreAlias)) {
    return "Alias ya existe en este transportista";
  }
  return null;
}
