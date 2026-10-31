import Modal, { ModalCloseButton } from "../../components/Modal";
import { titleCase } from "../../services/transportsService";
import { fmtCurrency } from "../../utils/format";
import { tripDateLabel, tripLaborLabel } from "./tripCells";
import { useTripRates } from "./unpricedTripsModal/useTripRates";

const inputClass = "w-24 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[var(--color-accent)]";

// Las vueltas pendientes sin precio de los transportistas contratados
// (`utils/unpricedTrips.js`), agrupadas por transportista, para ponerles la
// tarifa. Se monta solo mientras está abierto; `groups` viene de la pestaña
// Transportistas, que ya leyó las vueltas pendientes.
export function UnpricedTripsModal({ groups, onClose, onSaved }) {
  const { refs, rates, setRate, fillDefault, toSave, saving, progress, dirty, save } = useTripRates({ onSaved });
  const total = groups.reduce((s, g) => s + g.trips.length, 0);

  return (
    <Modal
      section="Vueltas sin precio"
      open
      onClose={onClose}
      size="lg"
      dirty={dirty}
      title={`⚠ Vueltas sin precio (${total})`}
      footer={
        <>
          <ModalCloseButton onClick={onClose} disabled={saving} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </ModalCloseButton>
          <button
            onClick={save}
            disabled={saving || toSave.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {saving ? `Guardando ${progress.done} de ${progress.total}…` : `Guardar (${toSave.length})`}
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        Vueltas pendientes de transportistas contratados que todavía no tienen tarifa. Al guardar se recalculan el monto
        de cada vuelta y el total de su resumen y su quincena.
      </p>
      <div className="space-y-4">
        {groups.map((g) => {
          const defaultRate = Number(g.carrier?.defaultRate) || 0;
          return (
            <section key={g.carrierId} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-surface-2)] px-3 py-2">
                <span className="text-sm">
                  <span className="font-semibold">{g.carrier?.alias || "Transportista eliminado"}</span>
                  {g.carrier?.name && <span className="text-xs text-[var(--color-muted)]"> · {g.carrier.name}</span>}
                  <span className="text-xs text-[var(--color-muted)]"> · {g.trips.length} vuelta{g.trips.length === 1 ? "" : "s"}</span>
                </span>
                {defaultRate > 0 && (
                  <button
                    onClick={() => fillDefault(g)}
                    disabled={saving}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                  >
                    Usar {fmtCurrency(defaultRate)} en todas
                  </button>
                )}
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {g.trips.map((t) => {
                  const rate = Number(rates[t.id]) || 0;
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="font-medium">
                          {tripDateLabel(t.date)} · {t.vehicleAlias || "sin vehículo"} · {t.qty} vuelta{Number(t.qty) === 1 ? "" : "s"}
                          {t.kind === "approach" && " · acercamiento"}
                        </div>
                        <div className="text-[var(--color-muted)]">
                          {titleCase(t.lugar) || "—"} → {titleCase(t.destino) || "—"} · {tripLaborLabel(t, refs)}
                          {t.paymentId && " · en un resumen"}
                        </div>
                      </div>
                      <label className="flex items-center gap-1">
                        <span className="text-[var(--color-muted)]">$</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          aria-label={`Tarifa de la vuelta del ${tripDateLabel(t.date)}`}
                          value={rates[t.id] ?? ""}
                          placeholder={defaultRate ? String(defaultRate) : "Tarifa"}
                          onChange={(e) => setRate(t.id, e.target.value)}
                          disabled={saving}
                          className={inputClass}
                        />
                      </label>
                      <span className="w-20 text-right font-semibold tabular-nums">{rate > 0 ? fmtCurrency(rate * (Number(t.qty) || 1)) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
