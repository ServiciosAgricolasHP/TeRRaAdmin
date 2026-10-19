import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { DayHeader } from "./DayHeader";
import { comboLabel, containerLabel, getDaySingle, effectivePiso } from "../../utils/cosechaCombos";
import { parseAmount } from "../../utils/formula";
import { FormulaCellEditor } from "./FormulaCellEditor";
import { DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION, DEFAULT_OVERTIME_RATE, isRedDay } from "../../utils/tratoHE";

// Columna "Piso" al final de cada día en cosecha/trato: un click crea o borra
// el workday `_piso` del trabajador en ese día. Se habilita si el día tiene
// piso configurado y el trabajador ya tiene producción ese día. Muestra el
// piso y el total del día (producción + piso); el tooltip desglosa la suma.
function buildFloorChildCol(date, labor, dayPrices, disabled, toggleFloor) {
  const eff = effectivePiso(labor, dayPrices, date);
  return {
    headerName: "Piso",
    headerTooltip: eff > 0 ? `Piso del día: ${fmtCurrency(eff)}` : "Sin piso configurado",
    field: `${date}__piso`,
    editable: false,
    width: 80,
    cellStyle: { textAlign: "center", padding: 0 },
    cellRenderer: (p) => {
      const amt = Number(p.value) || 0;
      const checked = amt > 0;
      const dayTotal = Number(p.data?.[`${date}__total`]) || 0;
      const production = dayTotal - amt;
      const hasWd = !!p.data?.[`${date}__piso_has_wd`];
      const canToggle = !disabled && hasWd && eff > 0;
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
            if (canToggle) toggleFloor(labor.id, date, p.data.rut);
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
    },
  };
}

