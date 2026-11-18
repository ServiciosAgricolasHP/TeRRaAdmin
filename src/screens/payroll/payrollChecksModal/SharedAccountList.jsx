import { formatRutForDisplay } from "../../../utils/rutUtils";
import { sharedAccountGroups } from "../../../utils/payrollChecks/paymentChecks";
import { SEVERITY_ICON, worstOpenSeverity } from "../checkSeverity";

const btn =
  "min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50";

// Las cuentas compartidas que faltan revisar: un bloque por cuenta, con su
// titular, la cuenta y quienes cobran en ella. "✓ Revisada" marca a todos los
// de la cuenta, y cada persona tiene además su casilla. `onReview` en `null`
// la deja solo para leer.
export function SharedAccountList({ alerts, onReview }) {
  const groups = sharedAccountGroups(alerts);
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {groups.map(({ account, alerts: people }) => (
        <li key={account.key} className="py-2">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">
                <span aria-hidden="true">{SEVERITY_ICON[worstOpenSeverity(people) || people[0].severity]}</span> Cuenta de {account.holder}
                {account.holderName && account.holderRut && (
                  <span className="ml-1 font-mono text-xs font-normal text-[var(--color-muted)]">{formatRutForDisplay(account.holderRut)}</span>
                )}
              </div>
              <div className="text-xs text-[var(--color-muted)]">
                {account.label}
                {account.holderInPayroll && " · el titular también está en la nómina"}
              </div>
            </div>
            {onReview && (
              <button type="button" className={btn} onClick={() => onReview(people.map((a) => a.key), true)}>
                ✓ Revisada
              </button>
            )}
          </div>
          <ul className="mt-1 space-y-0.5 pl-5">
            {people.map((a) => (
              <li key={a.key} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  {a.name || "(sin nombre)"} <span className="font-mono text-xs text-[var(--color-muted)]">{formatRutForDisplay(a.rut)}</span>
                </span>
                {onReview && (
                  <label className="flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={!!a.review} onChange={(e) => onReview([a.key], e.target.checked)} />
                    Revisada
                  </label>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
