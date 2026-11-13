import { useState } from "react";
import { payrollSnapshotsService } from "../../services";
import { countRecordLogs } from "../../services/countsService";
import { listPayrolls } from "../../services/payrollsList";
import { attempt } from "../../utils/attempt";
import { MAX_DOC_BYTES, auditLogSizes, docSize, payrollSizeRows, sizeStatus } from "../../utils/docSizes";
import { errorText } from "../../utils/errorText";
import { fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";

const kb = (bytes) => `${fmtNumber(Math.round(bytes / 1024))} KB`;
const pct = (bytes) => `${Math.round((bytes / MAX_DOC_BYTES) * 100)}%`;
const STATUS = {
  ok: { label: "✓ cabe", cls: "text-[var(--color-success)]" },
  near: { label: "⚠ cerca", cls: "text-[var(--color-warning)]" },
  over: { label: "✗ se pierde", cls: "text-[var(--color-danger)] font-semibold" },
};
const BTN = "min-h-8 rounded-md border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50";

function Status({ bytes, status }) {
  const s = STATUS[status];
  return <span className={`whitespace-nowrap ${s.cls}`}>{kb(bytes)} · {pct(bytes)} · {s.label}</span>;
}

// Cuánto pesa cada nómina y cuánto pesaría el registro de auditoría de una
// edición: Firestore no guarda un documento de más de 1 MiB, y un registro
// que no cabe se pierde sin aviso (`services/logger.js`). La lista sale de la
// copia de las nóminas; "🔍" lee el JSON de esa nómina y cuenta sus registros
// (3 lecturas).
export function PayrollSizesSection() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState({}); // id → { busy } | { snapshot, logs } | { error }
  const [copied, setCopied] = useState(false);

  const measure = async () => {
    setBusy(true);
    setError("");
    const { value, error: err } = await attempt(() => listPayrolls());
    if (err) setError(errorText(err));
    else setRows(payrollSizeRows(value));
    setBusy(false);
  };

  const inspect = async (row) => {
    setDetails((d) => ({ ...d, [row.id]: { busy: true } }));
    const { value, error: err } = await attempt(async () => {
      const snap = await payrollSnapshotsService.getById(row.id);
      const [payrollLogs, snapshotLogs] = await Promise.all([countRecordLogs("payroll", row.id), countRecordLogs("payrollSnapshot", row.id)]);
      let snapshot = null;
      if (snap) {
        const { id, ...data } = snap;
        const bytes = docSize(`payrollSnapshots/${id}`, data);
        const logs = auditLogSizes("payrollSnapshot", id, data);
        snapshot = { bytes, create: logs.create, edit: logs.edit, workdays: (data.workdays || []).length };
      }
      return { snapshot, logs: { payroll: payrollLogs, snapshot: snapshotLogs } };
    });
    setDetails((d) => ({ ...d, [row.id]: err ? { error: errorText(err) } : value }));
  };

  const over = rows ? rows.filter((r) => r.editStatus === "over").length : 0;
  const near = rows ? rows.filter((r) => r.editStatus === "near").length : 0;

  const copy = async () => {
    if (!rows) return;
    const lines = [
      ["Nómina", "Estado", "Personas", "Jornadas", "Documento KB", "Registro al editar KB", "% de 1 MiB", "JSON KB", "JSON al editar KB", "Registros nómina", "Registros JSON"].join("\t"),
      ...rows.map((r) => {
        const d = details[r.id];
        const s = d?.snapshot;
        return [
          r.name, r.status === "paid" ? "pagada" : "pendiente", r.people, r.workdays,
          Math.round(r.bytes / 1024), Math.round(r.editLog / 1024), pct(r.editLog),
          s ? Math.round(s.bytes / 1024) : "", s ? Math.round(s.edit / 1024) : "",
          d?.logs ? d.logs.payroll : "", d?.logs ? d.logs.snapshot : "",
        ].join("\t");
      }),
    ].join("\n");
    const { error: err } = await attempt(() => navigator.clipboard.writeText(lines));
    if (err) window.prompt("Copia la tabla:", lines);
    else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ConsoleCard
      id="payroll-sizes"
      title="📏 Peso de las nóminas"
      description="Cuánto pesa cada nómina y si el registro de auditoría de una edición cabe en el límite de 1 MiB de Firestore. Unas pocas lecturas, de la copia de las nóminas."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN} onClick={measure} disabled={busy}>
            {busy ? "Midiendo…" : rows ? "↻ Medir de nuevo" : "▶ Medir"}
          </button>
          {rows && (
            <button type="button" className={BTN} onClick={copy}>
              {copied ? "✓ Copiado" : "📋 Copiar tabla"}
            </button>
          )}
          {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
        </div>
        {rows && (
          <>
            <p className="text-xs text-[var(--color-muted)]">
              {fmtNumber(rows.length)} nóminas · la más pesada, {rows[0] ? kb(rows[0].bytes) : "—"} ·{" "}
              <b className={over ? "text-[var(--color-danger)]" : ""}>{over} perderían el registro al editarlas</b>
              {near > 0 && <> · {near} cerca del límite</>}. "Al editar" es recalcular, editar ciclos o sacar o agregar a
              alguien: el registro guarda la lista de personas y las jornadas dos veces, antes y después.
            </p>
            <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)] text-xs">
              {rows.map((r) => {
                const d = details[r.id];
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                    <div className="min-w-0 flex-1 basis-48">
                      <div className="font-medium [overflow-wrap:anywhere]">{r.name}</div>
                      <div className="text-[var(--color-muted)]">
                        {r.status === "paid" ? "pagada" : "pendiente"} · {fmtNumber(r.people)} personas · {fmtNumber(r.workdays)} jornadas
                      </div>
                    </div>
                    <div className="tabular-nums">
                      <div>Documento: <Status bytes={r.bytes} status={r.docStatus} /></div>
                      <div>Registro al editar: <Status bytes={r.editLog} status={r.editStatus} /></div>
                    </div>
                    <div className="basis-full sm:basis-auto">
                      {!d && (
                        <button type="button" className={BTN} onClick={() => inspect(r)} title="Lee el JSON de la nómina y cuenta sus registros (3 lecturas)">
                          🔍 JSON y registros
                        </button>
                      )}
                      {d?.busy && <span className="text-[var(--color-muted)]">Leyendo…</span>}
                      {d?.error && <span className="text-[var(--color-danger)]">{d.error}</span>}
                      {d?.logs && (
                        <div className="tabular-nums">
                          {d.snapshot ? (
                            <>
                              <div>JSON: <Status bytes={d.snapshot.bytes} status={sizeStatus(d.snapshot.bytes)} /></div>
                              <div>JSON al editar: <Status bytes={d.snapshot.edit} status={sizeStatus(d.snapshot.edit)} /></div>
                            </>
                          ) : (
                            <div className="text-[var(--color-muted)]">Sin JSON</div>
                          )}
                          <div className="text-[var(--color-muted)]">
                            Registros guardados: {fmtNumber(d.logs.payroll)} de la nómina, {fmtNumber(d.logs.snapshot)} del JSON
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </ConsoleCard>
  );
}
