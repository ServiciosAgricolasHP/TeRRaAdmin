import { directionAmountLabel, totalsByDirection } from "../../utils/commitments";
import { CommitmentList } from "./CommitmentList";
import { fmtDate } from "./helpers";

// "Próximos" por contraparte (`groupByCounterparty`): una sección por
// contraparte, con sus vencimientos del más antiguo al más nuevo. La fecha de
// corte es la misma de "Más adelante".
export function CounterpartyGroups({ groups, until, onUntilChange, rowProps }) {
  const count = (n) => `${n} vencimiento${n === 1 ? "" : "s"}`;
  return (
    <>
      <p className="text-xs text-[var(--color-muted)]">
        Vencimientos hasta el{" "}
        <input
          type="date"
          value={until}
          onChange={(e) => onUntilChange(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          title="Vacío: sin límite"
        />
      </p>
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2 text-sm font-semibold">
            {g.name || "Sin contraparte"}
            {g.items.length > 0 && (
              <span className="font-normal text-[var(--color-muted)]">
                {" "}· {count(g.items.length)} · {directionAmountLabel(g)}
              </span>
            )}
          </h2>
          {g.items.length > 0 && <CommitmentList items={g.items} {...rowProps} />}
          {g.beyond.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Después del {fmtDate(until)}: {count(g.beyond.length)} por{" "}
              {directionAmountLabel(totalsByDirection(g.beyond))}. Cambia la fecha para verlos.
            </p>
          )}
        </section>
      ))}
    </>
  );
}
