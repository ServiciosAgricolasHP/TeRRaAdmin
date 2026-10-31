import { fmtNumber } from "../../../utils/format";
import { fmtDuration } from "../../../utils/auditLogs";
import { readsByPerson } from "../../../utils/readLogReport";
import { fmtSaved, fmtShare } from "./reportFormat";
import { ReportTable } from "./ReportTable";

// Lecturas por persona, con sus aperturas de la app, su tiempo de uso y la
// versión que tenía.
export function PeopleTab({ logs, profiles, totals }) {
  const rows = readsByPerson(logs, profiles);
  const columns = [
    {
      key: "name",
      label: "Persona",
      render: (r) => (
        <span>
          {r.name}
          {r.admin ? (
            <span className="ml-1.5 rounded bg-[var(--color-accent-soft)] px-1 py-0.5 text-[10px] text-[var(--color-accent)]">
              admin
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "days", label: "Días", align: "right", render: (r) => fmtNumber(r.days) },
    { key: "opens", label: "Aperturas", align: "right", render: (r) => fmtNumber(r.opens) },
    { key: "visits", label: "Visitas", align: "right", render: (r) => fmtNumber(r.visits) },
    { key: "time", label: "Tiempo", align: "right", render: (r) => (r.seconds ? fmtDuration(r.seconds * 1000) : "—") },
    { key: "docs", label: "Lecturas", align: "right", render: (r) => <b>{fmtNumber(r.docs)}</b> },
    { key: "share", label: "%", align: "right", render: (r) => fmtShare(r.docs, totals.docs) },
    { key: "saved", label: "Ahorro caché", align: "right", render: (r) => fmtSaved(r.cacheDocs) },
    { key: "writes", label: "Escrituras", align: "right", render: (r) => (r.writes ? fmtNumber(r.writes) : "—") },
    { key: "versions", label: "Versión", align: "right", render: (r) => r.versions.join(", ") || "—" },
  ];

  return <ReportTable columns={columns} rows={rows} rowKey={(r) => r.userId} />;
}
