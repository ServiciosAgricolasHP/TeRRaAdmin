import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { useGridCells } from "./GridCellsContext";

// Las celdas de la grilla del ciclo. Cada columna les pasa lo suyo en
// `cellRendererParams` (el día, el campo del monto, el precio sugerido); las
// acciones y lo que cambia sin rehacer las columnas lo leen de
// `GridCellsContext`, así un clic siempre llama a la acción vigente. Los
// botones que escriben no responden a Shift+clic, que elige celdas
// (useCellRange).

export function RutCell(p) {
  const { readOnly, setAssignTempRut } = useGridCells();
  const rut = p.data?.rut;
  if (p.data?._isHeader) return null;
  if (p.data?._isTemp) {
    if (readOnly) {
      return <span className="text-xs italic text-[var(--color-muted)]">sin RUT</span>;
    }
    return (
      <button
        type="button"
        onClick={() => setAssignTempRut(rut)}
        className="rounded border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
        title="Asignar un RUT real a este trabajador temporal"
      >
        Asignar RUT
      </button>
    );
  }
  return (
    <span
      className="cursor-pointer hover:underline"
      title="Doble click para editar el trabajador"
    >
      {formatRutForDisplay(p.data?._displayRut || p.value)}
    </span>
  );
}

export function NameCell(p) {
  if (p.data?._isHeader) return p.value;
  const badges = [];
  if (p.data?._isTemp) {
    badges.push(
      <span
        key="temp"
        className="rounded border border-amber-500/50 bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
        title="Trabajador temporal: solo vive en este ciclo y se ignora al pagar"
      >
        Temporal
      </span>
    );
  }
  if (p.data?._monthly) {
    badges.push(
      <span
        key="monthly"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
        title="Pago mensual: las jornadas se registran como asistencia pero no entran a la nómina"
      >
        M
      </span>
    );
  }
  if (p.data?._isOrphan) {
    badges.push(
      <span
        key="orphan"
        className="rounded border border-rose-500/50 bg-rose-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300"
        title="Tiene producción registrada pero ya no está en el listado de la labor. Las métricas y la nómina lo siguen contando. Elimina sus jornadas o vuelve a agregarlo al listado."
      >
        Huérfano
      </span>
    );
  }
  if (badges.length === 0) return p.value;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{p.value}</span>
      {badges}
    </span>
  );
}

