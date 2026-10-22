import { useMemo } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { TripEditModal } from "../../components/TripEditModal";
import { useCarriers } from "../../contexts/CarriersContext";
import { titleCase } from "../../services/transportsService";
import { fmtCurrency } from "../../utils/format";
import { useTripsByDay } from "./useTripsByDay";

// Las vueltas de transporte del ciclo, día por día: la lista de días con su
// total y, del día elegido, sus vueltas para agregar, editar o eliminar.
export default function TransportsModal({ open, onClose, cycle, faena, subfaena, days = [], readOnly = false }) {
  "use no memo";
  const { activeCarriers } = useCarriers();
  const {
    confirmDel,
    dayTrips,
    editing,
    handleDelete,
    handleSave,
    loading,
    selectedDate,
    setConfirmDel,
    setEditing,
    setSelectedDate,
    total,
    totalsByDate,
    trips,
    tripsByDate,
  } = useTripsByDay({ open, cycle, faena, subfaena, days });
  const carrierById = useMemo(() => new Map(activeCarriers.map((c) => [c.id, c])), [activeCarriers]);

  return (
    <>
      <Modal open={open} onClose={onClose} title={`🚐 Transportes — ${cycle?.label || ""}`} size="xl">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-[var(--color-muted)]">
            {trips.length} vuelta{trips.length === 1 ? "" : "s"} · Total {fmtCurrency(total)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12" style={{ minHeight: 360 }}>
          {/* Lista de días */}
          <div className="max-h-[40vh] overflow-auto rounded-md border border-[var(--color-border)] sm:col-span-4 sm:max-h-[60vh]">
            {days.map((d) => {
              const isActive = d === selectedDate;
              const dt = totalsByDate[d] || 0;
              const count = (tripsByDate.get(d) || []).length;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`flex w-full items-center justify-between border-b border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors ${
                    isActive ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]" : "hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <div>
                    <div className="tabular-nums">{d}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">
                      {count} vuelta{count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="tabular-nums text-xs">{dt > 0 ? fmtCurrency(dt) : ""}</div>
                </button>
              );
            })}
          </div>

          {/* Detalle del día */}
          <div className="sm:col-span-8">
            {selectedDate ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">{selectedDate}</h3>
                  {!readOnly && (
                    <button
                      onClick={() => setEditing({ mode: "new", date: selectedDate })}
                      className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
                    >
                      + Agregar vuelta
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="py-6 text-center text-xs text-[var(--color-muted)]">Cargando...</div>
                ) : dayTrips.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-muted)]">
                    Sin vueltas este día
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-[var(--color-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
                    <table className="w-full min-w-[640px] text-xs">
                      <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                        <tr>
                          <th className="px-2 py-1.5">Transp.</th>
                          <th className="px-2 py-1.5">Vehículo</th>
                          <th className="px-2 py-1.5">Destino</th>
                          <th className="px-2 py-1.5 text-right">#Pers</th>
                          <th className="px-2 py-1.5 text-right">Vlts</th>
                          <th className="px-2 py-1.5 text-right">Tarifa</th>
                          <th className="px-2 py-1.5 text-right">Monto</th>
                          <th className="px-2 py-1.5">Estado</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayTrips.map((t) => {
                          const c = carrierById.get(t.carrierId);
                          const isPaid = t.status === "paid";
                          return (
                            <tr key={t.id} className="border-t border-[var(--color-border)]">
                              <td className="px-2 py-1.5">
                                {c ? c.alias : "—"}
                                {t.kind === "approach" && (
                                  <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    acerc.
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5">{t.vehicleAlias || "—"}</td>
                              <td className="px-2 py-1.5">{titleCase(t.destino) || "—"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{t.personCount ?? "—"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{t.qty}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(t.rate)}</td>
                              <td className="px-2 py-1.5 text-right font-medium tabular-nums">{fmtCurrency(t.amount)}</td>
                              <td className="px-2 py-1.5">
                                {isPaid ? (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    pagado
                                  </span>
                                ) : (
                                  <span className="rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-warning)]">
                                    pendiente
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                {!readOnly && !isPaid && (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setEditing({ mode: "edit", trip: t })}
                                      className="rounded px-1 py-0.5 text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                                    >
                                      ✎
                                    </button>
                                    <button
                                      onClick={() => setConfirmDel(t)}
                                      className="rounded px-1 py-0.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                                    >
                                      🗑
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center text-sm text-[var(--color-muted)]">Selecciona un día</div>
            )}
          </div>
        </div>
      </Modal>

      <TripEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        trip={editing?.mode === "edit" ? editing.trip : null}
        carriers={activeCarriers}
        days={days}
        defaultDate={editing?.mode === "new" ? editing.date : selectedDate}
        cycleId={cycle?.id}
        labors={cycle?.labors || []}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onCancel={() => setConfirmDel(null)}
        onConfirm={handleDelete}
        title="Eliminar vuelta"
        message="¿Eliminar esta vuelta? Solo se pueden eliminar vueltas pendientes."
      />
    </>
  );
}
