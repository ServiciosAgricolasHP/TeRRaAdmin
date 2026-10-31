import { fmtNumber } from "../../../utils/format";
import { readsByQuery } from "../../../utils/readLogReport";
import { fmtRate, fmtSaved, fmtShare } from "./reportFormat";
import { ReportTable } from "./ReportTable";

// Lecturas por forma de consulta (la colección y sus filtros, sin valores),
// con las pantallas donde se pidió.
export function QueriesTab({ logs, totals }) {
  const rows = readsByQuery(logs);
  const columns = [
    { key: "query", label: "Consulta", render: (r) => <span className="font-mono text-xs">{r.query}</span> },
    { key: "requests", label: "Peticiones", align: "right", render: (r) => fmtNumber(r.requests) },
    { key: "docs", label: "Lecturas", align: "right", render: (r) => <b>{fmtNumber(r.docs)}</b> },
    { key: "share", label: "%", align: "right", render: (r) => fmtShare(r.docs, totals.docs) },
    { key: "perRequest", label: "Por petición", align: "right", render: (r) => fmtRate(r.requests ? r.docs / r.requests : null) },
    { key: "saved", label: "Ahorro caché", align: "right", render: (r) => fmtSaved(r.cacheDocs) },
    { key: "screens", label: "Pantallas", align: "right", render: (r) => fmtNumber(r.screens.length) },
  ];

  return (
    <ReportTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.query}
      detailLabel="Ver pantallas"
      detail={(r) => (
        <ul className="space-y-1 text-xs">
          {r.screens.map((s) => (
            <li key={s.screen} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 break-words font-mono">{s.screen}</span>
              <span className="whitespace-nowrap tabular-nums text-[var(--color-muted)]">
                <b className="text-[var(--color-text)]">{fmtNumber(s.docs)}</b> en {fmtNumber(s.requests)} pet.
                {s.cacheDocs ? ` · caché ${fmtNumber(s.cacheDocs)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
