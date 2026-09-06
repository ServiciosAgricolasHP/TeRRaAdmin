import { useState } from "react";
import Select from "./Select";
import { parseAmount } from "../utils/formula";
import { comboLabel, getDayPiso, getDaySingle } from "../utils/cosechaCombos";

const priceInputCls =
  "w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50";

function ModeToggle({ mode, disabled, onSet }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSet("unit")}
        className={`px-2 py-1.5 ${mode !== "flat" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
      >
        /unid
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSet("flat")}
        className={`px-2 py-1.5 ${mode === "flat" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
      >
        /día
      </button>
    </div>
  );
}

function PriceInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(undefined);
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={draft !== undefined ? draft : value || ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        if (draft === undefined) return;
        const v = parseAmount(draft) || 0;
        setDraft(undefined);
        await onCommit(v);
      }}
      className={priceInputCls}
    />
  );
}

// Fila con confirmación de "quitar" inline (dos toques, sin ConfirmDialog) —
// ConfirmDialog usa el mismo Modal.jsx por dentro, y este contenido ya vive
// adentro de un Modal (el de CycleWorkerEditModal); abrir un segundo Modal
// encima duplicaría el listener de Escape (ver plan de mobile CycleDetail).
function RemovableRow({ label, disabled, onRemove, children }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3.5">
      {confirming ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-[var(--color-danger)]">¿Quitar {label}?</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                await onRemove();
                setConfirming(false);
              }}
              className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-xs text-white"
            >
              Confirmar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-medium">{label}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="shrink-0 text-xs text-[var(--color-danger)] hover:underline"
              >
                Quitar
              </button>
            )}
          </div>
          {children}
        </>
      )}
    </div>
  );
}

function AddComboInline({ catalogs, existingCombos, disabled, onAdd }) {
  const qualities = catalogs.qualities || [];
  const containers = catalogs.containers || [];
  const [open, setOpen] = useState(false);
  const [x, setX] = useState(qualities[0]?.value ?? 0);
  const [y, setY] = useState(containers[0]?.value ?? 0);

  if (disabled) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-[var(--color-accent)] hover:underline">
        + Agregar tipo
      </button>
    );
  }
  const key = `${x}_${y}`;
  const duplicate = existingCombos.some((c) => c.key === key);
  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3.5">
      <Select label="Calidad" value={x} onChange={(v) => setX(Number(v))} options={qualities.map((q) => ({ value: q.value, label: q.label }))} />
      <Select label="Envase / unidad" value={y} onChange={(v) => setY(Number(v))} options={containers.map((c) => ({ value: c.value, label: c.label }))} />
      {duplicate && <div className="text-xs text-[var(--color-warning)]">Este tipo ya existe este día.</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs">
          Cancelar
        </button>
        <button
          type="button"
          disabled={duplicate}
          onClick={async () => {
            await onAdd(x, y);
            setOpen(false);
          }}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

function PisoConfig({ date, activeLabor, dayPrices, readOnly, fmtCurrency, persistDayPiso }) {
  const current = getDayPiso(dayPrices, activeLabor.id, date) || 0;
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">🪙 Piso del día</span>
        {current > 0 && <span className="text-xs text-[var(--color-muted)]">{fmtCurrency(current)}</span>}
      </div>
      <PriceInput value={current} disabled={readOnly} onCommit={(v) => persistDayPiso(activeLabor.id, date, v)} />
    </div>
  );
}

