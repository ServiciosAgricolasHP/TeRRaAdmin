import { useEffect, useState } from "react";
import Modal from "./Modal";
import DayConfigContent from "./DayConfigContent";
import { formatRutForDisplay } from "../utils/rutUtils";
import { parseAmount } from "../utils/formula";
import { containerLabel, comboLabel, getDaySingle, effectivePiso, tratoUnitLabel } from "../utils/cosechaCombos";
import { DEFAULT_BASE_DAY, DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION, DEFAULT_OVERTIME_RATE } from "../utils/tratoHE";
import { matchesSearchQuery } from "../utils/textSearch";
import { initials } from "../utils/nameUtils";
import { dayHasData } from "../utils/cycleRowUtils";

function effectiveDayPrice(labor, dayCfg) {
  return Number(dayCfg?.price) || Number(labor?.baseDayDefault) || DEFAULT_BASE_DAY;
}

const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
// `d` siempre es "YYYY-MM-DD"; con T00:00:00 el día de la semana se calcula
// en hora local y no se corre un día por UTC.
function formatDayLabel(d) {
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  const [, m, day] = d.split("-");
  return `${WEEKDAYS_SHORT[dt.getDay()]} ${day}/${m}`;
}

const inputCls =
  "w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50";

// Borde izquierdo de acento: marca de un vistazo qué días de la lista ya
// tienen algo cargado.
const cardAccentCls = (hasValue) =>
  `rounded-lg border border-l-4 p-3.5 border-[var(--color-border)] ${
    hasValue ? "border-l-emerald-500/70" : "border-l-transparent"
  }`;

