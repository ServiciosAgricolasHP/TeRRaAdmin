import { fmtNumber } from "../../../utils/format";
import { readsByCollection } from "../../../utils/readLogReport";
import { fmtSaved, fmtShare } from "./reportFormat";
import { ReportTable } from "./ReportTable";

// Lecturas y escrituras por colección, para comparar con la consola de
// Google Cloud.
export function CollectionsTab({ logs, totals }) {
  const rows = readsByCollection(logs);
  const columns = [
    { key: "collection", label: "Colección", render: (r) => <span className="font-mono text-xs">{r.collection}</span> },
    { key: "docs", label: "Lecturas", align: "right", render: (r) => <b>{fmtNumber(r.docs)}</b> },
    { key: "share", label: "%", align: "right", render: (r) => fmtShare(r.docs, totals.docs) },
    { key: "requests", label: "Peticiones", align: "right", render: (r) => fmtNumber(r.requests) },
    { key: "saved", label: "Ahorro caché", align: "right", render: (r) => fmtSaved(r.cacheDocs) },
    { key: "writes", label: "Escrituras", align: "right", render: (r) => (r.writes ? fmtNumber(r.writes) : "—") },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-muted)]">
        Lo que lee la app. En la consola de Google Cloud (Firestore → Uso), la tarjeta &quot;Total de operaciones de
        escritura&quot; es en realidad el total de documentos leídos: la diferencia con este total es lo que leen el
        escáner, las Cloud Functions, la consola de Firebase y la app mientras el registro estaba apagado. Las escrituras
        son peticiones: un lote cuenta una.
      </p>
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.collection} />
    </div>
  );
}