// ✕ para quitar a la persona, M en las labores que admiten sueldo mensual y,
// en la vista por grupo, los botones para asignarle líder.
export function ActionsCell(p) {
  const { actionsRef, allowsMonthly, groupBusy, isGroupedView, leaderLocal, readOnly, rutToLeader, setLeaderPickerFor } = useGridCells();
  const rut = p.data?.rut;
  if (!rut || p.data?._isHeader) return null;
  const isTemp = !!p.data?._isTemp;
  const isMonthly = !!p.data?._monthly;
  const showAssign = isGroupedView && !rutToLeader.has(rut) && !readOnly && !isTemp;
  return (
    <div className="flex items-center gap-1.5">
      {allowsMonthly && !readOnly && (
        <button
          type="button"
          onClick={() => actionsRef.current.toggleMonthly(rut)}
          className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
            isMonthly
              ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 dark:text-emerald-300"
              : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
          }`}
          title={isMonthly
            ? "Pago mensual activo. Click para volver a pago por día."
            : "Marcar como pago mensual (no entra a la nómina)."}
        >
          M
        </button>
      )}
      {showAssign && (
        <>
          <button
            type="button"
            onClick={() => actionsRef.current.assignLeaderToWorker(rut, leaderLocal)}
            disabled={groupBusy}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            title="Marcar como CHILENOS"
          >
            Chilenos
          </button>
          <button
            type="button"
            onClick={() => setLeaderPickerFor(rut)}
            disabled={groupBusy}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            title="Elegir otro líder"
          >
            …
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => actionsRef.current.askRemoveWorker(rut)}
        disabled={readOnly}
        title="Quitar trabajador"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-danger)]/40 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40"
      >
        ✕
      </button>
    </div>
  );
}

// Celda del día de un trabajador de sueldo mensual: ✓ de asistencia en vez
// de monto. Un click crea o borra la jornada en $0.
function AttendanceCell({ data, d }) {
  const { actionsRef, readOnly } = useGridCells();
  const present = !!data?.[`${d}__present`];
  if (readOnly) {
    return (
      <span className={present ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-[var(--color-muted)]"}>
        {present ? "✓" : ""}
      </span>
    );
  }
  return (
    <div
      role="button"
      onClick={(e) => { e.stopPropagation(); if (!e.shiftKey) actionsRef.current.toggleAttendance(data.rut, d, present); }}
      className={`flex h-full w-full cursor-pointer items-center justify-center text-base font-bold transition-colors ${
        present
          ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
          : "text-transparent hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
      }`}
      title={present ? "Asistencia registrada (sin pago). Click para borrar." : "Marcar asistencia sin pago."}
    >
      {present ? "✓" : "+"}
    </div>
  );
}

// Columna "Piso" al final de cada día en cosecha/trato: un click crea o borra
// el workday `_piso` del trabajador en ese día. Se habilita si el día tiene
// piso configurado (`eff`) y el trabajador ya tiene producción ese día.
// Muestra el piso y el total del día (producción + piso); el tooltip desglosa
// la suma.
export function FloorCell(p) {
  const { actionsRef, readOnly } = useGridCells();
  const { date, eff, laborId } = p;
  const rut = p.data?.rut;
  const amt = Number(p.value) || 0;
  const checked = amt > 0;
  const dayTotal = Number(p.data?.[`${date}__total`]) || 0;
  const production = dayTotal - amt;
  const hasWd = !!p.data?.[`${date}__piso_has_wd`];
  const canToggle = !readOnly && hasWd && eff > 0;
  const breakdown = dayTotal > 0 ? `\n${fmtCurrency(production)} producción + ${fmtCurrency(amt)} piso = ${fmtCurrency(dayTotal)}` : "";
  const title = !hasWd
    ? "Asigna primero producción este día"
    : eff === 0
      ? "Configura el piso del día o el piso por defecto de la labor"
      : `${checked ? "Quitar piso" : "Asignar piso"} (${fmtCurrency(eff)})${breakdown}`;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (canToggle && !e.shiftKey) actionsRef.current.toggleFloor(laborId, date, rut);
      }}
      disabled={!canToggle}
      title={title}
      className={`flex h-full w-full flex-col items-center justify-center gap-0 leading-tight transition-colors ${
        checked
          ? "bg-amber-500/20 text-amber-700 hover:bg-amber-500/30 dark:text-amber-300"
          : canToggle
            ? "text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
            : "cursor-not-allowed text-[var(--color-muted)] opacity-30"
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="text-sm">{checked ? "🪙" : "·"}</span>
        {checked && <span className="text-[10px] tabular-nums">{fmtCurrency(amt)}</span>}
      </div>
      {dayTotal > 0 && (
        <span className="text-[10px] font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(dayTotal)}</span>
      )}
    </button>
  );
}

// El monto del día en la vista resumen de cosecha y trato.
export function DayTotalCell(p) {
  const amt = Number(p.value) || 0;
  if (!amt) return "";
  return <span className="text-right text-sm font-semibold tabular-nums">{fmtCurrency(amt)}</span>;
}

// Cantidad de un combo, tier o etapa (con `unit`, la del envase en cosecha) y,
// debajo, su monto (`amtField`).
export function QtyCell(p) {
  const qty = Number(p.value) || 0;
  const amt = Number(p.data?.[p.amtField]) || 0;
  if (!qty && !amt) return "";
  return (
    <div className="leading-tight">
      <div className="font-medium tabular-nums">
        {qty.toLocaleString("es-CL")}{p.unit ? ` ${p.unit}` : ""}
      </div>
      {amt > 0 && (
        <div className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtCurrency(amt)}</div>
      )}
    </div>
  );
}

// El desglose de una jornada con horas extras para el tooltip: base, horas
// extras, bonos y total.
function overtimeBreakdown(data, d, cfg, rates) {
  const qty = Number(data?.[`${d}__qty`]) || 0;
  const overtimeHours = Number(data?.[`${d}__he`]) || 0;
  const m = !!data?.[`${d}__m`];
  const s = !!data?.[`${d}__s`];
  const x = Number(data?.[`${d}__x`]) || 0;
  const lines = [];
  const base = cfg.mode === "overtimeOnly" ? 0 : qty;
  if (cfg.mode === "overtimeOnly") {
    lines.push(`Solo HE (sin base)`);
  } else if (qty > 0) {
    lines.push(`Base: ${fmtCurrency(base)}`);
  }
  if (overtimeHours > 0) lines.push(`HE: ${overtimeHours}h × ${fmtCurrency(rates.overtimeRate)} = ${fmtCurrency(overtimeHours * rates.overtimeRate)}`);
  if (m) lines.push(`Manejo: ${fmtCurrency(rates.bonusManejo)}`);
  if (s) lines.push(`Supervisión: ${fmtCurrency(rates.bonusSupervision)}`);
  if (x !== 0) lines.push(`Extras: ${fmtCurrency(x)}`);
  const total = Number(data?.[`${d}__amt`]) || 0;
  if (lines.length === 0) return "Sin movimiento";
  lines.push(`= ${fmtCurrency(total)}`);
  return lines.join("\n");
}

// Vista resumen de las jornadas con horas extras: el total del día, que abre
// los bonos.
export function OvertimeSummaryCell(p) {
  const { readOnly, setBonusEdit } = useGridCells();
  const { d, cfg, laborId, rates } = p;
  const rut = p.data?.rut;
  if (p.data?._monthly) return <AttendanceCell data={p.data} d={d} />;
  const amt = Number(p.value) || 0;
  if (!amt) return "";
  return (
    <button
      onClick={() => setBonusEdit({ laborId, date: d, workerRut: rut })}
      disabled={readOnly}
      title={overtimeBreakdown(p.data, d, cfg, rates)}
      className="h-full w-full text-right text-sm font-semibold tabular-nums hover:underline"
    >
      {fmtCurrency(amt)}
    </button>
  );
}

// La base del día en las jornadas con horas extras: el monto o, vacía, el
// botón de la base sugerida; debajo, los bonos (M/S/+) y el total del día,
// que abren los bonos.
export function OvertimeBaseCell(p) {
  const { actionsRef, readOnly, setBonusEdit } = useGridCells();
  const { d, cfg, laborId, rates, suggested } = p;
  const rut = p.data?.rut;
  if (p.data?._monthly) return <AttendanceCell data={p.data} d={d} />;
  const v = Number(p.value) || 0;
  const m = p.data?.[`${d}__m`];
  const s = p.data?.[`${d}__s`];
  const x = Number(p.data?.[`${d}__x`]) || 0;
  const amt = Number(p.data?.[`${d}__amt`]) || 0;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-1 items-center justify-end px-1">
        {v > 0 ? (
          <span className="font-bold tabular-nums text-[var(--color-text)]">
            {fmtCurrency(v)}
          </span>
        ) : (
          !readOnly && cfg.mode !== "overtimeOnly" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (e.shiftKey) return;
                await actionsRef.current.upsertOvertimeDayWorkday(laborId, d, rut, { qty: suggested });
              }}
              className="flex h-full w-full items-center justify-end gap-1 text-[10px] italic text-[var(--color-muted)] hover:not-italic hover:text-[var(--color-accent)]"
              title={`Click: usar base sugerida ${fmtCurrency(suggested)}. Doble click después para modificar.`}
            >
              <span className="text-[8px]">+</span>
              <span className="tabular-nums">{fmtCurrency(suggested)}</span>
            </button>
          )
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setBonusEdit({ laborId, date: d, workerRut: rut });
        }}
        disabled={readOnly}
        title={overtimeBreakdown(p.data, d, cfg, rates)}
        className="flex shrink-0 items-center justify-center gap-1 border-t border-[var(--color-border)] px-1 py-0.5 text-[9px] leading-none hover:bg-[var(--color-accent-soft)]"
      >
        {m && <span className="rounded bg-blue-100 px-1 font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">M</span>}
        {s && <span className="rounded bg-purple-100 px-1 font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">S</span>}
        {x !== 0 && <span className="rounded bg-amber-100 px-1 font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">+</span>}
        {!m && !s && !x && <span className="text-[var(--color-muted)] opacity-40">···</span>}
        {amt > 0 && (
          <span className="ml-1 font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(amt)}</span>
        )}
      </button>
    </div>
  );
}

// Día de una labor al día: el monto o, vacía, el botón del precio sugerido.
export function NormalDayCell(p) {
  const { actionsRef, readOnly } = useGridCells();
  const { d, suggested } = p;
  const rut = p.data?.rut;
  if (p.data?._monthly) return <AttendanceCell data={p.data} d={d} />;
  const amt = Number(p.value) || 0;
  if (amt) {
    return (
      <span className="font-bold tabular-nums text-[var(--color-text)]">
        {fmtCurrency(amt)}
      </span>
    );
  }
  if (readOnly || !suggested) return "";
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (e.shiftKey) return;
        await actionsRef.current.commitNormalAmount(d, rut, suggested);
      }}
      className="flex h-full w-full items-center justify-end gap-1 text-[10px] italic text-[var(--color-muted)] hover:not-italic hover:text-[var(--color-accent)]"
      title={`Click: usar precio sugerido ${fmtCurrency(suggested)}. Doble click después para modificar.`}
    >
      <span className="text-[8px]">+</span>
      <span className="tabular-nums">{fmtCurrency(suggested)}</span>
    </button>
  );
}
