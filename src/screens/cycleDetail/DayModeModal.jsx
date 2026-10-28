import { useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import { DEFAULT_BASE_DAY, isWeekendDate, TRATO_HE_MODES } from "../../utils/tratoHE";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";

export function DayModeModal({ open, onClose, date, labor, cfg, readOnly, onSave }) {
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState("normal");
  const [isHoliday, setIsHoliday] = useState(false);

  if (useValuesChanged([open, cfg, labor], { onMount: true }) && open && cfg) {
    setPrice(cfg.price ? String(cfg.price) : String(labor?.baseDayDefault ?? DEFAULT_BASE_DAY));
    setMode(cfg.mode || "normal");
    setIsHoliday(!!cfg.isHoliday);
  }

  if (!labor) return null;
  const weekend = isWeekendDate(date);
  const dirty =
    !!cfg &&
    hasChanges(
      {
        price: cfg.price ? String(cfg.price) : String(labor.baseDayDefault ?? DEFAULT_BASE_DAY),
        mode: cfg.mode || "normal",
        isHoliday: !!cfg.isHoliday,
      },
      { price, mode, isHoliday },
    );

  return (
    <Modal open={open} onClose={onClose} dirty={dirty} title={`Configurar día · ${date || ""}`}>
      <div className="space-y-4">
        {weekend && (
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            ⚠ Es {date && new Date(date + "T00:00:00").getDay() === 0 ? "domingo" : "sábado"}. Probable jornada especial.
          </div>
        )}
        <div>
          <label className="block text-sm font-medium">Base diaria ($)</label>
          <input type="number" min="0" disabled={readOnly}
            value={price} onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Modo</label>
          <div className="space-y-2">
            {TRATO_HE_MODES.map((m) => (
              <label key={m.value} className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer">
                <input type="radio" name="mode" value={m.value} checked={mode === m.value}
                  disabled={readOnly}
                  onChange={(e) => setMode(e.target.value)}
                  className="mt-0.5 accent-[var(--color-accent)]" />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer">
          <div>
            <div className="text-sm font-medium">Marcar como feriado</div>
            <div className="text-xs text-[var(--color-muted)]">Resalta el día en rojo (Chile).</div>
          </div>
          <input type="checkbox" checked={isHoliday} disabled={readOnly}
            onChange={(e) => setIsHoliday(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]">
            Cancelar
          </ModalCloseButton>
          <button onClick={() => onSave({ price: Number(price) || 0, mode, isHoliday })}
            disabled={readOnly}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
