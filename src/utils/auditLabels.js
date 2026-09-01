// Resuelve un `entity` + `entityId` de un log de auditoría (ver
// services/logger.js) a algo legible para humanos ("Juan Pérez", "Ciclo
// Poda Lote 3") en vez del uuid crudo del doc. Se usa desde Audit.jsx.
//
// Estrategia (en orden, la primera que encuentre algo gana):
//   1. Si el log trae un snapshot completo (before/after de create/delete),
//      sacamos el campo "nombre" de ahí — gratis, sin fetch.
//   2. Si el log es un update (solo trae `changes`, el diff), y ese diff
//      justo tocó el campo de nombre, usamos el valor nuevo (`to`).
//   3. Si no hay nada de lo anterior, hacemos un fetch en vivo al doc actual
//      (`service.getById`) — puede no calzar con el nombre que tenía AL
//      MOMENTO del log si se renombró después, pero es la mejor aproximación
//      sin guardar el nombre denormalizado en cada log. Se cachea en memoria
//      (Map a nivel de módulo) porque el nombre de una entidad rara vez
//      cambia dentro de una sesión de auditoría.
//
// Si la entidad fue borrada y no hay snapshot, no hay forma de recuperar el
// nombre — se muestra el id crudo como fallback en el componente que llama.

import {
  workersService,
  cyclesService,
  subfaenasService,
  faenasService,
  costCentersService,
  laborGroupsService,
  companiesService,
} from "../services";
import { payrollsService } from "../services/payrollsService";
import { carriersService } from "../services/carriersService";

// Campos candidatos genéricos, en orden de preferencia, para entidades sin
// entrada explícita en ENTITY_META o cuyo labelOf no encontró nada.
const GENERIC_LABEL_FIELDS = ["name", "label", "razonSocial", "alias", "detail", "title"];

export const ENTITY_META = {
  worker: { labelEs: "Trabajador", service: workersService, searchFields: ["name", "rut"], labelOf: (d) => (d?.name ? `${d.name}${d.rut ? " · " + d.rut : ""}` : d?.rut), searchable: true },
  cycle: { labelEs: "Ciclo", service: cyclesService, searchFields: ["label"], labelOf: (d) => d?.label, searchable: true },
  faena: { labelEs: "Faena", service: faenasService, searchFields: ["name"], labelOf: (d) => d?.name, searchable: true },
  subfaena: { labelEs: "Subfaena", service: subfaenasService, searchFields: ["name"], labelOf: (d) => d?.name, searchable: true },
  payroll: { labelEs: "Nómina", service: payrollsService, searchFields: ["name"], labelOf: (d) => d?.name, searchable: true },
  carrier: { labelEs: "Transportista", service: carriersService, searchFields: ["alias", "name"], labelOf: (d) => d?.alias || d?.name, searchable: true },
  company: { labelEs: "Empresa", service: companiesService, searchFields: ["alias", "razonSocial", "rut"], labelOf: (d) => d?.alias || d?.razonSocial, searchable: true },
  costCenter: { labelEs: "Centro de costo", service: costCentersService, searchFields: ["label"], labelOf: (d) => (d?.emoji ? `${d.emoji} ${d.label}` : d?.label), searchable: true },
  laborGroup: { labelEs: "Grupo de labor", service: laborGroupsService, searchFields: ["name"], labelOf: (d) => d?.name, searchable: true },

  // El resto tiene entrada solo para el badge/label del tipo (vista general
  // de Auditoría) — no aparecen en el buscador dedicado por registro porque
  // no tienen un campo de nombre confiable para armar un picker.
  // El entityId de un workday codifica `cycleId__laborId__rut__date[__ck]`
  // (ver utils/cosechaCombos.js → workdayDocId) — no hay snapshot ni service
  // razonable para pickearlo por nombre, pero sí podemos parsear el id para
  // mostrar "rut · fecha" en vez del id crudo completo.
  workday: {
    labelEs: "Jornada",
    idLabel: (id) => {
      const parts = String(id || "").split("__");
      if (parts.length < 4) return null;
      const [, , rut, date] = parts;
      return `${rut} · ${date}`;
    },
  },
  transport: { labelEs: "Viaje/transporte" },
  transportPayment: { labelEs: "Pago transporte" },
  transportPayroll: { labelEs: "Nómina transporte" },
  informalExpense: { labelEs: "Gasto informal", labelOf: (d) => d?.detail },
  contactCard: { labelEs: "Ficha de contacto" },
  dteDocument: { labelEs: "Documento SII" },
  catalog: { labelEs: "Catálogo", labelOf: (_d, id) => id },
  priceBookEntry: { labelEs: "Libro de precios" },
  priceBookConfig: { labelEs: "Config. libro de precios" },
  qrPrefix: { labelEs: "Prefijo QR", labelOf: (_d, id) => id },
  indicator: { labelEs: "Indicador", labelOf: (_d, id) => id },
  interestLink: { labelEs: "Link de interés", labelOf: (d) => d?.title || d?.name },
  harvestWeight: { labelEs: "Pesaje cosecha" },
  payrollSnapshot: { labelEs: "Snapshot de nómina" },
  groupLeader: { labelEs: "Líder de grupo", labelOf: (d) => d?.name },
};

export function entityLabelEs(entity) {
  return ENTITY_META[entity]?.labelEs || entity || "?";
}

export const searchableEntityTypes = () =>
  Object.entries(ENTITY_META)
    .filter(([, m]) => m.searchable)
    .map(([key, m]) => ({ value: key, label: m.labelEs }));

// Intenta sacar un label de un objeto completo (snapshot de create/delete, o
// el doc actual traído en vivo).
export function snapshotLabel(entity, obj, id) {
  if (!obj) return null;
  const meta = ENTITY_META[entity];
  if (meta?.labelOf) {
    try {
      const l = meta.labelOf(obj, id);
      if (l) return l;
    } catch {
      /* noop */
    }
  }
  for (const f of GENERIC_LABEL_FIELDS) {
    if (obj[f]) return obj[f];
  }
  return null;
}

// Intenta sacar un label del diff de un update: si el campo de nombre fue
// justo lo que cambió, usamos el valor nuevo sin necesidad de fetch.
export function diffLabelHint(entity, changes) {
  if (!changes) return null;
  const meta = ENTITY_META[entity];
  const fields = meta?.searchFields || GENERIC_LABEL_FIELDS;
  for (const f of fields) {
    if (changes[f]?.to) return changes[f].to;
  }
  return null;
}

const _cache = new Map(); // `${entity}:${id}` -> label | null
const _inflight = new Map();

// Fetch en vivo + cache. Devuelve null si no hay service registrado para esa
// entidad, o si el doc ya no existe (borrado).
export async function resolveEntityLabel(entity, entityId) {
  if (!entityId) return null;
  const meta = ENTITY_META[entity];
  if (!meta?.service) return null;
  const key = `${entity}:${entityId}`;
  if (_cache.has(key)) return _cache.get(key);
  if (_inflight.has(key)) return _inflight.get(key);
  const p = meta.service
    .getById(entityId)
    .then((doc) => {
      const label = doc ? snapshotLabel(entity, doc, entityId) : null;
      _cache.set(key, label);
      return label;
    })
    .catch(() => {
      _cache.set(key, null);
      return null;
    })
    .finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}
