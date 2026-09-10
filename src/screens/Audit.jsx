import { useEffect, useMemo, useState } from "react";
import { logsService } from "../services";
import {
  ENTITY_META,
  entityLabelEs,
  searchableEntityTypes,
  snapshotLabel,
  diffLabelHint,
  resolveEntityLabel,
} from "../utils/auditLabels";

// Auditoría con sesionizado idle-based. Fetcheamos los logs del rango elegido,
// los agrupamos por usuario y armamos "sesiones" cerrando cada vez que el gap
// entre acciones consecutivas del mismo usuario supera `gapMinutes`.
//
// Limitación aceptada: si el mismo usuario tiene 2 pestañas abiertas al mismo
// tiempo, se ven como una sola sesión. Para uso interno es aceptable.
//
// Costo: 1 read por log en el rango (Firestore no cobra por doc sino por
// query, pero un rango grande puede pasar 10k docs y salir caro). Por eso el
// range default es "últimos 7 días" y hay un hard cap de 5000 logs.

const HARD_CAP = 5000;

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// Firestore Timestamp → JS Date. Si viene `null` (log recién escrito antes de
// que el server settleee el `serverTimestamp`), asumimos ahora.
const toDate = (ts) => {
  if (!ts) return new Date();
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  if (typeof ts === "string" || typeof ts === "number") return new Date(ts);
  return new Date();
};

const fmtDateTime = (d) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d);

const fmtTime = (d) =>
  new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d);

const fmtDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mr = m % 60;
  return `${h}h ${mr}m`;
};

const fmtNumber = (n) => new Intl.NumberFormat("es-CL").format(Number(n) || 0);

const ACTION_STYLE = {
  create: { color: "#166534", bg: "#dcfce7", label: "crear" },
  update: { color: "#92400e", bg: "#fef3c7", label: "editar" },
  delete: { color: "#b91c1c", bg: "#fee2e2", label: "eliminar" },
};

function actionPill(action) {
  const s = ACTION_STYLE[action] || { color: "#374151", bg: "#f3f4f6", label: action || "?" };
  return (
    <span
      style={{ color: s.color, background: s.bg }}
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
    >
      {s.label}
    </span>
  );
}

