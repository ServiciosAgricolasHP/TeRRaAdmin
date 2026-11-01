import { useState } from "react";
import { addDays } from "../../utils/commitments";
import { localIsoDate } from "../../utils/dates";
import { fmtNumber, fmtShortDate } from "../../utils/format";
import { exportPayload, filterLogs, personName, reportText, reportTotals } from "../../utils/readLogReport";
import { ConsoleCard } from "./ConsoleCard";
import { CollectionsTab } from "./readReportSection/CollectionsTab";
import { copyReportText, downloadReportJson } from "./readReportSection/exportReport";
import { HoursTab } from "./readReportSection/HoursTab";
import { PeopleTab } from "./readReportSection/PeopleTab";
import { QueriesTab } from "./readReportSection/QueriesTab";
import { ReportSummary } from "./readReportSection/ReportSummary";
import { ScreensTab } from "./readReportSection/ScreensTab";
import { useReadReport } from "./useReadReport";

// ============================================================
// Informe de lecturas
// ============================================================
// Lo que anotó el registro de lecturas (services/readMeter.js) en un rango,
// por pantalla, consulta, colección, hora y persona. No lee nada hasta que se
// carga un rango; los filtros trabajan sobre lo cargado.
export function ReadReportSection() {
  return (
    <ConsoleCard
      id="informe-lecturas"
      title="📊 Informe de lecturas"
      description="Qué pantalla, consulta y persona leen más, según el registro de lecturas. Cargar un rango lee un documento por persona y por día."
    >
      <ReadReportPanel />
    </ConsoleCard>
  );
}

const TABS = [
  { value: "screens", label: "Pantallas", Content: ScreensTab },
  { value: "queries", label: "Consultas", Content: QueriesTab },
  { value: "collections", label: "Colecciones", Content: CollectionsTab },
  { value: "hours", label: "Horario", Content: HoursTab },
  { value: "people", label: "Personas", Content: PeopleTab },
];
const PRESETS = [7, 14, 30];
const ENV_LABELS = { prod: "Producción", local: "Local", all: "Producción y local" };
const PERSON_LABELS = { all: "Todos", noAdmins: "Sin los admin" };

const field =
  "mt-1 block min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)]";
const ghostBtn =
  "min-h-[32px] rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60";

function ReadReportPanel() {
  const today = localIsoDate();
  const [from, setFrom] = useState(() => addDays(today, -6));
  const [to, setTo] = useState(today);
  const [person, setPerson] = useState("all");
  const [env, setEnv] = useState("prod");
  const [tab, setTab] = useState("screens");
  const [copied, setCopied] = useState(false);
  const { data, loading, error, load } = useReadReport();

  const loadLast = (days) => {
    const start = addDays(today, -(days - 1));
    setFrom(start);
    setTo(today);
    load(start, today);
  };

  const logs = data ? filterLogs(data.logs, { person, env, profiles: data.profiles }) : [];
  const totals = reportTotals(logs);
  const people = data
    ? [...new Set(data.logs.map((l) => l.userId))]
        .map((id) => ({ id, name: personName(data.profiles.find((p) => p.id === id), id) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const { Content } = TABS.find((t) => t.value === tab);

  const downloadJson = () => {
    if (!data) return;
    const payload = exportPayload({
      logs,
      profiles: data.profiles,
      from: data.from,
      to: data.to,
      person,
      env,
      exportedAt: new Date().toISOString(),
    });
    downloadReportJson(`lecturas_${data.from}_${data.to}.json`, payload);
  };

  const copyText = async () => {
    if (!data) return;
    const filters = `${ENV_LABELS[env]} · ${PERSON_LABELS[person] || "Una persona"}`;
    const ok = await copyReportText(reportText({ logs, from: data.from, to: data.to, filters }));
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--color-muted)]">
          Desde
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          Hasta
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
        <button
          type="button"
          disabled={loading || !from || !to || from > to}
          onClick={() => load(from, to)}
          className="min-h-[32px] rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {loading ? "Cargando…" : "Cargar"}
        </button>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((days) => (
            <button key={days} type="button" disabled={loading} onClick={() => loadLast(days)} className={ghostBtn}>
              {days} días
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

      {!data ? (
        <p className="text-sm text-[var(--color-muted)]">Elige el rango y toca Cargar.</p>
      ) : (
        <>
          <p className="text-xs text-[var(--color-muted)]">
            Del {fmtShortDate(data.from)} al {fmtShortDate(data.to)}: {fmtNumber(data.logs.length)} registros de persona y
            día. La carga leyó {fmtNumber(data.reads)} documentos.
          </p>

          {data.logs.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              No hay nada registrado en el rango. El registro se enciende en la tarjeta 📈 Registro de lecturas.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-[var(--color-muted)]">
                  Persona
                  <select value={person} onChange={(e) => setPerson(e.target.value)} className={field}>
                    <option value="all">Todos</option>
                    <option value="noAdmins">Sin los admin</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[var(--color-muted)]">
                  Entorno
                  <select value={env} onChange={(e) => setEnv(e.target.value)} className={field}>
                    <option value="prod">Producción</option>
                    <option value="local">Local (un computador contra la base real)</option>
                    <option value="all">Ambos</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadJson} className={ghostBtn} title="Los registros con estos filtros, sin nombres ni correos">
                    ⬇ Descargar JSON
                  </button>
                  <button type="button" onClick={copyText} className={ghostBtn} title="Totales, días, pantallas, consultas y colecciones, en texto">
                    {copied ? "✓ Copiado" : "📋 Copiar resumen"}
                  </button>
                </div>
              </div>

              <ReportSummary logs={logs} totals={totals} />

              <div>
                <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--color-border)]" role="tablist">
                  {TABS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.value}
                      onClick={() => setTab(t.value)}
                      className={`relative min-h-[32px] px-3 py-2 text-sm transition-colors ${
                        tab === t.value
                          ? "font-medium text-[var(--color-accent)]"
                          : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      {t.label}
                      {tab === t.value && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
                    </button>
                  ))}
                </div>
                <Content logs={logs} totals={totals} profiles={data.profiles} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
