import { TypeToConfirm } from "../../components/TypeToConfirm";
import { useCycleDetail } from "./CycleDetailContext";
import { useLaborClear } from "./useLaborClear";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "—");
const plural = (n, one, many) => `${n.toLocaleString("es-CL")} ${n === 1 ? one : many}`;
const dateList = (dates) => dates.slice(0, 8).map(fmtDate).join(", ") + (dates.length > 8 ? "…" : "");

// Limpiar la labor activa, para cualquier tipo de labor: dice qué se borra y
// qué queda, y pide escribir "limpiar" para confirmar.
export default function ClearLaborModal({ onClose }) {
  const { activeLabor } = useCycleDetail();
  const { busy, plan, progress, run } = useLaborClear({ onDone: onClose });
  if (!plan) return null;
  const nothing = plan.deletes.length === 0 && plan.workersRemoved === 0;
  const items = [
    plan.deletes.length > 0
      ? `Borra ${plural(plan.deletes.length, "jornada", "jornadas")} de la labor: producción, pisos y asistencia.`
      : "La labor no tiene jornadas para borrar.",
    plan.workersRemoved > 0 && `Saca a ${plural(plan.workersRemoved, "persona", "personas")} de la labor.`,
    plan.daysRemoved.length > 0 && `Quita del ciclo ${plural(plan.daysRemoved.length, "día que queda", "días que quedan")} sin jornadas: ${dateList(plan.daysRemoved)}.`,
    plan.kept.length > 0 && `${plural(plan.kept.length, "jornada ya está", "jornadas ya están")} en una nómina: no se toca${plan.kept.length === 1 ? "" : "n"}, y su${plan.kept.length === 1 ? "" : "s"} persona${plan.kept.length === 1 ? "" : "s"} y su${plan.kept.length === 1 ? "" : "s"} día${plan.kept.length === 1 ? "" : "s"} quedan.`,
    plan.tripDays.length > 0 && `${plural(plan.tripDays.length, "día queda", "días quedan")} en el ciclo porque tiene${plan.tripDays.length === 1 ? "" : "n"} vueltas de transporte: ${dateList(plan.tripDays)}.`,
    "Los precios, los pisos configurados y la labor quedan.",
  ].filter(Boolean);
  const pendingDates = [...new Set(plan.pendingTrips.map((t) => t.date))].sort();
  return (
    <TypeToConfirm
      word="limpiar"
      title={`Limpiar la labor · ${activeLabor?.name || ""}`}
      confirmLabel="Limpiar"
      busy={busy}
      progress={progress}
      section="Limpiar labor"
      onConfirm={nothing ? onClose : run}
      onCancel={() => !busy && onClose()}
    >
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
      {plan.pendingTrips.length > 0 && (
        <p className="rounded-md bg-[var(--color-warning-soft)] px-3 py-2 text-sm text-[var(--color-warning)]">
          ⚠ Hay {plural(plan.pendingTrips.length, "vuelta de transporte sin pagar", "vueltas de transporte sin pagar")} en los días de esta labor ({dateList(pendingDates)}). No se borra{plan.pendingTrips.length === 1 ? "" : "n"}: si era{plan.pendingTrips.length === 1 ? "" : "n"} para estas jornadas, revísala{plan.pendingTrips.length === 1 ? "" : "s"} en 🚐 Transportes.
        </p>
      )}
    </TypeToConfirm>
  );
}
