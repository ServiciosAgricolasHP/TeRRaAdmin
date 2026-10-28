import { useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { cadenceMeta } from "../../services/advancesService";
import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";

// Confirmación manual de cuotas antes de generar una nómina: acá se decide qué
// cuotas entran en esta corrida. La cadencia del anticipo (Por pago/Quincenal/
// Mensual) es solo una etiqueta y nada se aplica solo por fecha. Todas vienen
// marcadas por defecto.
export function InstallmentConfirmModal({ state, onCancel, onConfirm }) {
  const [checked, setChecked] = useState(() => new Set());
  if (useValuesChanged([state], { onMount: true })) setChecked(new Set((state?.candidates || []).map((c) => c.advanceId)));
  if (!state) return null;

  const toggle = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Confirmar cuotas de anticipos"
      size="md"
      footer={
        <>
          <button
            onClick={onCancel}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(state.candidates.filter((c) => !checked.has(c.advanceId)).map((c) => c.advanceId))}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Confirmar y generar
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-muted)]">
          Estos anticipos tienen plan de cuotas. Revisa cuáles se descuentan en esta nómina — vienen todas marcadas por defecto.
        </p>
        <div className="space-y-2">
          {state.candidates.map((c) => {
            const p = c.progress;
            const cadence = cadenceMeta(p?.cadence);
            return (
              <label
                key={c.advanceId}
                className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={checked.has(c.advanceId)}
                  onChange={() => toggle(c.advanceId)}
                />
                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{c.workerName}</span>
                    <span className="font-semibold">{fmtCurrency(c.amount)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    Cuota {(p?.paidCount || 0) + 1}/{p?.count || "?"} · {cadence.label}
                    {p?.daysSinceLastCuota != null
                      ? ` · última hace ${p.daysSinceLastCuota} día${p.daysSinceLastCuota === 1 ? "" : "s"}`
                      : " · primera cuota"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
