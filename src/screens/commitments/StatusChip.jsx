import { displayStatus, daysUntil, urgencyLabel, statusLabel } from "../../utils/commitments";
import { TONE_CLS } from "./helpers";

function urgencyTone(c, today) {
  const status = displayStatus(c, today);
  if (status === "overdue" || status === "protested") return "danger";
  if (status === "postponed") return "warning";
  if (status !== "pending") return "muted";
  const days = daysUntil(c.dueDate, today);
  if (days <= 1) return "warning";
  if (days <= 7) return "accent";
  return "muted";
}

const chipCls = (tone) => `whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLS[tone]}`;

// Un aplazado lleva además el chip de cuánto hace que venció.
export function StatusChip({ c, today }) {
  const status = displayStatus(c, today);
  if (status === "postponed") {
    const days = daysUntil(c.dueDate, today);
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className={chipCls("warning")}>Aplazado</span>
        <span className={chipCls(days < 0 ? "danger" : "warning")}>{urgencyLabel(days)}</span>
      </span>
    );
  }
  const tone = status === "paid" ? "success" : urgencyTone(c, today);
  const text = status === "pending" || status === "overdue" ? urgencyLabel(daysUntil(c.dueDate, today)) : statusLabel(c, today);
  return <span className={chipCls(tone)}>{text}</span>;
}
