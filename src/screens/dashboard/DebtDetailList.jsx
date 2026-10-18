import { fmtCurrency, fmtShortDate } from "../../utils/format";

// Listado completo de los movimientos de un mes en el modal de detalle. En el
// tooltip del gráfico solo entran los más grandes; acá va todo.
export function DebtDetailList({ title, items, total, color }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</h3>
        <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-[var(--color-muted)]">Sin movimientos este mes.</p>
      ) : (
        <ul className="rounded-md border border-[var(--color-border)]">
          {items.map((it, i) => (
            <li
              key={`${it.name}-${it.kind}-${i}`}
              className="border-b border-[var(--color-border)] px-3 py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 truncate">{it.name}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    it.kind === "abono"
                      ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                      : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}
                >
                  {it.kind}
                </span>
                <span className="ml-auto shrink-0 tabular-nums">{fmtCurrency(it.amount)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--color-muted)]">
                <span>{it.period ? `Período ${it.period}` : "Sin período cargado"}</span>
                <span>{it.fortnight ? `Quincena: ${it.fortnight}` : "Resumen suelto"}</span>
                {it.date && (
                  <span>
                    {it.marked ? "Marcado pagado el" : "Abonado el"} {fmtShortDate(it.date)}
                  </span>
                )}
              </div>
              {it.notes && <div className="mt-0.5 text-[11px] italic text-[var(--color-muted)]">{it.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
