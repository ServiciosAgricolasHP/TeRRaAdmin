import { DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION } from "../../../utils/tratoHE";
import { fmtCurrency } from "../../../utils/format";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

// Editor de bonos (manejo/supervisión/extras) de tratoHE. Como las demás
// sub-vistas, reemplaza el contenido de este Modal en vez de abrir otro
// encima.
export function BonusEditor() {
  "use no memo";
  const { activeLabor, readOnly, upsertOvertimeDayWorkday } = useCycleDetail();
  const {
    bonusDate,
    bonusExtras,
    bonusSupervisionChecked,
    drivingBonusChecked,
    setBonusDate,
    setBonusExtras,
    setBonusSupervisionChecked,
    setDrivingBonusChecked,
    workerRut,
  } = useWorkerEdit();
  const drivingBonus = activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO;
  const bonusSupervision = activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setBonusDate(null)}
        className="text-sm text-[var(--color-accent)] hover:underline"
      >
        ‹ Volver
      </button>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div>
          <div className="text-sm font-medium">Bono manejo</div>
          <div className="text-xs text-[var(--color-muted)]">{fmtCurrency(drivingBonus)}</div>
        </div>
        <input
          type="checkbox"
          checked={drivingBonusChecked}
          disabled={readOnly}
          onChange={(e) => setDrivingBonusChecked(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div>
          <div className="text-sm font-medium">Bono supervisión / líder</div>
          <div className="text-xs text-[var(--color-muted)]">{fmtCurrency(bonusSupervision)}</div>
        </div>
        <input
          type="checkbox"
          checked={bonusSupervisionChecked}
          disabled={readOnly}
          onChange={(e) => setBonusSupervisionChecked(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
      </label>
      <div>
        <label className="block text-sm font-medium">Bono extras (imprevistos)</label>
        <p className="mb-1 text-xs text-[var(--color-muted)]">
          Monto positivo (bono adicional) o negativo (descuento, ej: media jornada).
        </p>
        <input
          type="number"
          disabled={readOnly}
          value={bonusExtras}
          onChange={(e) => setBonusExtras(e.target.value)}
          placeholder="0"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => setBonusDate(null)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={async () => {
            const date = bonusDate;
            await upsertOvertimeDayWorkday(activeLabor.id, date, workerRut, {
              hasManejo: drivingBonusChecked,
              hasSupervision: bonusSupervisionChecked,
              extras: Number(bonusExtras) || 0,
            });
            setBonusDate(null);
          }}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