// Columnas de ag-grid de la grilla del ciclo según el tipo de labor: RUT y
// nombre fijos a la izquierda, un grupo por día con sus combos, tiers o etapas
// (o horas extras y bonos) y el piso, el total y las acciones de cada fila.
// Los renderers de celda usan los valores y las acciones del render en que se
// armaron las columnas.
export function buildColumnDefs(ctx) {
  const {
    activeLabor,
    allowsMonthly,
    askRemoveWorker,
    assignLeaderToWorker,
    catalogs,
    commitNormalAmount,
    dayCombosByDate,
    dayHasContent,
    dayPrices,
    days,
    dayStagesByDate,
    daysWithFloor,
    dayTiersByDate,
    effectiveDayPrice,
    groupBusy,
    harvestView,
    isGroupedView,
    isHarvestLabor,
    isMobile,
    isOvertimeDayLabor,
    isPieceworkLabor,
    isPieceworkStagesLabor,
    isQtyLabor,
    LEADER_LOCAL,
    noteForDay,
    openDayNote,
    overtimeDayView,
    pieceworkView,
    qrLocked,
    readOnly,
    rutToLeader,
    setAssignTempRut,
    setBonusEdit,
    setEditingWorkerRut,
    setLeaderPickerFor,
    toggleAttendance,
    toggleMonthly,
    toggleFloor,
    upsertOvertimeDayWorkday,
  } = ctx;
  const baseLeft = [
    {
      headerName: "RUT", field: "rut", editable: false, width: 140, pinned: "left",
      // Mobile (<768px): la columna RUT se oculta para que quepan más días.
      hide: isMobile,
      onCellDoubleClicked: (p) => {
        if (p.data?._isHeader || p.data?._isTemp) return;
        const rut = p.data?.rut;
        if (rut) setEditingWorkerRut(rut);
      },
      cellRenderer: (p) => {
        if (p.data?._isHeader) return null;
        if (p.data?._isTemp) {
          if (readOnly) {
            return <span className="text-xs italic text-[var(--color-muted)]">sin RUT</span>;
          }
          return (
            <button
              type="button"
              onClick={() => setAssignTempRut(p.data.rut)}
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
      },
    },
    {
      headerName: "Nombre", field: "name", editable: false, width: isMobile ? 130 : 220, pinned: "left",
      cellRenderer: (p) => {
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
      },
    },
  ];
  const totalCol = {
    headerName: isQtyLabor ? "TOTAL ($)" : "TOTAL",
    field: "total", editable: false, width: isMobile ? 100 : 150, pinned: "right",
    valueFormatter: (p) => fmtCurrency(p.value),
    cellStyle: { fontWeight: 600, color: "var(--color-accent)" },
  };
  // Celda del día de un trabajador de sueldo mensual: ✓ de asistencia en vez
  // de monto. Un click crea o borra la jornada en $0.
  const attendanceCell = (p, d) => {
    const present = !!p.data?.[`${d}__present`];
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
        onClick={(e) => { e.stopPropagation(); toggleAttendance(p.data.rut, d, present); }}
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
  };
  const attendanceCellStyle = { textAlign: "center", padding: 0 };
  const actionsCol = [{
    headerName: "", field: "_actions", editable: false,
    // Ancho según los botones de la celda: ✕, más M en las labores que
    // admiten sueldo mensual y los de líder en la vista por grupo.
    width: isGroupedView
      ? (allowsMonthly ? 160 : 130)
      : (allowsMonthly ? 70 : 50),
    pinned: "right",
    cellRenderer: (p) => {
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
              onClick={() => toggleMonthly(rut)}
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
                onClick={() => assignLeaderToWorker(rut, LEADER_LOCAL)}
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
            onClick={() => askRemoveWorker(rut)}
            disabled={readOnly}
            title="Quitar trabajador"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-danger)]/40 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40"
          >
            ✕
          </button>
        </div>
      );
    },
  }];

  // Encabezado del día con su anotación. Una columna simple usa
  // `headerComponent`; un grupo con hijos, `headerGroupComponent`.
  const dayHdrParams = (d) => ({
    date: d, note: noteForDay(d), onClickNote: openDayNote, clickable: dayHasContent(d),
  });
  const dayCellHdr = (d) => ({
    headerComponent: DayHeader,
    headerComponentParams: dayHdrParams(d),
  });
  const dayGroupHdr = (d) => ({
    headerGroupComponent: DayHeader,
    headerGroupComponentParams: dayHdrParams(d),
  });

  if (isHarvestLabor) {
    if (harvestView === "resumen") {
      const dayCols = days.map((d) => ({
        headerName: d,
        field: `${d}__total`,
        editable: false,
        width: isMobile ? 70 : 110,
        ...dayCellHdr(d),
        valueFormatter: (p) => (p.value ? fmtCurrency(p.value) : ""),
        cellRenderer: (p) => {
          const amt = Number(p.value) || 0;
          if (!amt) return "";
          return <span className="text-right text-sm font-semibold tabular-nums">{fmtCurrency(amt)}</span>;
        },
        cellStyle: { textAlign: "right" },
      }));
      return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
    }
    const dayGroups = days.map((d) => {
      const combos = dayCombosByDate[d] || [];
      const children = combos.map((c) => ({
        headerName: comboLabel(catalogs, c.x, c.y),
        field: `${d}__${c.key}`,
        // `qrLocked`: la sincronización de Pesajes QR hace `upsert` sobre este
        // mismo docId y pisa `qty` y `amount`. El piso sigue editable: es un
        // bono manual que la sincronización no toca.
        editable: !readOnly && !qrLocked,
        width: isMobile ? 78 : 120,
        type: "numericColumn",
        valueParser: (p) => parseAmount(p.newValue),
        cellEditor: FormulaCellEditor,
        cellRenderer: (p) => {
          const qty = Number(p.value) || 0;
          const amt = Number(p.data?.[`${d}__${c.key}__amt`]) || 0;
          if (!qty && !amt) return "";
          return (
            <div className="leading-tight">
              <div className="font-medium tabular-nums">
                {qty.toLocaleString("es-CL")} {containerLabel(catalogs, c.y)}
              </div>
              {amt > 0 && (
                <div className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtCurrency(amt)}</div>
              )}
            </div>
          );
        },
      }));
      if (daysWithFloor.has(d)) {
        children.push(buildFloorChildCol(d, activeLabor, dayPrices, readOnly, toggleFloor));
      }
      return {
        headerName: d, groupId: `g_${d}`,
        ...dayGroupHdr(d),
        children: children.length ? children : [{
          headerName: "—", field: `${d}__placeholder`, editable: false, width: 80, valueGetter: () => "",
        }],
      };
    });
    return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
  }

  if (isPieceworkLabor) {
    if (pieceworkView === "resumen") {
      const dayCols = days.map((d) => ({
        headerName: d,
        field: `${d}__total`,
        editable: false,
        width: isMobile ? 70 : 110,
        ...dayCellHdr(d),
        valueFormatter: (p) => (p.value ? fmtCurrency(p.value) : ""),
        cellRenderer: (p) => {
          const amt = Number(p.value) || 0;
          if (!amt) return "";
          return <span className="text-right text-sm font-semibold tabular-nums">{fmtCurrency(amt)}</span>;
        },
        cellStyle: { textAlign: "right" },
      }));
      return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
    }
    const dayGroups = days.map((d) => {
      const tiers = dayTiersByDate[d] || [];
      const children = tiers.map((t) => ({
        headerName: `${fmtCurrency(t.price)} ${t.mode === "flat" ? "/día" : "/unid"}`,
        field: `${d}__${t.key}`,
        editable: !readOnly,
        width: isMobile ? 78 : 120,
        type: "numericColumn",
        valueParser: (p) => parseAmount(p.newValue),
        cellEditor: FormulaCellEditor,
        cellRenderer: (p) => {
          const qty = Number(p.value) || 0;
          const amt = Number(p.data?.[`${d}__${t.key}__amt`]) || 0;
          if (!qty && !amt) return "";
          return (
            <div className="leading-tight">
              <div className="font-medium tabular-nums">{qty.toLocaleString("es-CL")}</div>
              {amt > 0 && (
                <div className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtCurrency(amt)}</div>
              )}
            </div>
          );
        },
      }));
      if (daysWithFloor.has(d)) {
        children.push(buildFloorChildCol(d, activeLabor, dayPrices, readOnly, toggleFloor));
      }
      return {
        headerName: d, groupId: `g_${d}`,
        ...dayGroupHdr(d),
        children: children.length ? children : [{
          headerName: "—", field: `${d}__placeholder`, editable: false, width: 80, valueGetter: () => "",
        }],
      };
    });
    return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
  }

  if (isPieceworkStagesLabor) {
    // Cada día es un grupo; sus columnas hijas son las etapas visibles ese
    // día (con precio configurado o con producción). El precio del día va en
    // el tooltip del encabezado. La celda edita la cantidad y muestra el
    // monto debajo.
    const dayGroups = days.map((d) => {
      const stages = dayStagesByDate[d] || [];
      const children = stages.map((st) => ({
        headerName: `${st.name}${st.counts ? " ✓" : ""}`,
        headerTooltip: `${st.name} · ${fmtCurrency(st.price)}${st.mode === "flat" ? "/día" : "/unid"}${st.counts ? " · cuenta para producción" : " · no cuenta unidades"}`,
        field: `${d}__${st.id}`,
        editable: !readOnly,
        width: isMobile ? 84 : 130,
        type: "numericColumn",
        valueParser: (p) => parseAmount(p.newValue),
        cellEditor: FormulaCellEditor,
        cellRenderer: (p) => {
          const qty = Number(p.value) || 0;
          const amt = Number(p.data?.[`${d}__${st.id}__amt`]) || 0;
          if (!qty && !amt) return "";
          return (
            <div className="leading-tight">
              <div className="font-medium tabular-nums">{qty.toLocaleString("es-CL")}</div>
              {amt > 0 && (
                <div className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtCurrency(amt)}</div>
              )}
            </div>
          );
        },
      }));
      return {
        headerName: d, groupId: `g_${d}`,
        ...dayGroupHdr(d),
        children: children.length ? children : [{
          headerName: "sin precio", field: `${d}__placeholder`, editable: false, width: 90, valueGetter: () => "",
        }],
      };
    });
    return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
  }

  if (isOvertimeDayLabor) {
    const labor = activeLabor;
    const rates = {
      bonusManejo: labor?.bonusManejo ?? DEFAULT_BONUS_MANEJO,
      bonusSupervision: labor?.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION,
      overtimeRate: labor?.overtimeRate ?? DEFAULT_OVERTIME_RATE,
    };
    const buildBreakdown = (data, d, cfg) => {
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
    };

    // Modo resumen: una columna de $ por día
    if (overtimeDayView === "resumen") {
      const dayCols = days.map((d) => {
        const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
        const red = isRedDay(d, cfg);
        const headerSuffix = cfg.mode === "overtimeOnly" ? " · solo HE" : "";
        const headerLabel = `${d}${cfg.isHoliday ? " 🎉" : ""}${headerSuffix}`;
        return {
          headerName: headerLabel,
          field: `${d}__amt`,
          editable: false,
          width: isMobile ? 70 : 110,
          ...dayCellHdr(d),
          headerClass: red ? "ag-header-red-day" : undefined,
          valueFormatter: (p) => p.value ? fmtCurrency(p.value) : "",
          cellRenderer: (p) => {
            if (p.data?._monthly) return attendanceCell(p, d);
            const amt = Number(p.value) || 0;
            if (!amt) return "";
            return (
              <button
                onClick={() => setBonusEdit({ laborId: activeLabor.id, date: d, workerRut: p.data.rut })}
                disabled={readOnly}
                title={buildBreakdown(p.data, d, cfg)}
                className="h-full w-full text-right text-sm font-semibold tabular-nums hover:underline"
              >
                {fmtCurrency(amt)}
              </button>
            );
          },
          cellStyle: (p) => p.data?._monthly ? attendanceCellStyle : { textAlign: "right" },
        };
      });
      return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
    }

    const dayGroups = days.map((d) => {
      const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
      const red = isRedDay(d, cfg);
      const headerSuffix = cfg.mode === "overtimeOnly" ? " · solo HE" : "";
      const headerLabel = `${d}${cfg.isHoliday ? " 🎉" : ""}${headerSuffix}`;
      return {
        headerName: headerLabel,
        groupId: `g_${d}`,
        ...dayGroupHdr(d),
        headerClass: red ? "ag-header-red-day" : undefined,
        children: [
          {
            headerName: "Base",
            field: `${d}__qty`,
            // Una celda vacía no es editable, así el click llega al botón de
            // la base sugerida; con valor, se edita normalmente. Las filas de
            // sueldo mensual solo marcan asistencia.
            editable: (p) => !readOnly && !p.data?._monthly && Number(p.data?.[`${d}__qty`] || 0) > 0,
            width: isMobile ? 85 : 130,
            type: "numericColumn",
            valueParser: (p) => parseAmount(p.newValue),
            cellEditor: FormulaCellEditor,
            valueFormatter: (p) => (p.value ? fmtCurrency(p.value) : ""),
            headerTooltip: `Base del día (monto). Sugerido: ${fmtCurrency(effectiveDayPrice(labor, cfg))}. Abajo: bonos (M/S/+) y total del día — click para editar.`,
            cellStyle: { padding: 0 },
            cellRenderer: (p) => {
              if (p.data?._monthly) return attendanceCell(p, d);
              const v = Number(p.value) || 0;
              const m = p.data?.[`${d}__m`];
              const s = p.data?.[`${d}__s`];
              const x = Number(p.data?.[`${d}__x`]) || 0;
              const amt = Number(p.data?.[`${d}__amt`]) || 0;
              const suggested = effectiveDayPrice(labor, cfg);
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
                            await upsertOvertimeDayWorkday(activeLabor.id, d, p.data.rut, { qty: suggested });
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
                      setBonusEdit({ laborId: activeLabor.id, date: d, workerRut: p.data.rut });
                    }}
                    disabled={readOnly}
                    title={buildBreakdown(p.data, d, cfg)}
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
            },
          },
          {
            headerName: "HE",
            field: `${d}__he`,
            editable: (p) => !readOnly && !p.data?._monthly,
            width: 60,
            type: "numericColumn",
            valueParser: (p) => parseAmount(p.newValue),
            cellEditor: FormulaCellEditor,
            valueFormatter: (p) => (p.value ? `${p.value}h` : ""),
            headerTooltip: "Horas extras",
          },
        ],
      };
    });
    return [...baseLeft, ...dayGroups, totalCol, ...actionsCol];
  }

  const dayCols = days.map((d) => {
    const dayCfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
    const suggested = effectiveDayPrice(activeLabor, dayCfg);
    return {
      headerName: d, field: d,
      ...dayCellHdr(d),
      // Las filas de sueldo mensual no se editan: solo marcan asistencia con
      // un click. Una celda vacía tampoco, así el click llega al botón del
      // precio sugerido; con valor, se edita con doble click.
      editable: (p) => !readOnly && !p.data?._monthly && Number(p.data?.[d] || 0) > 0,
      width: isMobile ? 70 : 110,
      type: "numericColumn",
      valueParser: (p) => parseAmount(p.newValue),
      cellEditor: FormulaCellEditor,
      valueFormatter: (p) => fmtCurrency(p.value),
      headerTooltip: `${d} · Sugerido: ${fmtCurrency(suggested)}. Click en celda vacía para usarlo, doble click para editar.`,
      cellRenderer: (p) => {
        if (p.data?._monthly) return attendanceCell(p, d);
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
              await commitNormalAmount(d, p.data.rut, suggested);
            }}
            className="flex h-full w-full items-center justify-end gap-1 text-[10px] italic text-[var(--color-muted)] hover:not-italic hover:text-[var(--color-accent)]"
            title={`Click: usar precio sugerido ${fmtCurrency(suggested)}. Doble click después para modificar.`}
          >
            <span className="text-[8px]">+</span>
            <span className="tabular-nums">{fmtCurrency(suggested)}</span>
          </button>
        );
      },
      cellStyle: (p) => p.data?._monthly ? attendanceCellStyle : { textAlign: "right" },
    };
  });
  return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
}
