import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { fmtCurrency, fmtShortDate } from "../../utils/format";
import { daysUntil, urgencyLabel, kindMeta, remainingOf } from "../../utils/commitments";

const CommitmentsDonut = lazy(() => import("./dashboardCharts/CommitmentsDonut").then((m) => ({ default: m.CommitmentsDonut })));

// Vencimientos de Cheques y pagos que se listan en el tablero.
const COMMITMENTS_SHOWN = 8;

// Cheques y pagos en el tablero: una dona con lo que se paga y ya venció
// (vencido sin marcar y aplazado) y lo que vence en los próximos 7 días, con el
// total de cada grupo al lado, más la lista de esos vencimientos. Sin cheques
// recibidos ni protestados. Todo lleva a la pantalla de Cheques y pagos.
export function CommitmentsWeek({ data }) {
  const { today, summary, items } = data;
  const slice = (name, hint, color, { amount, count }) => ({ name, hint, color, value: amount, count });
  const slices = [
    slice("Vencido", "sin marcar", "var(--color-danger)", summary.out.overdue),
    slice("Aplazado", "ya vencido, sin fecha", "var(--color-warning)", summary.out.postponed),
    slice("Próximos 7 días", "por pagar", "var(--color-accent)", summary.out.next7),
  ];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const docs = (n) => `${n} documento${n === 1 ? "" : "s"}`;
  // Un aplazado lleva además el chip de cuánto hace que venció.
  const chips = (c) => {
    const days = daysUntil(c.dueDate, today);
    const due = { text: urgencyLabel(days), tone: days < 0 ? "danger" : days <= 1 ? "warning" : "muted" };
    return c.status === "postponed" ? [{ text: "Aplazado", tone: "warning" }, due] : [due];
  };
  const toneCls = {
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    muted: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  };

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Cheques y pagos</h2>
        <Link to="/cheques-pagos" className="text-xs text-[var(--color-accent)] hover:underline">
          Ver todo →
        </Link>
      </div>
      <div className={`grid gap-3 ${items.length > 0 ? "lg:grid-cols-2" : ""}`}>
        <div className="flex flex-col justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          {total > 0 ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-[200px] w-[200px] shrink-0">
                <Suspense fallback={null}>
                  <CommitmentsDonut slices={slices} />
                </Suspense>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">Total</span>
                  <span className="text-sm font-semibold tabular-nums">{fmtCurrency(total)}</span>
                </div>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-3">
                {slices.map((s) => (
                  <li key={s.name} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">{s.name}</span>
                      <span className="block text-[11px] text-[var(--color-muted)]">
                        {s.count ? `${docs(s.count)} · ${s.hint}` : "ninguno"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtCurrency(s.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-[var(--color-muted)]">
              Nada vencido ni por vencer en los próximos 7 días.
            </p>
          )}
        </div>
        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            {items.slice(0, COMMITMENTS_SHOWN).map((c) => {
              const meta = kindMeta(c.kind);
              return (
                <Link
                  key={c.id}
                  to="/cheques-pagos"
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2 text-sm last:border-b-0 hover:bg-[var(--color-accent-soft)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.counterparty}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]">
                      {chips(c).map(({ text, tone }) => (
                        <span key={text} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${toneCls[tone]}`}>
                          {text}
                        </span>
                      ))}
                      <span>{meta.icon} {meta.label}{c.dueDate ? ` · ${fmtShortDate(c.dueDate)}` : ""}</span>
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmtCurrency(remainingOf(c))}</span>
                </Link>
              );
            })}
            {items.length > COMMITMENTS_SHOWN && (
              <Link to="/cheques-pagos" className="block px-3 py-2 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]">
                +{items.length - COMMITMENTS_SHOWN} más
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
