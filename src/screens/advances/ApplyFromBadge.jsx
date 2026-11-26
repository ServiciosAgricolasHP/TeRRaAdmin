import { localIsoDate } from "../../utils/dates";
import { applyFromLabel, isDeferred } from "../../utils/advanceSchedule";
import { isBono } from "../../services/advancesService";

// La insignia de un anticipo o bono pendiente con fecha de inicio que todavía
// no llega: desde cuándo lo aplica una nómina.
export function ApplyFromBadge({ advance }) {
  const open = ["pending", "partial"].includes(advance.status || "pending");
  if (!open || !isDeferred(advance, localIsoDate())) return null;
  const verb = isBono(advance) ? "paga" : "descuenta";
  return (
    <span
      className="mt-1 block whitespace-nowrap text-[10px] text-[var(--color-accent)]"
      title={`Ninguna nómina lo ${verb} sola antes de esa fecha. Al recalcular una nómina aparece sin marcar, y se puede aplicar igual.`}
    >
      📅 {applyFromLabel(advance)}
    </span>
  );
}
