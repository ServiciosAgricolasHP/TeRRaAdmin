import { useState } from "react";
import { countCollection } from "../../services/countsService";
import { fmtNumber } from "../../utils/format";
import { MAIN_COLLECTIONS, COLLECTION_GROUPS } from "./collections";
import { ConsoleCard } from "./ConsoleCard";

// ============================================================
// Sección: conteo de todas las colecciones
// ============================================================
export function CollectionCountsSection() {
  const [results, setResults] = useState({}); // id → { count?, error?, busy? }
  const [runningAll, setRunningAll] = useState(false);

  const runOne = async (id) => {
    setResults((r) => ({ ...r, [id]: { busy: true } }));
    try {
      const count = await countCollection(id);
      setResults((r) => ({ ...r, [id]: { count } }));
    } catch (err) {
      setResults((r) => ({ ...r, [id]: { error: err.message || String(err) } }));
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    try {
      for (const c of MAIN_COLLECTIONS) {
        await runOne(c.id);
      }
    } finally {
      setRunningAll(false);
    }
  };

  const totalRuns = Object.values(results).filter((r) => r.count != null).length;
  const [copied, setCopied] = useState(false);

  // Copia como texto separado por tabs, para pegar en un mensaje o una
  // planilla. Solo las colecciones ya contadas: un guion se confundiría con
  // "colección vacía".
  const copyCounts = async () => {
    const lines = [];
    let total = 0;
    for (const g of COLLECTION_GROUPS) {
      const groupCollections = MAIN_COLLECTIONS.filter(
        (c) => c.group === g && results[c.id]?.count != null,
      );
      if (groupCollections.length === 0) continue;
      lines.push(`${g}`);
      for (const c of groupCollections) {
        const n = results[c.id].count;
        total += n;
        lines.push(`  ${c.id}\t${n}`);
      }
    }
    if (lines.length === 0) return;
    lines.push("", `TOTAL\t${total}`);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin acceso al portapapeles, muestra el texto para copiarlo a mano.
      window.prompt("Copia los conteos:", text);
    }
  };

  return (
    <ConsoleCard id="counts-por-coleccion" title="Conteos por colección" 
      description={<>~1 lectura por colección (consulta de recuento de Firestore).</>} 
      actions={<><button
          type="button"
          onClick={runAll}
          disabled={runningAll}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {runningAll ? "Ejecutando…" : `▶ Contar todas (~${MAIN_COLLECTIONS.length} lecturas)`}
        </button>
        <button
          type="button"
          onClick={copyCounts}
          disabled={totalRuns === 0}
          title={totalRuns === 0 ? "Primero cuenta alguna colección" : `Copiar ${totalRuns} conteos`}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
        >
          {copied ? "✓ Copiado" : `📋 Copiar${totalRuns ? ` (${totalRuns})` : ""}`}
        </button></>}>
      <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Colección</th>
              <th className="px-3 py-2 text-right">Documentos</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {COLLECTION_GROUPS.flatMap((g) => [
              <tr key={`g-${g}`} className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <td colSpan={3} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {g}
                </td>
              </tr>,
              ...MAIN_COLLECTIONS.filter((c) => c.group === g).map((c) => {
              const r = results[c.id] || {};
              return (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{c.id}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">
                      {c.label}
                      {c.note ? ` · ${c.note}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.busy ? (
                      <span className="text-[var(--color-muted)]">…</span>
                    ) : r.error ? (
                      <span className="text-[var(--color-danger)]">err</span>
                    ) : r.count != null ? (
                      <span className="font-semibold">{fmtNumber(r.count)}</span>
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => runOne(c.id)}
                      disabled={r.busy}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                    >
                      Contar
                    </button>
                  </td>
                </tr>
              );
              }),
            ])}
          </tbody>
        </table>
      </div>
      {totalRuns > 0 && (
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          {totalRuns} consulta{totalRuns === 1 ? "" : "s"} ejecutada{totalRuns === 1 ? "" : "s"}.
        </p>
      )}
    </ConsoleCard>
  );
}