// Modal mobile: edita un trabajador a la vez, una tarjeta por día (en vez de
// una columna por día como la grilla). Escribe con las mismas funciones que la
// grilla de CycleDetail.jsx (commitCosechaCombo/commitTratoTier/
// commitEtapaQty/commitNormalAmount/upsertTratoHEWorkday): el camino a
// Firestore y el cálculo de montos son los mismos.
//
// Configurar un combo/tier/etapa o el precio del día afecta a todos los
// trabajadores de ese día, así que vive en una vista aparte
// (DayConfigContent) que reemplaza el contenido de este mismo Modal en vez de
// abrir uno anidado.
export default function CycleWorkerEditModal({
  workerRut,
  onClose,
  activeLabor,
  row,
  days,
  dayPrices,
  dayCombosByDate,
  dayTiersByDate,
  dayStagesByDate,
  daysWithPiso,
  catalogs,
  readOnly,
  fmtCurrency,
  commitCosechaCombo,
  commitTratoTier,
  commitEtapaQty,
  commitNormalAmount,
  upsertTratoHEWorkday,
  toggleAttendance,
  togglePiso,
  persistComboConfig,
  addComboToDay,
  removeComboFromDay,
  persistStagePrice,
  persistDayPiso,
  persistNormalDayPrice,
  persistTratoHEDay,
  toggleMonthly,
  onRemoveWorker,
  useGrouped,
  currentLeader,
  enabledLeaders,
  leaderBusy,
  assignLeaderToWorker,
  LEADER_LOCAL,
  onNavigate,
  canGoPrev,
  canGoNext,
}) {
  const [drafts, setDrafts] = useState({});
  const [configuringDate, setConfiguringDate] = useState(null);
  const [pickingLeader, setPickingLeader] = useState(false);
  const [leaderFilter, setLeaderFilter] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [bonusDate, setBonusDate] = useState(null);
  const [bonusManejoChecked, setBonusManejoChecked] = useState(false);
  const [bonusSupervisionChecked, setBonusSupervisionChecked] = useState(false);
  const [bonusExtras, setBonusExtras] = useState("");
  const [onlyWithData, setOnlyWithData] = useState(false);
  const [savingFields, setSavingFields] = useState({});

  // El modal queda montado y solo cambia `workerRut`. Al cambiar de
  // trabajador (también con ‹/›) vuelve a la vista principal y descarta los
  // textos sin confirmar, la búsqueda de líder y las confirmaciones pendientes.
  useEffect(() => {
    setConfiguringDate(null);
    setPickingLeader(false);
    setLeaderFilter("");
    setConfirmingRemove(false);
    setBonusDate(null);
    setDrafts({});
  }, [workerRut]);

  // Precarga el formulario de bonos: los valores del día si ya tiene algo
  // cargado, o los `bonusDefaults` del trabajador si está vacío. El
  // BonusEditModal de escritorio mira si existe el workday; acá no se tiene el
  // workday, así que "vacío" es que todos los campos del día estén en cero.
  useEffect(() => {
    if (!bonusDate || !row || !activeLabor) return;
    const isBlankDay =
      !row[`${bonusDate}__m`] &&
      !row[`${bonusDate}__s`] &&
      !(Number(row[`${bonusDate}__x`]) || 0) &&
      !(Number(row[`${bonusDate}__qty`]) || 0) &&
      !(Number(row[`${bonusDate}__he`]) || 0);
    const defaults = activeLabor.bonusDefaults?.[workerRut] || {};
    setBonusManejoChecked(isBlankDay ? !!defaults.manejo : !!row[`${bonusDate}__m`]);
    setBonusSupervisionChecked(isBlankDay ? !!defaults.supervision : !!row[`${bonusDate}__s`]);
    setBonusExtras(row[`${bonusDate}__x`] ? String(row[`${bonusDate}__x`]) : "");
  }, [bonusDate, row, activeLabor, workerRut]);

  const open = !!workerRut && !!row && !!activeLabor;

  const setDraft = (field, value) => setDrafts((prev) => ({ ...prev, [field]: value }));
  const clearDraft = (field) =>
    setDrafts((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  const displayValue = (field) => (drafts[field] !== undefined ? drafts[field] : row?.[field] || "");
  // Campos con una escritura en curso, para el indicador "guardando…". Va
  // aparte de `drafts` (el texto en edición): cubre desde que se suelta el
  // input hasta que Firestore confirma.
  const setSaving = (field, value) =>
    setSavingFields((prev) => {
      if (value) return { ...prev, [field]: true };
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  // El indicador "guardando…" dura al menos MIN_SAVING_MS: con buena conexión
  // la escritura resuelve en pocos ms y no alcanzaría a verse.
  const MIN_SAVING_MS = 350;
  const runWithSaving = async (field, task) => {
    setSaving(field, true);
    const started = Date.now();
    try {
      return await task();
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed < MIN_SAVING_MS) await new Promise((r) => setTimeout(r, MIN_SAVING_MS - elapsed));
      setSaving(field, false);
    }
  };

  if (!open) return null;

  const type = activeLabor.type;
  const isCosecha = type === "cosecha";
  const isTrato = type === "trato";
  const isTratoEtapas = type === "tratoEtapas";
  const isTratoHE = type === "tratoHE";
  const isTemp = !!row._isTemp;

  const doRemove = async () => {
    setRemoving(true);
    try {
      const ok = await onRemoveWorker(workerRut);
      if (ok) onClose();
      else setConfirmingRemove(false);
    } finally {
      setRemoving(false);
    }
  };

  // Acciones sobre el trabajador (no sobre un día): pago mensual, grupo/líder
  // y quitar de la labor. Usan las mismas funciones que los botones de la
  // grilla de escritorio (toggleMonthly / assignLeaderToWorker /
  // removeWorkerByRut en CycleDetail.jsx).
  const renderTopActions = () => (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--color-surface-2)] p-2.5">
      {type === "normal" && !readOnly && (
        <button
          type="button"
          onClick={() => toggleMonthly(workerRut)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            row._monthly
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
          }`}
          title="Pago mensual: las jornadas se registran como asistencia pero no entran al payroll"
        >
          {row._monthly ? "✓ Mensual" : "Marcar mensual"}
        </button>
      )}
      {useGrouped && !isTemp && (
        currentLeader ? (
          <button
            type="button"
            disabled={readOnly || leaderBusy}
            onClick={() => setPickingLeader(true)}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            title="Cambiar líder/grupo"
          >
            Grupo: {currentLeader}
          </button>
        ) : (
          !readOnly && (
            <>
              <button
                type="button"
                disabled={leaderBusy}
                onClick={() => assignLeaderToWorker(workerRut, LEADER_LOCAL)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                Chilenos
              </button>
              <button
                type="button"
                disabled={leaderBusy}
                onClick={() => setPickingLeader(true)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                Elegir líder…
              </button>
            </>
          )
        )
      )}
      {!readOnly && (
        <div className="ml-auto">
          {confirmingRemove ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-muted)]">¿Quitar del labor?</span>
              <button
                type="button"
                disabled={removing}
                onClick={doRemove}
                className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() => setConfirmingRemove(false)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="rounded-full px-2.5 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
            >
              Quitar trabajador
            </button>
          )}
        </div>
      )}
    </div>
  );

  const filteredLeaders = leaderFilter.trim()
    ? enabledLeaders.filter((l) => matchesSearchQuery(l, leaderFilter))
    : enabledLeaders;

  const renderLeaderPicker = () => (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setPickingLeader(false)}
        className="text-sm text-[var(--color-accent)] hover:underline"
      >
        ‹ Volver
      </button>
      <input
        type="text"
        autoFocus
        placeholder="Filtrar..."
        value={leaderFilter}
        onChange={(e) => setLeaderFilter(e.target.value)}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
        {enabledLeaders.length === 0 ? (
          <div className="p-3 text-sm text-[var(--color-muted)]">
            No hay líderes habilitados. Habilita líderes en la colección <code>groupLeader</code>.
          </div>
        ) : filteredLeaders.length === 0 ? (
          <div className="p-3 text-sm text-[var(--color-muted)]">Sin resultados.</div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {filteredLeaders.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  disabled={leaderBusy}
                  onClick={async () => {
                    await assignLeaderToWorker(workerRut, l);
                    setPickingLeader(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                >
                  <span className="font-medium">{l}</span>
                  <span className="text-xs text-[var(--color-muted)]">→</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  // Editor de bonos (manejo/supervisión/extras) de tratoHE. Como las demás
  // sub-vistas, reemplaza el contenido de este Modal en vez de abrir otro
  // encima.
  const renderBonusEditor = () => {
    const bonusManejo = activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO;
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
            <div className="text-xs text-[var(--color-muted)]">{fmtCurrency(bonusManejo)}</div>
          </div>
          <input
            type="checkbox"
            checked={bonusManejoChecked}
            disabled={readOnly}
            onChange={(e) => setBonusManejoChecked(e.target.checked)}
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
              await upsertTratoHEWorkday(activeLabor.id, date, workerRut, {
                hasManejo: bonusManejoChecked,
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
  };

  const renderPisoRow = (d) => {
    if (!daysWithPiso?.has(d)) return null;
    const eff = effectivePiso(activeLabor, dayPrices, d);
    const amt = Number(row[`${d}__piso`]) || 0;
    const checked = amt > 0;
    const hasWd = !!row[`${d}__piso_has_wd`];
    const canToggle = !readOnly && hasWd && eff > 0;
    return (
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2">
        <div className="text-xs text-[var(--color-muted)]">🪙 Piso{eff > 0 ? ` (${fmtCurrency(eff)})` : ""}</div>
        <button
          type="button"
          disabled={!canToggle}
          onClick={() => togglePiso(activeLabor.id, d, workerRut)}
          title={!hasWd ? "Asigná primero producción este día" : eff === 0 ? "Configurá el piso del día o el default de la labor" : ""}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            checked
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
              : canToggle
                ? "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                : "cursor-not-allowed border border-[var(--color-border)] text-[var(--color-muted)] opacity-40"
          }`}
        >
          {checked ? `Con piso · ${fmtCurrency(amt)}` : "Sin piso"}
        </button>
      </div>
    );
  };

  const configureBtn = (d) =>
    !readOnly && (
      <button
        type="button"
        onClick={() => setConfiguringDate(d)}
        title="Configurar precios de este día"
        className="-m-1 rounded p-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
      >
        ⚙
      </button>
    );

  const totalBadge = (amt) =>
    amt > 0 ? (
      <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-accent)]">
        {fmtCurrency(amt)}
      </span>
    ) : (
      <span className="text-xs text-[var(--color-muted)]">—</span>
    );

  // `amountField`: el total del día está en `${d}__total` en
  // cosecha/trato/tratoEtapas y en `${d}__amt` en tratoHE, que no tiene
  // `__total` (ver buildRowsTratoHE).
  const dayHeader = (d, amountField = `${d}__total`) => (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
        {configureBtn(d)}
      </div>
      {totalBadge(Number(row[amountField]) || 0)}
    </div>
  );

  const renderCosechaDay = (d) => {
    const combos = dayCombosByDate[d] || [];
    if (combos.length === 0 && !daysWithPiso?.has(d)) {
      return (
        <div key={d} className="rounded-lg border border-dashed border-[var(--color-border)] p-3.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
            {!readOnly && (
              <button type="button" onClick={() => setConfiguringDate(d)} className="text-xs text-[var(--color-accent)] hover:underline">
                ⚙ Configurar
              </button>
            )}
          </div>
          <div className="text-xs text-[var(--color-muted)]">Sin tipo de pago configurado este día.</div>
        </div>
      );
    }
    return (
      <div key={d} className={cardAccentCls(Number(row[`${d}__total`]) > 0)}>
        {dayHeader(d)}
        <div className="space-y-2">
          {combos.map((c) => {
            const field = `${d}__${c.key}`;
            const amt = Number(row[`${field}__amt`]) || 0;
            return (
              <div key={c.key} className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <div className="truncate">{comboLabel(catalogs, c.x, c.y)}</div>
                  <div className="text-[10px] text-[var(--color-muted)]">
                    {c.mode === "flat" ? `${fmtCurrency(c.price)}/día` : `${fmtCurrency(c.price)}/${containerLabel(catalogs, c.y).toLowerCase()}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={readOnly}
                    value={displayValue(field)}
                    onChange={(e) => setDraft(field, e.target.value)}
                    onBlur={async () => {
                      if (!(field in drafts)) return;
                      const v = drafts[field];
                      await runWithSaving(field, () => commitCosechaCombo(d, c.key, workerRut, v));
                      clearDraft(field);
                    }}
                    className={inputCls}
                  />
                  <span
                    className={`w-16 text-right text-[10px] tabular-nums ${
                      savingFields[field] ? "font-semibold text-[var(--color-accent)] animate-pulse" : "text-[var(--color-muted)]"
                    }`}
                  >
                    {savingFields[field] ? "guardando…" : amt > 0 ? fmtCurrency(amt) : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {renderPisoRow(d)}
      </div>
    );
  };

  const renderTratoDay = (d) => {
    const tiers = dayTiersByDate[d] || [];
    if (tiers.length === 0 && !daysWithPiso?.has(d)) {
      return (
        <div key={d} className="rounded-lg border border-dashed border-[var(--color-border)] p-3.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
            {!readOnly && (
              <button type="button" onClick={() => setConfiguringDate(d)} className="text-xs text-[var(--color-accent)] hover:underline">
                ⚙ Configurar
              </button>
            )}
          </div>
          <div className="text-xs text-[var(--color-muted)]">Sin precio configurado este día.</div>
        </div>
      );
    }
    return (
      <div key={d} className={cardAccentCls(Number(row[`${d}__total`]) > 0)}>
        {dayHeader(d)}
        <div className="space-y-2">
          {tiers.map((t) => {
            const field = `${d}__${t.key}`;
            const amt = Number(row[`${field}__amt`]) || 0;
            const unitLbl = t.unit != null ? tratoUnitLabel(catalogs, t.unit) : null;
            return (
              <div key={t.key} className="flex items-center justify-between gap-2">
                <div className="text-xs text-[var(--color-muted)]">
                  {fmtCurrency(t.price)} {t.mode === "flat" ? "/día" : `/${unitLbl ? unitLbl.toLowerCase() : "unid"}`}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={readOnly}
                    value={displayValue(field)}
                    onChange={(e) => setDraft(field, e.target.value)}
                    onBlur={async () => {
                      if (!(field in drafts)) return;
                      const v = drafts[field];
                      await runWithSaving(field, () => commitTratoTier(d, t.key, workerRut, v));
                      clearDraft(field);
                    }}
                    className={inputCls}
                  />
                  <span
                    className={`w-16 text-right text-[10px] tabular-nums ${
                      savingFields[field] ? "font-semibold text-[var(--color-accent)] animate-pulse" : "text-[var(--color-muted)]"
                    }`}
                  >
                    {savingFields[field] ? "guardando…" : amt > 0 ? fmtCurrency(amt) : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {renderPisoRow(d)}
      </div>
    );
  };

  const renderEtapasDay = (d) => {
    const stages = dayStagesByDate[d] || [];
    if (stages.length === 0) {
      return (
        <div key={d} className="rounded-lg border border-dashed border-[var(--color-border)] p-3.5">
          <div className="mb-1 text-sm font-semibold">{formatDayLabel(d)}</div>
          <div className="text-xs text-[var(--color-muted)]">Sin precio configurado este día.</div>
        </div>
      );
    }
    return (
      <div key={d} className={cardAccentCls(Number(row[`${d}__total`]) > 0)}>
        {dayHeader(d)}
        <div className="space-y-2">
          {stages.map((st) => {
            const field = `${d}__${st.id}`;
            const amt = Number(row[`${field}__amt`]) || 0;
            return (
              <div key={st.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <div className="truncate">
                    {st.name}
                    {st.counts ? " ✓" : ""}
                  </div>
                  <div className="text-[10px] text-[var(--color-muted)]">
                    {fmtCurrency(st.price)}
                    {st.mode === "flat" ? "/día" : "/unid"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={readOnly}
                    value={displayValue(field)}
                    onChange={(e) => setDraft(field, e.target.value)}
                    onBlur={async () => {
                      if (!(field in drafts)) return;
                      const v = drafts[field];
                      await runWithSaving(field, () => commitEtapaQty(d, st.id, workerRut, v));
                      clearDraft(field);
                    }}
                    className={inputCls}
                  />
                  <span
                    className={`w-16 text-right text-[10px] tabular-nums ${
                      savingFields[field] ? "font-semibold text-[var(--color-accent)] animate-pulse" : "text-[var(--color-muted)]"
                    }`}
                  >
                    {savingFields[field] ? "guardando…" : amt > 0 ? fmtCurrency(amt) : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Desglose del monto de tratoHE (base/HE/bonos/extras) como texto siempre
  // visible. En escritorio es el tooltip de `buildBreakdown` (CycleDetail.jsx),
  // que vive dentro del useMemo de columnas de la grilla y no se puede reusar.
  const tratoHEBreakdown = (d, cfg, m, s, x) => {
    const qty = Number(row[`${d}__qty`]) || 0;
    const he = Number(row[`${d}__he`]) || 0;
    const overtimeRate = activeLabor.overtimeRate ?? DEFAULT_OVERTIME_RATE;
    const bonusManejo = activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO;
    const bonusSupervision = activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION;
    const parts = [];
    if (cfg.mode === "overtimeOnly") {
      parts.push("Solo HE");
    } else if (qty > 0) {
      parts.push(`Base ${fmtCurrency(qty)}`);
    }
    if (he > 0) parts.push(`HE ${he}h (${fmtCurrency(he * overtimeRate)})`);
    if (m) parts.push(`Manejo ${fmtCurrency(bonusManejo)}`);
    if (s) parts.push(`Supervisión ${fmtCurrency(bonusSupervision)}`);
    if (x !== 0) parts.push(`Extras ${fmtCurrency(x)}`);
    return parts;
  };

  const renderTratoHEDay = (d) => {
    const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
    const suggested = effectiveDayPrice(activeLabor, cfg);
    const qtyField = `${d}__qty`;
    const qty = Number(row[qtyField]) || 0;
    const heField = `${d}__he`;
    const m = !!row[`${d}__m`];
    const s = !!row[`${d}__s`];
    const x = Number(row[`${d}__x`]) || 0;
    const breakdownParts = tratoHEBreakdown(d, cfg, m, s, x);
    return (
      <div key={d} className={cardAccentCls(Number(row[`${d}__amt`]) > 0)}>
        {dayHeader(d, `${d}__amt`)}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            Base
            <input
              type="text"
              inputMode="decimal"
              disabled={readOnly || cfg.mode === "overtimeOnly"}
              value={displayValue(qtyField)}
              placeholder={cfg.mode === "overtimeOnly" ? "solo HE" : String(suggested)}
              onChange={(e) => setDraft(qtyField, e.target.value)}
              onBlur={async () => {
                if (!(qtyField in drafts)) return;
                const v = parseAmount(drafts[qtyField]) || 0;
                await runWithSaving(qtyField, () => upsertTratoHEWorkday(activeLabor.id, d, workerRut, { qty: v }));
                clearDraft(qtyField);
              }}
              className={inputCls}
            />
            {!readOnly && cfg.mode !== "overtimeOnly" && !qty && !!suggested && drafts[qtyField] === undefined && (
              <button
                type="button"
                onClick={() => runWithSaving(qtyField, () => upsertTratoHEWorkday(activeLabor.id, d, workerRut, { qty: suggested }))}
                className="text-[10px] italic text-[var(--color-muted)] hover:text-[var(--color-accent)]"
              >
                usar {fmtCurrency(suggested)}
              </button>
            )}
            {savingFields[qtyField] && (
              <span className="text-[10px] font-semibold text-[var(--color-accent)] animate-pulse">guardando…</span>
            )}
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            HE
            <input
              type="text"
              inputMode="decimal"
              disabled={readOnly}
              value={displayValue(heField)}
              onChange={(e) => setDraft(heField, e.target.value)}
              onBlur={async () => {
                if (!(heField in drafts)) return;
                const v = parseAmount(drafts[heField]) || 0;
                await runWithSaving(heField, () => upsertTratoHEWorkday(activeLabor.id, d, workerRut, { overtimeHours: v }));
                clearDraft(heField);
              }}
              className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
            />
            h
            {savingFields[heField] && (
              <span className="text-[10px] font-semibold text-[var(--color-accent)] animate-pulse">guardando…</span>
            )}
          </label>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setBonusDate(d)}
            className="ml-auto flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            {m && (
              <span className="rounded bg-blue-100 px-1 text-[9px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">M</span>
            )}
            {s && (
              <span className="rounded bg-purple-100 px-1 text-[9px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                S
              </span>
            )}
            {x !== 0 && (
              <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">+</span>
            )}
            {!m && !s && !x && <span className="text-[var(--color-muted)]">Bonos</span>}
          </button>
        </div>
        {breakdownParts.length > 0 && (
          <div className="mt-2 border-t border-[var(--color-border)] pt-2 text-[10px] tabular-nums text-[var(--color-muted)]">
            {breakdownParts.join(" · ")} = {fmtCurrency(Number(row[`${d}__amt`]) || 0)}
          </div>
        )}
      </div>
    );
  };

  const renderNormalDay = (d) => {
    const dayCfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
    const suggested = effectiveDayPrice(activeLabor, dayCfg);
    if (row._monthly) {
      const present = !!row[`${d}__present`];
      return (
        <div key={d} className={`flex items-center justify-between gap-2 ${cardAccentCls(present)}`}>
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
            {configureBtn(d)}
          </div>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => toggleAttendance(workerRut, d, present)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              present
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
            }`}
          >
            {present ? "✓ Presente" : "Marcar presente"}
          </button>
        </div>
      );
    }
    const field = d;
    const amt = Number(row[field]) || 0;
    return (
      <div key={d} className={`flex items-center justify-between gap-2 ${cardAccentCls(amt > 0)}`}>
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
          {configureBtn(d)}
        </div>
        <div className="flex items-center gap-2">
          {savingFields[field] && (
            <span className="text-[10px] font-semibold text-[var(--color-accent)] animate-pulse">guardando…</span>
          )}
          {!readOnly && !amt && !!suggested && drafts[field] === undefined && (
            <button
              type="button"
              onClick={() => commitNormalAmount(d, workerRut, suggested)}
              className="text-[10px] italic text-[var(--color-muted)] hover:text-[var(--color-accent)]"
            >
              usar {fmtCurrency(suggested)}
            </button>
          )}
          <input
            type="text"
            inputMode="decimal"
            disabled={readOnly}
            value={displayValue(field)}
            placeholder={suggested ? String(suggested) : ""}
            onChange={(e) => setDraft(field, e.target.value)}
            onBlur={async () => {
              if (!(field in drafts)) return;
              const v = drafts[field];
              await runWithSaving(field, () => commitNormalAmount(d, workerRut, v));
              clearDraft(field);
            }}
            className={inputCls}
          />
        </div>
      </div>
    );
  };

  const visibleDays = onlyWithData ? days.filter((d) => dayHasData(row, d)) : days;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      title={
        configuringDate ? (
          <div>
            <div className="font-semibold">Configurar · {configuringDate}</div>
            <div className="text-xs font-normal text-[var(--color-muted)]">{row.name}</div>
          </div>
        ) : pickingLeader ? (
          <div>
            <div className="font-semibold">Asignar líder</div>
            <div className="text-xs font-normal text-[var(--color-muted)]">{row.name}</div>
          </div>
        ) : bonusDate ? (
          <div>
            <div className="font-semibold">Bonos · {bonusDate}</div>
            <div className="text-xs font-normal text-[var(--color-muted)]">{row.name}</div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(-1)}
                disabled={!canGoPrev}
                title="Trabajador anterior"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
              >
                ‹
              </button>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]">
                {initials(row.name)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-semibold">{row.name}</span>
                  {isTemp && (
                    <span className="rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-warning)]">
                      Temporal
                    </span>
                  )}
                  {row._isOrphan && (
                    <span className="rounded bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-danger)]">
                      Fuera del listado
                    </span>
                  )}
                  {row._monthly && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-normal text-emerald-700 dark:text-emerald-300">
                      Mensual
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-[var(--color-muted)]">
                  <span className="font-mono">{formatRutForDisplay(workerRut)}</span>
                  <span>·</span>
                  <span className="font-semibold text-[var(--color-accent)]">{fmtCurrency(row.total || 0)}</span>
                </div>
              </div>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(1)}
                disabled={!canGoNext}
                title="Trabajador siguiente"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
              >
                ›
              </button>
            )}
          </div>
        )
      }
    >
      {configuringDate ? (
        <DayConfigContent
          date={configuringDate}
          activeLabor={activeLabor}
          dayPrices={dayPrices}
          dayCombosByDate={dayCombosByDate}
          dayTiersByDate={dayTiersByDate}
          dayStagesByDate={dayStagesByDate}
          catalogs={catalogs}
          readOnly={readOnly}
          fmtCurrency={fmtCurrency}
          persistComboConfig={persistComboConfig}
          addComboToDay={addComboToDay}
          removeComboFromDay={removeComboFromDay}
          persistStagePrice={persistStagePrice}
          persistDayPiso={persistDayPiso}
          persistNormalDayPrice={persistNormalDayPrice}
          persistTratoHEDay={persistTratoHEDay}
          onBack={() => setConfiguringDate(null)}
        />
      ) : pickingLeader ? (
        renderLeaderPicker()
      ) : bonusDate ? (
        renderBonusEditor()
      ) : (
        <div className="space-y-3 pb-2">
          {renderTopActions()}
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
            <button
              type="button"
              onClick={() => setOnlyWithData(false)}
              className={`px-3 py-1.5 transition-colors ${
                !onlyWithData
                  ? "bg-[var(--color-accent)] font-medium text-[var(--color-accent-fg)]"
                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              }`}
            >
              Todos · {days.length}
            </button>
            <button
              type="button"
              onClick={() => setOnlyWithData(true)}
              className={`border-l border-[var(--color-border)] px-3 py-1.5 transition-colors ${
                onlyWithData
                  ? "bg-[var(--color-accent)] font-medium text-[var(--color-accent-fg)]"
                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              }`}
            >
              Con datos
            </button>
          </div>
          {visibleDays.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-muted)]">
              Sin días con datos.
            </div>
          ) : (
            visibleDays.map((d) => {
              if (isCosecha) return renderCosechaDay(d);
              if (isTrato) return renderTratoDay(d);
              if (isTratoEtapas) return renderEtapasDay(d);
              if (isTratoHE) return renderTratoHEDay(d);
              return renderNormalDay(d);
            })
          )}
        </div>
      )}
    </Modal>
  );
}
