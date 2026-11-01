import { useMemo, useState } from "react";
import { fetchLogsInRange, HARD_CAP } from "../../services/auditService";
import { localIsoDate } from "../../utils/dates";
import ScreenLoader from "../../components/ScreenLoader";
import { fmtNumber } from "../../utils/format";
import { sessionize } from "../../utils/auditLogs";
import SessionCard from "./SessionCard";
import { attempt } from "../../utils/attempt";

// Auditoría por sesiones de inactividad: lee los logs del rango elegido, los
// agrupa por usuario y corta una sesión cada vez que la pausa entre dos
// acciones seguidas del mismo usuario supera `gapMinutes`. Dos pestañas del
// mismo usuario a la vez se ven como una sola sesión.
//
// Cuesta 1 lectura por log del rango; por eso el rango arranca acotado y la
// consulta tiene un tope de HARD_CAP logs.

// Días que cubre el rango al abrir la pantalla, hoy incluido. `logs` es con
// diferencia la colección más grande del sistema, así que el default es lo
// mínimo útil y ampliar el rango queda como acción explícita.
const DEFAULT_DAYS = 2;

const todayISO = () => localIsoDate();
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localIsoDate(d);
};

export default function SessionsTab() {
  const [fromDate, setFromDate] = useState(daysAgoISO(DEFAULT_DAYS - 1));
  const [toDate, setToDate] = useState(todayISO());
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
    const { error: err } = await attempt(async () => {
      const from = new Date(fromDate + "T00:00:00");
      const to = new Date(toDate + "T23:59:59");
      const raw = await fetchLogsInRange(from, to);
      setLogs(raw);
      setRanAt(new Date());
      setExpanded(new Set());
      setExpandAll(false);
    });
    if (err) setError(err.message || String(err));
    setLoading(false);
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
    <>
      <p className="text-sm text-[var(--color-muted)]">
        Sesiones inferidas por gaps de inactividad. Cada sesión agrupa acciones consecutivas del mismo usuario separadas
        por menos del gap configurado. No lee nada hasta tocar Cargar: una lectura por log del rango.
      </p>

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
              onChange={(e) => setToDate(e.target.value)}
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
            {fmtNumber(logs.length)} registro{logs.length === 1 ? "" : "s"} leído{logs.length === 1 ? "" : "s"} ·{" "}
            {fmtNumber(sessions.length)} sesión{sessions.length === 1 ? "" : "es"} ·{" "}
            {fmtNumber(totalActions)} acciones ·{" "}
            {uniqueUsers} usuario{uniqueUsers === 1 ? "" : "s"} distinto{uniqueUsers === 1 ? "" : "s"}
            {capReached && (
              <span className="ml-2 rounded bg-[var(--color-danger)]/10 px-1.5 py-0.5 text-[var(--color-danger)]">
                ⚠ tope de {HARD_CAP} registros alcanzado — reduce el rango
              </span>
            )}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
      </section>

      {/* Sesiones */}
      {loading ? (
        <ScreenLoader />
      ) : ranAt && sessions.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin actividad en el rango seleccionado.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} open={expanded.has(s.id)} onToggle={() => toggleSession(s.id)} />
          ))}
        </div>
      )}
    </>
  );
}
