// Cálculo de la Auditoría: las sesiones de un rango de logs, y cómo se
// muestran las fechas, las duraciones y los campos de un cambio.

import { fmtCurrency, fmtNumber } from "./format";

// Timestamp de Firestore → Date. Si viene `null` (log recién escrito cuyo
// `serverTimestamp` todavía no resuelve el servidor), usa la hora actual.
export const toDate = (ts) => {
  if (!ts) return new Date();
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  if (typeof ts === "string" || typeof ts === "number") return new Date(ts);
  return new Date();
};

export const fmtDateTime = (d) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d);

export const fmtTime = (d) =>
  new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d);

export const fmtDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mr = m % 60;
  return `${h}h ${mr}m`;
};

// Nombres en español de los campos comunes. Un campo que no está acá se
// muestra con el camelCase separado en palabras ("groupLeader" → "Group Leader").
const FIELD_LABELS = {
  name: "Nombre", label: "Etiqueta", rut: "RUT", amount: "Monto", total: "Total",
  bonus: "Bono", advance: "Anticipo", status: "Estado", active: "Activo",
  bankCode: "Banco", accountNumber: "N° cuenta", accountType: "Tipo de cuenta",
  email: "Email", phone: "Teléfono", date: "Fecha", price: "Precio", qty: "Cantidad",
  notes: "Notas", detail: "Detalle", razonSocial: "Razón social", alias: "Alias",
  subfaenaId: "Subfaena", faenaId: "Faena", cycleId: "Ciclo", laborId: "Labor",
  laborGroupId: "Grupo de labor", workerRut: "Trabajador", costCenterId: "Centro de costo",
  companyId: "Empresa", groupLeader: "Líder de grupo", type: "Tipo", emoji: "Emoji",
  paidAt: "Fecha de pago", paidBy: "Pagado por", createdAt: "Creado", updatedAt: "Editado",
  // Transporte
  carrierId: "Transportista", vehicleAlias: "Vehículo", kind: "Tipo de viaje",
  rate: "Tarifa", lugar: "Lugar", destino: "Destino", personCount: "Personas",
  paymentId: "Resumen", payrollId: "Quincena", tripIds: "Vueltas", paymentIds: "Resúmenes",
  periodFrom: "Desde", periodTo: "Hasta", groupBy: "Agrupado por", abonos: "Abonos",
  amountPaid: "Monto pagado",
};
export const humanizeField = (f) =>
  FIELD_LABELS[f] || String(f).replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

const MONEY_HINTS = ["amount", "total", "bonus", "advance", "monto", "neto", "iva", "price", "precio", "subtotal", "rate", "tarifa"];
export function formatValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    const key = String(field).toLowerCase();
    if (MONEY_HINTS.some((m) => key.includes(m))) {
      return fmtCurrency(value);
    }
    return fmtNumber(value);
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.length} elemento${value.length === 1 ? "" : "s"}]`;
  if (typeof value === "object") return "{…}";
  return String(value);
}

// Agrupa logs en sesiones. Input: logs ordenados por timestamp asc. Output:
// array de sesiones ordenadas por start desc (más reciente primero).
export function sessionize(logs, gapMinutes) {
  const gapMs = gapMinutes * 60 * 1000;
  // Agrupa por email (o uid, o "unknown") y recorre cada grupo en orden
  // cronológico.
  const byUser = new Map();
  for (const log of logs) {
    const key = log.email || log.uid || "unknown";
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(log);
  }
  const sessions = [];
  for (const [userKey, userLogs] of byUser) {
    userLogs.sort((a, b) => toDate(a.timestamp) - toDate(b.timestamp));
    let current = null;
    for (const log of userLogs) {
      const t = toDate(log.timestamp);
      if (!current || t - current.endDate > gapMs) {
        // Cierra la sesión anterior y abre una nueva.
        if (current) sessions.push(current);
        current = {
          userKey,
          email: log.email || null,
          uid: log.uid || null,
          startDate: t,
          endDate: t,
          logs: [log],
        };
      } else {
        current.endDate = t;
        current.logs.push(log);
      }
    }
    if (current) sessions.push(current);
  }
  sessions.sort((a, b) => b.startDate - a.startDate);
  // Resumen por entidad y por acción de cada sesión.
  return sessions.map((s, idx) => {
    const byEntity = new Map();
    const byAction = { create: 0, update: 0, delete: 0 };
    for (const l of s.logs) {
      const e = l.entity || "?";
      byEntity.set(e, (byEntity.get(e) || 0) + 1);
      if (byAction[l.action] != null) byAction[l.action]++;
    }
    return {
      ...s,
      id: `s_${idx}_${s.userKey}_${s.startDate.getTime()}`,
      durationMs: s.endDate - s.startDate,
      count: s.logs.length,
      byEntity: [...byEntity.entries()].sort((a, b) => b[1] - a[1]),
      byAction,
    };
  });
}
