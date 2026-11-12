// Cuánto pesa un documento en Firestore, con las reglas de su documentación:
// un texto, sus bytes UTF-8 más 1; un número, 8; un booleano o null, 1; una
// fecha, 8; un mapa, la suma de sus claves (como texto) y sus valores; una
// lista, la suma de sus valores. El documento suma además su nombre (cada id
// de su ruta como texto, más 16) y 32. Firestore rechaza uno de más de 1 MiB.

export const MAX_DOC_BYTES = 1024 * 1024;

const encoder = new TextEncoder();
const textSize = (s) => encoder.encode(String(s)).length + 1;

// Una fecha de Firestore, o su forma guardada en el navegador.
const isTimestamp = (v) =>
  v instanceof Date ||
  typeof v?.toMillis === "function" ||
  (v && typeof v === "object" && Object.keys(v).length === 2 && "seconds" in v && "nanoseconds" in v);

export function valueSize(v) {
  if (v == null || typeof v === "boolean") return 1;
  if (typeof v === "number") return 8;
  if (typeof v === "string") return textSize(v);
  if (isTimestamp(v)) return 8;
  if (Array.isArray(v)) return v.reduce((s, x) => s + valueSize(x), 0);
  if (typeof v === "object") return Object.entries(v).reduce((s, [k, x]) => s + textSize(k) + valueSize(x), 0);
  return 1;
}

export function docSize(path, data) {
  const name = path.split("/").reduce((s, part) => s + textSize(part), 16);
  return name + 32 + valueSize(data);
}

// Los campos de un documento que son una lista o un mapa: los que un registro
// de auditoría guarda enteros cuando cambian.
export function heavyFields(data) {
  return Object.keys(data || {}).filter((k) => {
    const v = data[k];
    return v && typeof v === "object" && !isTimestamp(v);
  });
}

// Un registro de auditoría con los campos de siempre (`services/logger.js`).
function logDoc(entity, entityId, extra) {
  return {
    uid: "x".repeat(28),
    email: "x".repeat(32),
    action: "update",
    entity,
    entityId,
    changes: null,
    before: null,
    after: null,
    meta: null,
    timestamp: new Date(0),
    ...extra,
  };
}

const logSize = (doc) => docSize(`logs/${"x".repeat(20)}`, doc);

// Lo que pesan los registros de auditoría de un documento: al crearlo (el
// documento entero en `after`), al eliminarlo (entero en `before`) y al
// editar los campos `fields` (cada uno dos veces, antes y después, en
// `changes`). Sin `fields`, los que son listas o mapas: lo que cambia al
// recalcular una nómina o sacar a una persona.
export function auditLogSizes(entity, entityId, data, fields = heavyFields(data)) {
  const changes = Object.fromEntries(fields.map((f) => [f, { from: data[f] ?? null, to: data[f] ?? null }]));
  return {
    create: logSize(logDoc(entity, entityId, { action: "create", after: data })),
    remove: logSize(logDoc(entity, entityId, { action: "delete", before: data })),
    edit: logSize(logDoc(entity, entityId, { changes })),
  };
}

// "ok" si cabe con holgura, "near" desde el 75% del límite, "over" si pasa.
export function sizeStatus(bytes) {
  if (bytes > MAX_DOC_BYTES) return "over";
  if (bytes > MAX_DOC_BYTES * 0.75) return "near";
  return "ok";
}

// El peso de cada nómina y de sus registros, de la más pesada a la más liviana.
export function payrollSizeRows(payrolls) {
  return payrolls
    .map((p) => {
      const { id, ...data } = p;
      const bytes = docSize(`payrolls/${id}`, data);
      const logs = auditLogSizes("payroll", id, data);
      const items = data.items || [];
      return {
        id,
        name: data.name || id,
        status: data.status,
        people: items.length,
        workdays: (data.workdayIds || []).length,
        itemWorkdays: items.reduce((s, it) => s + (it.workdayIds || []).length, 0),
        bytes,
        editLog: logs.edit,
        editStatus: sizeStatus(logs.edit),
        docStatus: sizeStatus(bytes),
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}
