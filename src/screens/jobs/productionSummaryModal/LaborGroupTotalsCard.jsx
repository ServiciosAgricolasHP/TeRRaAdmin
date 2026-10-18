import { useIsMobile } from "../../../hooks/useIsMobile";
import { fmtCLP } from "./helpers";

// Totales por grupo de labor entre ciclos: una fila por laborGroupId con el
// monto bruto de producción de sus columnas (ciclo × labor). Aparece solo si
// al menos una labor tiene grupo.
export function LaborGroupTotalsCard({ groupTotals }) {
  const isMobile = useIsMobile();
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      <div className="bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
        Totales por grupo de labor (todos los ciclos)
      </div>
      {isMobile ? (
        <div className="divide-y divide-[var(--color-border)]">
          {groupTotals.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{g.name}</div>
                <div className="text-[10px] text-[var(--color-muted)]">{g.cycleIds.size} ciclo{g.cycleIds.size === 1 ? "" : "s"}</div>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{fmtCLP(g.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            <th className="px-3 py-1.5">Grupo</th>
            <th className="px-3 py-1.5 text-right">Ciclos</th>
            <th className="px-3 py-1.5 text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {groupTotals.map((g) => (
            <tr key={g.id} className="border-t border-[var(--color-border)]">
              <td className="px-3 py-1.5 font-medium">{g.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-muted)]">{g.cycleIds.size}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtCLP(g.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}
