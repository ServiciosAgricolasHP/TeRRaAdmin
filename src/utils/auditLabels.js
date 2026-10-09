// Resuelve el `entity` + `entityId` de un log de auditoría (ver
// services/logger.js) a un texto legible ("Juan Pérez", "Ciclo Poda Lote 3")
// en vez del id crudo del doc. Lo usa Audit.jsx.
//
// Orden de búsqueda (gana la primera que encuentra algo):
//   1. El snapshot completo del log (before/after de create/delete), sin lectura.
//   2. En un update, el valor nuevo (`to`) si el diff tocó el campo de nombre.
//   3. Una lectura en vivo del doc actual (`service.getById`), cacheada en
//      memoria. Da el nombre actual, que puede no ser el que tenía al momento
//      del log.
//
// Una entidad borrada y sin snapshot no tiene nombre: quien llama muestra el id.

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
import { advancesService, normalizeAdvanceType } from "../services/advancesService";
import { carriersService } from "../services/carriersService";
import { tripsService, paymentsService, transportPayrollsService } from "../services/transportsService";

// Fecha corta para los labels de vueltas/resúmenes ("2026-08-12" → "12-ago").
const MONTHS_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}-${MONTHS_ABBR[Number(m[2]) - 1] || m[2]}` : null;
};

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
  advance: {
    labelEs: "Anticipo / bono",
    service: advancesService,
    searchFields: ["workerName", "workerRut"],
    labelOf: (d) => {
      if (!d) return null;
      const tipo = normalizeAdvanceType(d.type) === "bono" ? "Bono" : "Anticipo";
      const monto = Number(d.amount) || 0;
      const quien = d.workerName || d.workerRut || "";
      return `${tipo} ${monto.toLocaleString("es-CL")}${quien ? " · " + quien : ""}`;
    },
    searchable: true,
  },

  // Las entidades de aquí abajo no son `searchable`: no aparecen en el
  // buscador por registro porque no tienen un campo de nombre confiable.
  // El entityId de un workday codifica `cycleId__laborId__rut__date[__ck]`
  // (ver utils/cosechaCombos.js → workdayDocId); `idLabel` lo muestra como
  // "rut · fecha".
  workday: {
    labelEs: "Jornada",
    idLabel: (id) => {
      const parts = String(id || "").split("__");
      if (parts.length < 4) return null;
      const [, , rut, date] = parts;
      return `${rut} · ${date}`;
    },
  },
  // Transporte: el `entityId` es el id de la vuelta o del resumen, no del
  // transportista; el carrier viaja en `meta.carrierId` (ver
  // transportsService.js → carrierMeta) y lo usa Audit.jsx. Aquí solo se arma
  // el label. No son `searchable`: sus services no exponen `list()`.
  transport: {
    labelEs: "Vuelta",
    service: tripsService,
    labelOf: (d) => {
      if (!d) return null;
      const head = [shortDate(d.date), d.vehicleAlias].filter(Boolean).join(" · ");
      return [head, d.destino].filter(Boolean).join(" → ") || null;
    },
  },
  transportPayment: {
    labelEs: "Resumen de pago",
    service: paymentsService,
    labelOf: (d) => {
      if (!d) return null;
      const period = [shortDate(d.periodFrom), shortDate(d.periodTo)].filter(Boolean).join(" → ");
      const count = (d.tripIds || []).length;
      return [period || null, count ? `${count} vuelta${count === 1 ? "" : "s"}` : null]
        .filter(Boolean)
        .join(" · ") || null;
    },
  },
  transportPayroll: { labelEs: "Quincena de transporte", service: transportPayrollsService, labelOf: (d) => d?.name },
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
  payrollSnapshot: { labelEs: "JSON de nómina" },
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

// Saca un label del diff de un update: si el diff tocó un campo de nombre,
// devuelve su valor nuevo.
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

// Lee el doc en vivo y cachea el label. Devuelve null si la entidad no tiene
// service registrado, si el doc ya no existe o si la lectura falla.
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
