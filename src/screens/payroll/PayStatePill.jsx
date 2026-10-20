import { pendingCashOf } from "../../services/payrollsService";
import { fmtCurrency } from "../../utils/format";
import { paymentDates, PAY_STATE_PILL, payStateOf } from "./payState";

// Las fechas de pago en una sola línea, para la tabla del historial.
export function PaymentDatesLine({ p }) {
  const dates = paymentDates(p);
  if (dates.length === 0) return null;
  return (
    <span
      title={dates.map((d) => `${d.label} ${d.date}`).join(" · ")}
      className="whitespace-nowrap text-[11px] tabular-nums text-[var(--color-muted)]"
    >
      {dates.map((d) => `${d.short} ${d.date}`).join(" · ")}
    </span>
  );
}

// `showDates`: las fechas de pago debajo del estado (en la tabla del
// historial van en su propia columna, con `PaymentDatesLine`).
export function PayStatePill({ p, showDates = true }) {
  const pill = PAY_STATE_PILL[payStateOf(p)];
  const owed = pendingCashOf(p);
  return (
    <div>
      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${pill.cls}`}>{pill.label}</span>
      {showDates && paymentDates(p).map((d) => (
        <div key={d.key} className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-[var(--color-muted)]">
          {d.label} {d.date}
        </div>
      ))}
      {owed > 0 && (
        <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-[var(--color-warning)]" title={`Falta entregar ${fmtCurrency(owed)} en efectivo`}>
          💵 debe {fmtCurrency(owed)}
        </div>
      )}
    </div>
  );
}

// Marca la nómina que está publicada en el portal de trabajadores.
export function PortalBadge() {
  return (
    <span
      title="Es la nómina publicada en el portal de trabajadores"
      className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]"
    >
      🌐 Portal
    </span>
  );
}
