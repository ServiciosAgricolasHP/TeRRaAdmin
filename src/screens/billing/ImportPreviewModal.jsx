import { useMemo } from "react";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import Modal from "../../components/Modal";
import { fmtNumber, fmtCurrency } from "../../utils/format";
import { FileRow } from "./FileRow";
import { SummaryCard } from "./SummaryCard";

// Modal con el preview de los archivos parseados. Muestra:
//   - banner de la empresa elegida
//   - stats agregados (sumando todos los archivos no excluidos)
//   - lista de archivos con aviso de RUT distinto + checkbox para excluir
//   - conteo por tipo de DTE
//   - muestra de las primeras filas del primer archivo incluido
export function ImportPreviewModal({ preview, existingIds, company, busy, onToggleFile, onConfirm, onCancel }) {
  const { files } = preview;
  const included = files.filter((f) => !f.excluded && !f.parseFailed);

  const agg = useMemo(() => {
    const a = { count: 0, total: 0, newCount: 0, dupCount: 0, byTipo: {}, periods: new Set(), kinds: new Set() };
    for (const f of included) {
      for (const r of f.records) {
        a.count++;
        a.total += Number(r.total) || 0;
        if (existingIds.has(r.id)) a.dupCount++;
        else a.newCount++;
        a.byTipo[r.tipo] = (a.byTipo[r.tipo] || 0) + 1;
        if (r.periodo) a.periods.add(r.periodo);
      }
      if (f.kind) a.kinds.add(f.kind);
    }
    return a;
  }, [included, existingIds]);

  const sampleFile = included[0];
  const sample = sampleFile?.records.slice(0, 5) || [];

  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      size="3xl"
      title={`Importar ${files.length} archivo${files.length === 1 ? "" : "s"}`}
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || agg.count === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Importando..." : `Confirmar (${agg.count} documento${agg.count === 1 ? "" : "s"} de ${included.length} archivo${included.length === 1 ? "" : "s"})`}
          </button>
        </>
      }
    >
      <div className="mb-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs">
        <div className="font-semibold text-[var(--color-accent)]">
          🏢 {company?.alias || company?.razonSocial} · {company?.rut}
        </div>
        <div className="mt-0.5 text-[var(--color-muted)]">
          Período(s): <span className="font-mono">{[...agg.periods].sort().join(", ") || "—"}</span>
          {" · "}
          Kind(s): <span className="font-mono">{[...agg.kinds].join(", ") || "—"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label="Documentos" value={fmtNumber(agg.count)} />
        <SummaryCard label="Total" value={fmtCurrency(agg.total)} highlight />
        <SummaryCard label="Nuevos" value={fmtNumber(agg.newCount)} />
        <SummaryCard label="Sobreescriben" value={fmtNumber(agg.dupCount)} />
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
          Archivos ({files.length})
        </div>
        {files.map((f) => (
          <FileRow
            key={f.name}
            file={f}
            existingIds={existingIds}
            companyRut={company?.rut}
            onToggle={() => onToggleFile(f.name)}
          />
        ))}
      </div>

      {Object.keys(agg.byTipo).length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Por tipo (agregado)
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(agg.byTipo).map(([tipo, count]) => (
              <span
                key={tipo}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs"
              >
                <span className="font-mono">{tipo}</span>
                <span className="ml-1 text-[var(--color-muted)]">{dteTypeLabel(tipo)}</span>
                <span className="ml-1 font-medium">· {count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Muestra del primer archivo incluido */}
      {sample.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            Vista previa · {sampleFile.name}
          </div>
          <div className="overflow-auto rounded-md border border-[var(--color-border)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-2 py-1 text-left">Fecha</th>
                  <th className="px-2 py-1 text-left">Tipo</th>
                  <th className="px-2 py-1 text-right">Folio</th>
                  <th className="px-2 py-1 text-left">{sampleFile.kind === "venta" ? "Cliente" : "Proveedor"}</th>
                  <th className="px-2 py-1 text-left">RUT</th>
                  <th className="px-2 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sample.map((r) => {
                  const razon = sampleFile.kind === "venta" ? r.razonSocialReceptor : r.razonSocialEmisor;
                  const rut = sampleFile.kind === "venta" ? r.rutReceptor : r.rutEmisor;
                  return (
                    <tr key={r.id} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-1 font-mono">{r.fechaEmision}</td>
                      <td className="px-2 py-1">{r.tipo} · {r.tipoLabel}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{r.folio}</td>
                      <td className="px-2 py-1 truncate max-w-[200px]">{razon || "—"}</td>
                      <td className="px-2 py-1 font-mono">{formatRutForDisplay(rut)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtCurrency(r.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
