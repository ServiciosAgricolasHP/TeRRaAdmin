import { fmtNumber } from "../../../utils/format";
import { fmtDuration } from "../../../utils/auditLogs";
import { ratesOf, readsByScreen } from "../../../utils/readLogReport";
import { fmtRate, fmtSaved, fmtShare } from "./reportFormat";
import { ReportTable } from "./ReportTable";

// Lecturas por pantalla, con sus modales marcados debajo. La fila de la
// pantalla suma lo de sus modales; sus consultas son las de la pantalla sola.
export function ScreensTab({ logs, totals }) {
  const rows = readsByScreen(logs).flatMap((screen) => [
    { ...screen, id: screen.screen, section: false },
    ...screen.sections.map((s) => ({ ...s, id: s.key, section: true })),
  ]);

  const columns = [
    {
      key: "name",
      label: "Pantalla",
      render: (r) =>
        r.section ? (
          <span className="pl-3 text-[var(--color-muted)]">› {r.label}</span>
        ) : (
          <span className="font-mono text-xs font-semibold">{r.screen}</span>
        ),
    },
    { key: "visits", label: "Visitas", align: "right", render: (r) => fmtNumber(r.visits) },
    { key: "time", label: "Tiempo", align: "right", render: (r) => (r.seconds ? fmtDuration(r.seconds * 1000) : "—") },
    { key: "docs", label: "Lecturas", align: "right", render: (r) => <b>{fmtNumber(r.docs)}</b> },
    { key: "share", label: "%", align: "right", render: (r) => fmtShare(r.docs, totals.docs) },
    { key: "perVisit", label: "Por visita", align: "right", render: (r) => fmtRate(ratesOf(r).perVisit) },
    { key: "perMinute", label: "Por minuto", align: "right", render: (r) => fmtRate(ratesOf(r).perMinute) },
    { key: "saved", label: "Ahorro caché", align: "right", render: (r) => fmtSaved(r.cacheDocs) },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-muted)]">
        La fila de cada pantalla incluye sus modales (debajo, con ›). Las visitas de la pantalla son las de la ruta; las de un
        modal, las veces que se abrió.
      </p>
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        detailLabel="Ver consultas"
        detail={(r) => <QueryList queries={r.queries} note={r.section ? null : "Sin las de sus modales."} />}
      />
    </div>
  );
}

function QueryList({ queries, note }) {
  if (!queries.length) return <p className="text-xs text-[var(--color-muted)]">Sin lecturas propias.</p>;
  return (
    <div className="space-y-1">
      <ul className="space-y-1 text-xs">
        {queries.map((q) => (
          <li key={q.query} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 break-words font-mono">{q.query}</span>
            <span className="whitespace-nowrap tabular-nums text-[var(--color-muted)]">
              <b className="text-[var(--color-text)]">{fmtNumber(q.docs)}</b> en {fmtNumber(q.requests)} pet.
              {q.cacheDocs ? ` · caché ${fmtNumber(q.cacheDocs)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {note ? <p className="text-[11px] text-[var(--color-muted)]">{note}</p> : null}
    </div>
  );
}
