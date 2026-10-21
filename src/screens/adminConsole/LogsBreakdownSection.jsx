import { useState } from "react";
import { countCollection, countLogsByEntity, countLogsOlderThan } from "../../services/countsService";
import { fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";

// Las entidades que escriben en `logs`. Sale de los `createService(entity, ...)`
// de services/index.js más las literales de transportsService/catalogsService.
// Es una lista a mano: una entidad nueva que no se agregue acá queda invisible
// en el desglose, igual que pasa con MAIN_COLLECTIONS.
const LOG_ENTITIES = [
  "workday", "worker", "cycle", "faena", "subfaena", "advance", "payroll",
  "payrollSnapshot", "payrollConfig", "transport", "transportPayment", "transportPayroll",
  "carrier", "catalog", "qrPrefix", "harvestWeight", "dteDocument", "company",
  "costCenter", "informalExpense", "priceBookEntry", "priceBookConfig",
  "contactCard", "phoneContact", "interestLink", "groupLeader", "laborGroup", "indicator",
  "commitment", "commitmentSeries", "commitmentConfig", "portalMeta",
  "employment", "employer",
  "user", "log",
];

// Entidades cuyo log guarda un array o mapa entero. `diff()` (services/logger.js)
// compara por clave de primer nivel, así que tocar un solo elemento guarda la
// estructura completa dos veces, antes y después: ~30 KB por log en un ciclo
// de 3 labores × 80 personas y 30 días × 4 combos, contra ~0,1 KB por log de
// una jornada. Las jornadas ponen la cantidad de logs; estas entidades, el peso.
const LOG_HEAVY = {
  cycle: "labors[] + dayPrices{} enteros",
  payroll: "items[] + workdayIds[] enteros",
  payrollSnapshot: "el snapshot completo, que es el contrato del portal",
  qrPrefix: "padron{}, un código por trabajador",
  catalog: "entries[] entero",
};

// ============================================================
// Composición de la colección `logs`
// ============================================================
// Desglosa `logs` por entidad y cuenta cuántos documentos superan los 6, 12 y
// 24 meses, como base para decidir una retención. `logs` solo crece: la app no
// borra logs y `firestore.rules` no deja editarlos ni borrarlos. Cada recuento
// cuesta ~1 lectura por cada 1.000 documentos contados.
export function LogsBreakdownSection() {
  const [byEntity, setByEntity] = useState({}); // entity → { count?, error?, busy? }
  const [countingAll, setCountingAll] = useState(false);
  const [ageCounts, setAgeCounts] = useState(null); // { 6, 12, 24 } | null
  const [ageBusy, setAgeBusy] = useState(false);
  const [total, setTotal] = useState(null);
  const [copied, setCopied] = useState(false);

  const countAll = async () => {
    setCountingAll(true);
    try {
      // El total de la colección va aparte: sirve para ver si las entidades
      // listadas suman todo o si hay alguna que no está en LOG_ENTITIES.
      try { setTotal(await countCollection("logs")); } catch { /* el desglose igual sirve */ }
      for (const e of LOG_ENTITIES) {
        setByEntity((r) => ({ ...r, [e]: { busy: true } }));
        try {
          const count = await countLogsByEntity(e);
          setByEntity((r) => ({ ...r, [e]: { count } }));
        } catch (err) {
          setByEntity((r) => ({ ...r, [e]: { error: err.message || String(err) } }));
        }
      }
    } finally {
      setCountingAll(false);
    }
  };

  const measureAge = async () => {
    setAgeBusy(true);
    try {
      const out = {};
      for (const m of [6, 12, 24]) out[m] = await countLogsOlderThan(m);
      setAgeCounts(out);
    } catch (err) {
      setAgeCounts({ error: err.message || String(err) });
    } finally {
      setAgeBusy(false);
    }
  };

  const countedEntities = LOG_ENTITIES.filter((e) => byEntity[e]?.count != null);
  const countedSum = countedEntities.reduce((a, e) => a + byEntity[e].count, 0);
  // Logs de entidades que no están en LOG_ENTITIES: una que falta agregar, o
  // un nombre de entidad que ya no se escribe.
  const unclassified = total != null ? total - countedSum : null;

  const sortedEntities = [...countedEntities].sort((a, b) => byEntity[b].count - byEntity[a].count);

  const copyBreakdown = async () => {
    if (sortedEntities.length === 0) return;
    const lines = sortedEntities.map((e) => `${e}\t${byEntity[e].count}${LOG_HEAVY[e] ? "\tpesado" : ""}`);
    if (unclassified != null && unclassified !== 0) lines.push(`(sin clasificar)\t${unclassified}`);
    lines.push("", `TOTAL\t${total ?? countedSum}`);
    if (ageCounts && !ageCounts.error) {
      lines.push("", "Anteriores a", ...[6, 12, 24].map((m) => `  ${m} meses\t${ageCounts[m]}`));
    }
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia el desglose:", text);
    }
  };

  return (
    <ConsoleCard
      id="logs-composicion"
      title="Composición de la auditoría"
      description={
        <>
          De dónde salen los documentos de <code>logs</code>. ~1 lectura por entidad.
          Las marcadas <b>pesado</b> guardan arrays o mapas enteros en cada cambio
          (~30 KB por registro contra ~0,1 KB de una jornada), así que pesan mucho más de
          lo que sugiere su conteo.
        </>
      }
      actions={
        <>
          <button
            type="button"
            onClick={countAll}
            disabled={countingAll}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {countingAll ? "Contando…" : `▶ Por entidad (~${LOG_ENTITIES.length + 1} lecturas)`}
          </button>
          <button
            type="button"
            onClick={measureAge}
            disabled={ageBusy}
            title="Cuántos registros borraría un TTL de 6, 12 o 24 meses"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {ageBusy ? "Midiendo…" : "▶ Antigüedad (3 lecturas)"}
          </button>
          <button
            type="button"
            onClick={copyBreakdown}
            disabled={sortedEntities.length === 0}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {copied ? "✓ Copiado" : `📋 Copiar${sortedEntities.length ? ` (${sortedEntities.length})` : ""}`}
          </button>
        </>
      }
    >
      {ageCounts ? (
        ageCounts.error ? (
          <p className="mb-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
            {ageCounts.error}
          </p>
        ) : (
          <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
            <div className="mb-1 font-medium">Cuánto borraría un TTL sobre <code>timestamp</code></div>
            <div className="flex flex-wrap gap-4 tabular-nums">
              {[6, 12, 24].map((m) => (
                <span key={m}>
                  &gt; {m} meses: <b>{fmtNumber(ageCounts[m])}</b>
                  {total ? ` (${Math.round((ageCounts[m] / total) * 100)}%)` : ""}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[var(--color-muted)]">
              La ficha por registro de Auditoría no tiene límite de fecha, así que un TTL
              le recorta el historial en silencio.
            </p>
          </div>
        )
      ) : null}

      <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Entidad</th>
              <th className="px-3 py-2 text-right">Registros</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2">Peso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {(sortedEntities.length ? sortedEntities : LOG_ENTITIES).map((e) => {
              const r = byEntity[e] || {};
              return (
                <tr key={e}>
                  <td className="px-3 py-1.5 font-mono text-xs">{e}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.busy ? "…" : r.error ? "—" : r.count != null ? fmtNumber(r.count) : ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-xs text-[var(--color-muted)]">
                    {r.count != null && total ? `${Math.round((r.count / total) * 100)}%` : ""}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {LOG_HEAVY[e] ? (
                      <span className="text-[var(--color-warning)]" title={LOG_HEAVY[e]}>
                        ⚠ pesado · {LOG_HEAVY[e]}
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)]">liviano</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {total != null && (
              <tr className="bg-[var(--color-surface-2)] font-medium">
                <td className="px-3 py-1.5">TOTAL en la colección</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNumber(total)}</td>
                <td colSpan={2} className="px-3 py-1.5 text-xs text-[var(--color-muted)]">
                  {unclassified != null && unclassified !== 0
                    ? `${fmtNumber(unclassified)} sin clasificar — falta agregar esa entidad a LOG_ENTITIES`
                    : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ConsoleCard>
  );
}
