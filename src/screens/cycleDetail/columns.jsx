import { fmtCurrency } from "../../utils/format";
import { DayHeader } from "./DayHeader";
import { comboLabel, containerLabel, getDaySingle, effectivePiso } from "../../utils/cosechaCombos";
import { parseAmount } from "../../utils/formula";
import { FormulaCellEditor } from "./FormulaCellEditor";
import { DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION, DEFAULT_OVERTIME_RATE, isRedDay } from "../../utils/tratoHE";
import {
  ActionsCell,
  DayTotalCell,
  FloorCell,
  NameCell,
  NormalDayCell,
  OvertimeBaseCell,
  OvertimeSummaryCell,
  QtyCell,
  RutCell,
} from "./GridCells";

// Columna "Piso" al final de cada día en cosecha/trato (ver FloorCell).
function buildFloorChildCol(date, labor, dayPrices) {
  const eff = effectivePiso(labor, dayPrices, date);
  return {
    headerName: "Piso",
    headerTooltip: eff > 0 ? `Piso del día: ${fmtCurrency(eff)}` : "Sin piso configurado",
    field: `${date}__piso`,
    editable: false,
    width: 80,
    cellStyle: { textAlign: "center", padding: 0 },
    cellRenderer: FloorCell,
    cellRendererParams: { date, eff, laborId: labor.id },
  };
}

// Columnas de ag-grid de la grilla del ciclo según el tipo de labor: RUT y
// nombre fijos a la izquierda, un grupo por día con sus combos, tiers o etapas
// (o horas extras y bonos) y el piso, el total y las acciones de cada fila.
// Dependen solo de la forma de la grilla: las celdas (GridCells.jsx) y el
// encabezado del día leen las acciones de GridCellsContext.
export function buildColumnDefs(ctx) {
  const {
    activeLabor,
    allowsMonthly,
    catalogs,
    dayCombosByDate,
    dayHeaders,
    dayPrices,
    days,
    dayStagesByDate,
    daysWithFloor,
    dayTiersByDate,
    effectiveDayPrice,
    harvestView,
    isGroupedView,
    isHarvestLabor,
    isMobile,
    isOvertimeDayLabor,
    isPieceworkLabor,
    isPieceworkStagesLabor,
    isQtyLabor,
    overtimeDayView,
    pieceworkView,
    qrLocked,
    readOnly,
    setEditingWorkerRut,
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
      cellRenderer: RutCell,
    },
    {
      headerName: "Nombre", field: "name", editable: false, width: isMobile ? 130 : 220, pinned: "left",
      cellRenderer: NameCell,
    },
  ];
  const totalCol = {
    headerName: isQtyLabor ? "TOTAL ($)" : "TOTAL",
    field: "total", editable: false, width: isMobile ? 100 : 150, pinned: "right",
    valueFormatter: (p) => fmtCurrency(p.value),
    cellStyle: { fontWeight: 600, color: "var(--color-accent)" },
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
    cellRenderer: ActionsCell,
  }];

  // Encabezado del día con su anotación (`dayHeaders[d]`: `note` y
  // `clickable`). Una columna simple usa `headerComponent`; un grupo con
  // hijos, `headerGroupComponent`.
  const dayHdrParams = (d) => ({ date: d, ...dayHeaders[d] });
  const dayCellHdr = (d) => ({
    headerComponent: DayHeader,
    headerComponentParams: dayHdrParams(d),
  });
  const dayGroupHdr = (d) => ({
    headerGroupComponent: DayHeader,
    headerGroupComponentParams: dayHdrParams(d),
  });
  const dayTotalCols = () => days.map((d) => ({
    headerName: d,
    field: `${d}__total`,
    editable: false,
    width: isMobile ? 70 : 110,
    ...dayCellHdr(d),
    valueFormatter: (p) => (p.value ? fmtCurrency(p.value) : ""),
    cellRenderer: DayTotalCell,
    cellStyle: { textAlign: "right" },
  }));
  const qtyCol = (d, key, overrides) => ({
    field: `${d}__${key}`,
    editable: !readOnly,
    width: isMobile ? 78 : 120,
    type: "numericColumn",
    valueParser: (p) => parseAmount(p.newValue),
    cellEditor: FormulaCellEditor,
    cellRenderer: QtyCell,
    cellRendererParams: { amtField: `${d}__${key}__amt` },
    ...overrides,
  });

  if (isHarvestLabor) {
    if (harvestView === "resumen") {
      return [...baseLeft, ...dayTotalCols(), totalCol, ...actionsCol];
    }
    const dayGroups = days.map((d) => {
      const combos = dayCombosByDate[d] || [];
      const children = combos.map((c) => qtyCol(d, c.key, {
        headerName: comboLabel(catalogs, c.x, c.y),
        // `qrLocked`: la sincronización de Pesajes QR hace `upsert` sobre este
        // mismo docId y pisa `qty` y `amount`. El piso sigue editable: es un
        // bono manual que la sincronización no toca.
        editable: !readOnly && !qrLocked,
        cellRendererParams: { amtField: `${d}__${c.key}__amt`, unit: containerLabel(catalogs, c.y) },
      }));
      if (daysWithFloor.has(d)) {
        children.push(buildFloorChildCol(d, activeLabor, dayPrices));
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
      return [...baseLeft, ...dayTotalCols(), totalCol, ...actionsCol];
    }
    const dayGroups = days.map((d) => {
      const tiers = dayTiersByDate[d] || [];
      const children = tiers.map((t) => qtyCol(d, t.key, {
        headerName: `${fmtCurrency(t.price)} ${t.mode === "flat" ? "/día" : "/unid"}`,
      }));
      if (daysWithFloor.has(d)) {
        children.push(buildFloorChildCol(d, activeLabor, dayPrices));
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
      const children = stages.map((st) => qtyCol(d, st.id, {
        headerName: `${st.name}${st.counts ? " ✓" : ""}`,
        headerTooltip: `${st.name} · ${fmtCurrency(st.price)}${st.mode === "flat" ? "/día" : "/unid"}${st.counts ? " · cuenta para producción" : " · no cuenta unidades"}`,
        width: isMobile ? 84 : 130,
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
          cellRenderer: OvertimeSummaryCell,
          cellRendererParams: { d, cfg, laborId: activeLabor.id, rates },
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
      const suggested = effectiveDayPrice(labor, cfg);
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
            headerTooltip: `Base del día (monto). Sugerido: ${fmtCurrency(suggested)}. Abajo: bonos (M/S/+) y total del día — click para editar.`,
            cellStyle: { padding: 0 },
            cellRenderer: OvertimeBaseCell,
            cellRendererParams: { d, cfg, laborId: activeLabor.id, rates, suggested },
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
      cellRenderer: NormalDayCell,
      cellRendererParams: { d, suggested },
      cellStyle: (p) => p.data?._monthly ? attendanceCellStyle : { textAlign: "right" },
    };
  });
  return [...baseLeft, ...dayCols, totalCol, ...actionsCol];
}