// Muestra el registro afectado por un log ("Juan Pérez (Trabajador)") en vez
// del entityId crudo. Intenta resolver el label sin red primero (snapshot del
// propio log, o el diff si el update justo tocó el nombre); si no hay nada,
// dispara un fetch en vivo cacheado (ver utils/auditLabels).
function EntityLabel({ entity, entityId, snapshot, changes }) {
  const initial = snapshotLabel(entity, snapshot) || diffLabelHint(entity, changes);
  const [label, setLabel] = useState(initial);
  useEffect(() => {
    if (initial || !entityId) return;
    let cancelled = false;
    resolveEntityLabel(entity, entityId).then((l) => {
      if (!cancelled && l) setLabel(l);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, entityId]);
  const idFallback = ENTITY_META[entity]?.idLabel?.(entityId) || entityId;
  const shown = label || idFallback;
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="truncate font-medium">{shown || "—"}</span>
      <span className="text-[9px] text-[var(--color-muted)]">
        {entityLabelEs(entity)}
        {shown && entityId && shown !== entityId ? ` · ${entityId}` : ""}
      </span>
    </span>
  );
}

// Diccionario de campos comunes a español. Fallback: separa camelCase en
// palabras ("groupLeader" → "Group Leader") — no es perfecto pero es mejor
// que mostrar la key cruda.
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
const humanizeField = (f) =>
  FIELD_LABELS[f] || String(f).replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

const MONEY_HINTS = ["amount", "total", "bonus", "advance", "monto", "neto", "iva", "price", "precio", "subtotal", "rate", "tarifa"];
function formatValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    const key = String(field).toLowerCase();
    if (MONEY_HINTS.some((m) => key.includes(m))) {
      return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(value);
    }
    return new Intl.NumberFormat("es-CL").format(value);
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.length} elemento${value.length === 1 ? "" : "s"}]`;
  if (typeof value === "object") return "{…}";
  return String(value);
}

// Diff de un update: Campo | Antes | Después.
function ChangesTable({ changes }) {
  const entries = Object.entries(changes);
  return (
    <table className="w-full text-[11px]">
      <thead className="text-[var(--color-muted)]">
        <tr>
          <th className="px-1 py-0.5 text-left">Campo</th>
          <th className="px-1 py-0.5 text-left">Antes</th>
          <th className="px-1 py-0.5 text-left">Después</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([f, chg]) => (
          <tr key={f} className="border-t border-[var(--color-border)]">
            <td className="px-1 py-0.5 align-top font-medium">{humanizeField(f)}</td>
            <td className="px-1 py-0.5 align-top text-[var(--color-danger)]">{formatValue(f, chg?.from)}</td>
            <td className="px-1 py-0.5 align-top text-[var(--color-success)]">{formatValue(f, chg?.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Snapshot completo (before de un delete, after de un create): Campo | Valor.
function SnapshotTable({ data }) {
  const entries = Object.entries(data).filter(([k]) => !k.startsWith("_"));
  return (
    <table className="w-full text-[11px]">
      <tbody>
        {entries.map(([f, v]) => (
          <tr key={f} className="border-t border-[var(--color-border)]">
            <td className="w-1/3 px-1 py-0.5 align-top font-medium text-[var(--color-muted)]">{humanizeField(f)}</td>
            <td className="px-1 py-0.5 align-top">{formatValue(f, v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Bloque colapsable de un log (Cambios/Antes/Después/Meta), con toggle a JSON
// crudo por si la tabla resumida esconde algo que hace falta ver entero
// (arrays/objetos anidados se muestran como "[N elementos]"/"{…}" en la
// tabla).
function FieldBlock({ title, data, kind }) {
  const [raw, setRaw] = useState(kind === "raw");
  const canToggle = kind !== "raw";
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{title}</span>
        {canToggle && (
          <button
            type="button"
            onClick={() => setRaw((v) => !v)}
            className="text-[10px] text-[var(--color-muted)] underline hover:text-[var(--color-text)]"
          >
            {raw ? "ver tabla" : "ver JSON"}
          </button>
        )}
      </div>
      {raw ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(data, null, 2)}</pre>
      ) : kind === "changes" ? (
        <ChangesTable changes={data} />
      ) : (
        <SnapshotTable data={data} />
      )}
    </div>
  );
}

// Convierte un rango JS Date en JS Date (inclusive) y arma la query. Devuelve
// los logs ordenados por timestamp asc (más viejo primero) — más cómodo para
// sesionizar.
async function fetchLogsInRange(fromDate, toDate) {
  const raw = await logsService.list({
    wheres: [
      ["timestamp", ">=", fromDate],
      ["timestamp", "<=", toDate],
    ],
    order: ["timestamp", "asc"],
    take: HARD_CAP,
  });
  return raw;
}

// Agrupa logs en sesiones. Input: logs ordenados por timestamp asc. Output:
// array de sesiones ordenadas por start desc (más reciente primero).
function sessionize(logs, gapMinutes) {
  const gapMs = gapMinutes * 60 * 1000;
  // Agrupamos primero por email (fallback uid, fallback "unknown"). Dentro
  // de cada grupo caminamos cronológicamente.
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
        // Cerrar la anterior, arrancar una nueva.
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
  // Agregamos resumen por entidad
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

// Historial "satélite": logs que pertenecen conceptualmente a un registro pero
// se guardan bajo otra entidad, atribuidos vía `meta`. Sin esto, elegir un
// transportista en la auditoría solo muestra los cambios a su ficha (alias,
// vehículos) y no lo que de verdad importa: sus vueltas y sus resúmenes.
//
// Limitación conocida: la atribución por `meta.carrierId` se agregó junto con
// esta pantalla, así que los logs de transporte anteriores a ese cambio no la
// tienen y no aparecen acá (los de la ficha del transportista sí, siempre).
const SATELLITE_ENTITIES = {
  worker: [{ entity: "workday", field: "meta.workerRut" }],
  carrier: [
    { entity: "transport", field: "meta.carrierId" },
    { entity: "transportPayment", field: "meta.carrierId" },
  ],
};

async function fetchSatelliteLogs(entityType, recordId) {
  const specs = SATELLITE_ENTITIES[entityType];
  if (!specs || !recordId) return [];
  const results = await Promise.all(
    specs.map((spec) =>
      logsService
        .list({ wheres: [["entity", "==", spec.entity], [spec.field, "==", recordId]] })
        .catch((err) => {
          console.error(`No se pudieron cargar los logs de ${spec.entity}:`, err);
          return [];
        }),
    ),
  );
  return results.flat();
}

// Buscador dedicado: elegí un tipo de registro (Trabajador, Ciclo, Faena…),
// buscá el específico por nombre/rut y traé TODO su historial de auditoría
// sin importar el rango de fechas — es una query acotada a ese entityId
// puntual (entity + entityId, sin orderBy para no pedir índice compuesto; se
// ordena en el cliente), así que no hace falta el hard cap ni el filtro de
// fecha de la vista sesionizada de más abajo.
function EntitySearchPanel() {
  const types = useMemo(() => searchableEntityTypes(), []);
  const [entityType, setEntityType] = useState(types[0]?.value || "worker");
  const [query, setQuery] = useState("");
  const [allRecords, setAllRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selected, setSelected] = useState(null); // { id, label }
  const [recordLogs, setRecordLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [open, setOpen] = useState(false);

  const meta = ENTITY_META[entityType];

  // Trae el catálogo completo del tipo elegido (cacheado 10 min — son listas
  // chicas: trabajadores, ciclos, faenas, etc.) para buscar/filtrar en el
  // cliente a medida que se escribe.
  useEffect(() => {
    setSelected(null);
    setRecordLogs(null);
    setQuery("");
    if (!meta?.service) {
      setAllRecords([]);
      return;
    }
    let cancelled = false;
    setLoadingRecords(true);
    meta.service
      .list({ cache: true, ttl: 600_000 })
      .then((rows) => {
        if (!cancelled) setAllRecords(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecords(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  const matches = useMemo(() => {
    if (!meta) return [];
    const q = query.trim().toLowerCase();
    const fields = meta.searchFields || ["name"];
    const pool = !q
      ? allRecords
      : allRecords.filter((d) => fields.some((f) => String(d[f] || "").toLowerCase().includes(q)));
    return pool.slice(0, 25);
  }, [allRecords, query, meta]);

  const pickRecord = async (doc) => {
    const label = meta.labelOf ? meta.labelOf(doc) : doc.name || doc.id;
    setSelected({ id: doc.id, label });
    setRecordLogs(null);
    setLoadingLogs(true);
    try {
      const rows = await logsService.list({
        wheres: [
          ["entity", "==", entityType],
          ["entityId", "==", doc.id],
        ],
      });
      // Algunas entidades no tienen catálogo propio para buscarlas por nombre
      // (un trabajador tiene N jornadas; un transportista N vueltas y N
      // resúmenes). Para esas, el log guarda el "dueño" denormalizado en
      // `meta` y lo levantamos acá como historial satélite del registro
      // elegido:
      //   - worker    → workday        vía meta.workerRut (firestoreBase.js)
      //   - carrier   → transport,     vía meta.carrierId (transportsService.js)
      //                 transportPayment
      const satelliteRows = await fetchSatelliteLogs(entityType, doc.id);
      const merged = [...rows, ...satelliteRows];
      merged.sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp));
      setRecordLogs(merged);
    } catch (err) {
      setRecordLogs([]);
      console.error("No se pudo cargar el historial:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold">🔍 Buscar por registro</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Ver todo el historial de un registro (trabajador, ciclo, faena, transportista…) — sin límite de fecha.
            Al buscar un trabajador se suman los cambios en sus jornadas (workdays); al buscar un transportista, los cambios en sus vueltas y en sus resúmenes de pago.
          </p>
        </div>
        <span className="text-[var(--color-muted)]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--color-muted)]">Tipo de registro</span>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-48 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
              >
                {types.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[var(--color-muted)]">Buscar</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={loadingRecords ? "Cargando…" : "nombre, rut…"}
                className="w-56 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {!selected && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--color-border)]">
              {matches.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">
                  {loadingRecords ? "Cargando…" : "Sin resultados."}
                </div>
              ) : (
                matches.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => pickRecord(d)}
                    className="block w-full border-t border-[var(--color-border)] px-3 py-1.5 text-left text-sm first:border-t-0 hover:bg-[var(--color-surface-2)]"
                  >
                    {meta.labelOf ? meta.labelOf(d) : d.name || d.id}
                  </button>
                ))
              )}
            </div>
          )}

          {selected && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
                <span>
                  <b>{selected.label}</b>{" "}
                  <span className="text-xs text-[var(--color-muted)]">({meta.labelEs})</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setRecordLogs(null); }}
                  className="text-xs text-[var(--color-muted)] underline hover:text-[var(--color-text)]"
                >
                  cambiar
                </button>
              </div>
              {loadingLogs ? (
                <div className="py-6 text-center text-sm text-[var(--color-muted)]">Cargando historial…</div>
              ) : recordLogs && recordLogs.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
                  Sin acciones registradas para este registro.
                </div>
              ) : recordLogs ? (
                <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                  <LogsTable logs={recordLogs} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function Audit() {
  const [fromDate, setFromDate] = useState(daysAgoISO(7));
  const [toDate, setToDateStr] = useState(todayISO());
  const [gapMinutes, setGapMinutes] = useState(30);
  const [emailFilter, setEmailFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [ranAt, setRanAt] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [expandAll, setExpandAll] = useState(false);

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const from = new Date(fromDate + "T00:00:00");
      const to = new Date(toDate + "T23:59:59");
      const raw = await fetchLogsInRange(from, to);
      setLogs(raw);
      setRanAt(new Date());
      setExpanded(new Set());
      setExpandAll(false);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const sessions = useMemo(() => {
    let filtered = logs;
    if (emailFilter.trim()) {
      const q = emailFilter.trim().toLowerCase();
      filtered = filtered.filter((l) => String(l.email || l.uid || "").toLowerCase().includes(q));
    }
    return sessionize(filtered, gapMinutes);
  }, [logs, gapMinutes, emailFilter]);

  const toggleSession = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const doExpandAll = () => {
    if (expandAll) {
      setExpanded(new Set());
      setExpandAll(false);
    } else {
      setExpanded(new Set(sessions.map((s) => s.id)));
      setExpandAll(true);
    }
  };

  const totalActions = sessions.reduce((s, x) => s + x.count, 0);
  const uniqueUsers = new Set(sessions.map((s) => s.userKey)).size;
  const capReached = logs.length >= HARD_CAP;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Sesiones inferidas por gaps de inactividad. Cada sesión agrupa
          acciones consecutivas del mismo usuario separadas por menos del
          gap configurado.
        </p>
      </div>

      <EntitySearchPanel />

      {/* Filtros */}
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Desde</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Hasta</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDateStr(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Gap sesión (min)</span>
            <input
              type="number"
              min={1}
              max={720}
              value={gapMinutes}
              onChange={(e) => setGapMinutes(Math.max(1, Number(e.target.value) || 30))}
              className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
              title="Minutos de inactividad para cortar sesión. 30 típico."
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Filtrar email</span>
            <input
              type="text"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              placeholder="bruno..."
              className="w-48 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {loading ? "Cargando…" : "▶ Cargar"}
          </button>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={doExpandAll}
              className="ml-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
            >
              {expandAll ? "▸ Colapsar todo" : "▾ Expandir todo"}
            </button>
          )}
        </div>
        {ranAt && !loading && (
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            {fmtNumber(logs.length)} log{logs.length === 1 ? "" : "s"} leídos ·{" "}
            {fmtNumber(sessions.length)} sesión{sessions.length === 1 ? "" : "es"} ·{" "}
            {fmtNumber(totalActions)} acciones ·{" "}
            {uniqueUsers} usuario{uniqueUsers === 1 ? "" : "s"} distinto{uniqueUsers === 1 ? "" : "s"}
            {capReached && (
              <span className="ml-2 rounded bg-[var(--color-danger)]/10 px-1.5 py-0.5 text-[var(--color-danger)]">
                ⚠ tope de {HARD_CAP} logs alcanzado — reducí el rango
              </span>
            )}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
      </section>

      {/* Sesiones */}
      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando…</div>
      ) : ranAt && sessions.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin actividad en el rango seleccionado.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isOpen = expanded.has(s.id);
            return (
              <div key={s.id} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                <button
                  type="button"
                  onClick={() => toggleSession(s.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)]"
                >
                  <span className="mt-0.5 text-[var(--color-muted)]">
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium">{s.email || s.uid || "(desconocido)"}</span>
                      <span className="text-xs text-[var(--color-muted)]">
                        {fmtDateTime(s.startDate)}
                        {s.count > 1 && ` → ${fmtTime(s.endDate)} (${fmtDuration(s.durationMs)})`}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-semibold">
                        {s.count} acc.
                      </span>
                      {s.byAction.create > 0 && (
                        <span className="rounded bg-[#dcfce7] px-1.5 py-0.5 text-[#166534]">
                          +{s.byAction.create}
                        </span>
                      )}
                      {s.byAction.update > 0 && (
                        <span className="rounded bg-[#fef3c7] px-1.5 py-0.5 text-[#92400e]">
                          ✎{s.byAction.update}
                        </span>
                      )}
                      {s.byAction.delete > 0 && (
                        <span className="rounded bg-[#fee2e2] px-1.5 py-0.5 text-[#b91c1c]">
                          −{s.byAction.delete}
                        </span>
                      )}
                      <span className="text-[var(--color-muted)]">·</span>
                      {s.byEntity.map(([e, n]) => (
                        <span key={e} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[var(--color-muted)]">
                          {e} × {n}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <SessionDetail logs={s.logs} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Detalle de una sesión — tabla de acciones ordenadas cronológicamente,
// envolviendo LogsTable con el borde/fondo propio de una sesión expandida.
function SessionDetail({ logs }) {
  const sorted = useMemo(
    () => [...logs].sort((a, b) => toDate(a.timestamp) - toDate(b.timestamp)),
    [logs],
  );
  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]" style={{ WebkitOverflowScrolling: "touch" }}>
        <LogsTable logs={sorted} />
      </div>
    </div>
  );
}

// Tabla de logs reusable — la usa tanto SessionDetail (dentro de una sesión
// ya sesionizada) como EntitySearchPanel (historial completo de un registro
// puntual, sin sesionizar). Al hacer click en un row se expande el detalle
// (changes/before/after/meta) ya traducido a tablas legibles.
function LogsTable({ logs }) {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <table className="w-full min-w-[560px] text-xs">
      <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
        <tr>
          <th className="px-2 py-1.5 w-32">Fecha</th>
          <th className="px-2 py-1.5 w-20">Acción</th>
          <th className="px-2 py-1.5">Registro</th>
          <th className="px-2 py-1.5">Usuario</th>
          <th className="px-2 py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        {logs.map((l, idx) => {
          const isOpen = openIdx === idx;
          const hasDetails = l.changes || l.before || l.after || l.meta;
          return (
            <>
              <tr
                key={l.id || idx}
                className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                onClick={() => hasDetails && setOpenIdx(isOpen ? null : idx)}
              >
                <td className="px-2 py-1 font-mono text-[10px] text-[var(--color-muted)]">
                  {fmtDateTime(toDate(l.timestamp))}
                </td>
                <td className="px-2 py-1">{actionPill(l.action)}</td>
                <td className="px-2 py-1">
                  <EntityLabel entity={l.entity} entityId={l.entityId} snapshot={l.after || l.before} changes={l.changes} />
                </td>
                <td className="px-2 py-1 text-[var(--color-muted)]">{l.email || l.uid || "—"}</td>
                <td className="px-2 py-1 text-right text-[var(--color-muted)]">
                  {hasDetails ? (isOpen ? "▾" : "▸") : ""}
                </td>
              </tr>
              {isOpen && hasDetails && (
                <tr key={`d_${idx}`} className="border-t border-[var(--color-border)]">
                  <td colSpan={5} className="bg-[var(--color-surface-2)] px-3 py-2">
                    <div className="grid gap-2 md:grid-cols-2">
                      {l.changes && <FieldBlock title="Cambios" data={l.changes} kind="changes" />}
                      {l.before && <FieldBlock title="Antes" data={l.before} kind="snapshot" />}
                      {l.after && <FieldBlock title="Después" data={l.after} kind="snapshot" />}
                      {l.meta && <FieldBlock title="Meta" data={l.meta} kind="raw" />}
                    </div>
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </tbody>
    </table>
  );
}
