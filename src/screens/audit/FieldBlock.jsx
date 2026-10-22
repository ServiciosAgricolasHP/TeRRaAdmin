import { useState } from "react";
import { formatValue, humanizeField } from "../../utils/auditLogs";

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
export default function FieldBlock({ title, data, kind }) {
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