// Configura combos/tiers/etapas/precio del día para TODOS los trabajadores
// de la labor (comparte el mismo camino a Firestore que la barra de precios
// del grid de escritorio — persistComboConfig/addComboToDay/removeComboFromDay/
// persistStagePrice/persistDayPiso/persistNormalDayPrice/persistTratoHEDay).
// A diferencia de CycleWorkerEditModal esto NO es "de un solo trabajador":
// cualquier cambio acá se ve reflejado para todos los que carguen producción
// ese día — por eso vive en una vista aparte, no mezclado con los valores
// por trabajador.
export default function DayConfigContent({
  date,
  activeLabor,
  dayPrices,
  dayCombosByDate,
  dayTiersByDate,
  dayStagesByDate,
  catalogs,
  readOnly,
  fmtCurrency,
  persistComboConfig,
  addComboToDay,
  removeComboFromDay,
  persistStagePrice,
  persistDayPiso,
  persistNormalDayPrice,
  persistTratoHEDay,
  onBack,
}) {
  const laborId = activeLabor.id;
  const type = activeLabor.type;

  const backBtn = (
    <button type="button" onClick={onBack} className="mb-1 text-sm text-[var(--color-accent)] hover:underline">
      ‹ Volver
    </button>
  );

  if (type === "cosecha") {
    const combos = dayCombosByDate[date] || [];
    return (
      <div className="space-y-3">
        {backBtn}
        {combos.map((c) => (
          <RemovableRow
            key={c.key}
            label={comboLabel(catalogs, c.x, c.y)}
            disabled={readOnly}
            onRemove={() => removeComboFromDay(laborId, date, c.key)}
          >
            <div className="flex items-center gap-2">
              <PriceInput value={c.price} disabled={readOnly} onCommit={(v) => persistComboConfig(laborId, date, c.key, { price: v }, false)} />
              <ModeToggle mode={c.mode} disabled={readOnly} onSet={(mode) => persistComboConfig(laborId, date, c.key, { mode }, false)} />
            </div>
          </RemovableRow>
        ))}
        <AddComboInline
          catalogs={catalogs}
          existingCombos={combos}
          disabled={readOnly}
          onAdd={(x, y) => addComboToDay(laborId, date, x, y)}
        />
        <PisoConfig date={date} activeLabor={activeLabor} dayPrices={dayPrices} readOnly={readOnly} fmtCurrency={fmtCurrency} persistDayPiso={persistDayPiso} />
      </div>
    );
  }

  if (type === "trato") {
    const tiers = dayTiersByDate[date] || [];
    return (
      <div className="space-y-3">
        {backBtn}
        {tiers.map((t) => (
          <RemovableRow
            key={t.key}
            label={`Precio ${t.index + 1}`}
            disabled={readOnly}
            onRemove={() => removeComboFromDay(laborId, date, t.key)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <PriceInput value={t.price} disabled={readOnly} onCommit={(v) => persistComboConfig(laborId, date, t.key, { price: v }, true)} />
              <ModeToggle mode={t.mode} disabled={readOnly} onSet={(mode) => persistComboConfig(laborId, date, t.key, { mode }, true)} />
              <select
                disabled={readOnly}
                value={t.unit == null ? "" : String(t.unit)}
                onChange={(e) => {
                  const v = e.target.value;
                  persistComboConfig(laborId, date, t.key, { unit: v === "" ? null : Number(v) }, true);
                }}
                title="Unidad de medida — qué representa cada qty (Metro, Polín, Planta, etc.)"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
              >
                <option value="">Sin unidad</option>
                {(catalogs.tratoUnits || []).map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </RemovableRow>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => persistComboConfig(laborId, date, `t${tiers.length}`, { price: 0, mode: "unit" }, true)}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            + Agregar precio
          </button>
        )}
        <PisoConfig date={date} activeLabor={activeLabor} dayPrices={dayPrices} readOnly={readOnly} fmtCurrency={fmtCurrency} persistDayPiso={persistDayPiso} />
      </div>
    );
  }

  if (type === "tratoEtapas") {
    const stages = dayStagesByDate[date] || [];
    return (
      <div className="space-y-3">
        {backBtn}
        {stages.length === 0 && <div className="text-sm text-[var(--color-muted)]">Esta labor no tiene etapas definidas.</div>}
        {stages.map((st) => (
          <div key={st.id} className="rounded-lg border border-[var(--color-border)] p-3.5">
            <div className="mb-2 text-sm font-medium">
              {st.name}
              {st.counts ? " ✓" : ""}
            </div>
            <div className="flex items-center gap-2">
              <PriceInput value={st.price} disabled={readOnly} onCommit={(v) => persistStagePrice(laborId, date, st.id, { price: v })} />
              <ModeToggle mode={st.mode} disabled={readOnly} onSet={(mode) => persistStagePrice(laborId, date, st.id, { mode })} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "tratoHE") {
    const cfg = getDaySingle(dayPrices, laborId, date, "normal");
    return (
      <div className="space-y-3">
        {backBtn}
        <div className="rounded-lg border border-[var(--color-border)] p-3.5">
          <div className="mb-2 text-sm font-medium">Base del día</div>
          <div className="flex flex-wrap items-center gap-2">
            <PriceInput value={cfg.price} disabled={readOnly} onCommit={(v) => persistTratoHEDay(laborId, date, { price: v })} />
            <Select
              value={cfg.mode || "normal"}
              disabled={readOnly}
              onChange={(mode) => persistTratoHEDay(laborId, date, { mode })}
              options={[
                { value: "normal", label: "Normal" },
                { value: "overtimeOnly", label: "Solo horas extra" },
              ]}
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={!!cfg.isHoliday}
              onChange={(e) => persistTratoHEDay(laborId, date, { isHoliday: e.target.checked })}
              className="h-5 w-5 accent-[var(--color-accent)]"
            />
            Feriado / día rojo
          </label>
        </div>
      </div>
    );
  }

  // Normal (main/supervision/extra)
  const cfg = getDaySingle(dayPrices, laborId, date, "normal");
  return (
    <div className="space-y-3">
      {backBtn}
      <div className="rounded-lg border border-[var(--color-border)] p-3.5">
        <div className="mb-2 text-sm font-medium">Precio sugerido del día</div>
        <PriceInput value={cfg.price} disabled={readOnly} onCommit={(v) => persistNormalDayPrice(laborId, date, v)} />
        <div className="mt-1 text-xs text-[var(--color-muted)]">
          No recalcula lo ya cargado — solo cambia el sugerido para celdas vacías.
        </div>
      </div>
    </div>
  );
}
