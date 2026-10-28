import { useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION } from "../../utils/tratoHE";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";

// ============================================================
// Modales de tratoHE
// ============================================================

export function BonusEditModal({ open, onClose, labor, wd, workerName, date, readOnly, onSave }) {
  const [hasManejo, setHasManejo] = useState(false);
  const [hasSupervision, setHasSupervision] = useState(false);
  const [extras, setExtras] = useState("");

  if (useValuesChanged([open, wd, labor], { onMount: true }) && open) {
    const defaults = labor?.bonusDefaults?.[wd?.workerRut] || {};
    setHasManejo(wd ? !!wd.hasManejo : !!defaults.manejo);
    setHasSupervision(wd ? !!wd.hasSupervision : !!defaults.supervision);
    setExtras(wd?.extras ? String(wd.extras) : "");
  }

  if (!labor) return null;
  const bonusManejo = labor.bonusManejo ?? DEFAULT_BONUS_MANEJO;
  const bonusSupervision = labor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION;
  // Los mismos valores con que el efecto de arriba llena el formulario.
  const defaults = labor.bonusDefaults?.[wd?.workerRut] || {};
  const dirty = hasChanges(
    {
      hasManejo: wd ? !!wd.hasManejo : !!defaults.manejo,
      hasSupervision: wd ? !!wd.hasSupervision : !!defaults.supervision,
      extras: wd?.extras ? String(wd.extras) : "",
    },
    { hasManejo, hasSupervision, extras },
  );

  return (
    <Modal open={open} onClose={onClose} dirty={dirty} title={`Bonos · ${date || ""}`}>
      <div className="space-y-3">
        {workerName && <div className="text-sm text-[var(--color-muted)]">{workerName}</div>}
        <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <div>
            <div className="text-sm font-medium">Bono manejo</div>
            <div className="text-xs text-[var(--color-muted)]">${bonusManejo.toLocaleString("es-CL")}</div>
          </div>
          <input type="checkbox" checked={hasManejo} disabled={readOnly}
            onChange={(e) => setHasManejo(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <div>
            <div className="text-sm font-medium">Bono supervisión / líder</div>
            <div className="text-xs text-[var(--color-muted)]">${bonusSupervision.toLocaleString("es-CL")}</div>
          </div>
          <input type="checkbox" checked={hasSupervision} disabled={readOnly}
            onChange={(e) => setHasSupervision(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
        <div>
          <label className="block text-sm font-medium">Bono extras (imprevistos)</label>
          <p className="mb-1 text-xs text-[var(--color-muted)]">
            Monto positivo (bono adicional) o negativo (descuento, ej: media jornada).
          </p>
          <input type="number" disabled={readOnly}
            value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="0"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
            Cancelar
          </ModalCloseButton>
          <button onClick={() => onSave({ hasManejo, hasSupervision, extras: Number(extras) || 0 })}
            disabled={readOnly}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
