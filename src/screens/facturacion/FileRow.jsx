import { useMemo } from "react";
import { normalizeRut } from "../../utils/siiCsvParser";
import { fmtNumber, fmtCurrency } from "../../utils/format";

// Fila de un archivo en el preview: nombre, kind detectado, cantidad de docs,
// aviso de RUT distinto, errores de parseo y checkbox para excluirlo del
// import.
export function FileRow({ file, existingIds, companyRut, onToggle }) {
  const dupCount = file.records.filter((r) => existingIds.has(r.id)).length;
  const newCount = file.records.length - dupCount;
  const periodos = useMemo(() => {
    const set = new Set();
    for (const r of file.records) if (r.periodo) set.add(r.periodo);
    return [...set].sort().join(", ") || "—";
  }, [file.records]);

  const showRutWarning = file.rutMismatch;
  const isFailed = file.parseFailed;

  return (
    <div
      className={`flex flex-col gap-1 rounded-md border px-3 py-2 ${
        file.excluded
          ? "border-[var(--color-border)] bg-[var(--color-surface-2)] opacity-60"
          : isFailed
            ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]"
            : showRutWarning
              ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!file.excluded && !isFailed}
          disabled={isFailed}
          onChange={onToggle}
          className="h-4 w-4"
        />
        <span className="flex-1 truncate font-mono text-xs">{file.name}</span>
        {!isFailed && file.kind && (
          <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] uppercase">
            {file.kind === "venta" ? "📤 facturas" : "📥 compras"}
          </span>
        )}
        {!isFailed && (
          <span className="text-xs tabular-nums">
            {fmtNumber(file.records.length)} documento{file.records.length === 1 ? "" : "s"}
            {dupCount > 0 && (
              <span className="ml-1 text-[var(--color-warning)]">({dupCount} sobreescriben)</span>
            )}
          </span>
        )}
      </div>
      {!isFailed && (
        <div className="ml-6 text-[10px] text-[var(--color-muted)]">
          Período: <span className="font-mono">{periodos}</span>
          {" · "}
          Total: <span className="tabular-nums">{fmtCurrency(file.stats.totalAmount)}</span>
          {file.detectedRut && (
            <>
              {" · "}
              RUT detectado: <span className="font-mono">{file.detectedRut}</span>
            </>
          )}
        </div>
      )}
      {showRutWarning && !file.excluded && (
        <div className="ml-6 text-[11px] font-medium text-[var(--color-warning)]">
          ⚠ El archivo parece pertenecer al RUT <span className="font-mono">{file.detectedRut}</span>, distinto del seleccionado (<span className="font-mono">{normalizeRut(companyRut || "")}</span>). Excluye este archivo si fue un error.
        </div>
      )}
      {isFailed && (
        <div className="ml-6 text-[11px] font-medium text-[var(--color-danger)]">
          ✕ No se pudo leer: {file.errors[0]?.message || "error desconocido"}
        </div>
      )}
      {!isFailed && file.errors.length > 0 && (
        <div className="ml-6 text-[10px] text-[var(--color-danger)]">
          {file.errors.length} línea{file.errors.length === 1 ? "" : "s"} con errores (se ignoran)
        </div>
      )}
    </div>
  );
}
