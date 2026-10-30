// Las tablas del resumen del ciclo tal como se ven: las secciones (una por
// labor o tabla juntada y una por transportista) y las columnas de cada una,
// con el valor de cada fila y del subtotal. La pantalla, la impresión y el
// Excel se arman desde acá, así muestran siempre lo mismo.
//
// Un valor es `null` (celda vacía), un texto (se muestra tal cual) o un número,
// que se formatea según el `kind` de la columna: "money", "number" (hasta dos
// decimales) o "raw" (el número sin separadores).

import { getDaySingle, tratoUnitLabel } from "./cosechaCombos";
import { buildChargeSections, mergedRows, mergedTotals } from "./chargeMerge";
import { dateLabel, fmtNumber, formatRowMetric, formatTotalsMetric } from "./cycleSummary";
import { fmtCurrency } from "./format";
import { DEFAULT_OVERTIME_RATE, isRedDay } from "./tratoHE";

// Columnas que empiezan ocultas en las tablas del resumen; se muestran con
// `cobrar.shownColumns`. Las demás se ocultan con `cobrar.hiddenColumns`.
export const DEFAULT_HIDDEN_COLUMNS = ["personas"];

// Las columnas ocultas de un resumen: las que se ocultaron más las que
// empiezan ocultas y no se mostraron.
export function hiddenColumnsOf(hiddenColumns = [], shownColumns = []) {
  const shown = new Set(shownColumns);
  return new Set([...hiddenColumns, ...DEFAULT_HIDDEN_COLUMNS.filter((k) => !shown.has(k))]);
}

// Muestra u oculta una columna: devuelve { hiddenColumns, shownColumns }.
export function toggledColumns(hiddenColumns = [], shownColumns = [], key) {
  if (DEFAULT_HIDDEN_COLUMNS.includes(key)) {
    const shown = new Set(shownColumns);
    if (shown.has(key)) shown.delete(key);
    else shown.add(key);
    return { hiddenColumns: [...hiddenColumns], shownColumns: [...shown] };
  }
  const hidden = new Set(hiddenColumns);
  if (hidden.has(key)) hidden.delete(key);
  else hidden.add(key);
  return { hiddenColumns: [...hidden], shownColumns: [...shownColumns] };
}

// El texto de una celda.
export function cellText(col, v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (col.kind === "money") return fmtCurrency(v);
  if (col.kind === "number") return fmtNumber(v);
  return String(v);
}

// Secciones del resumen, en el orden en que se dibujan. En cobrar, las
// labores juntadas (`mergeInto`) van dentro de la tabla de su destino y las
// no incluidas no aparecen. En pagar, una labor sin filas no aparece.
export function summarySections({ mode, labors, carriers, titles, carrierById, dayPrices = {} }) {
  const isCharge = mode === "charge";
  const sections = [];
  const groups = isCharge ? buildChargeSections(labors) : labors.map((ld) => ({ lead: ld, members: [ld] }));
  for (const { lead: ld, members } of groups) {
    if (isCharge && ld.include === false) continue;
    const nameOf = (m) => titles.laborNames?.[m.labor.id] || m.labor.name;
    const merged = members.length > 1;
    const displayName = merged ? members.map(nameOf).join(" + ") : nameOf(ld);
    // tratoHE: sábados, domingos y feriados en rojo en la columna Fecha,
    // con el mismo criterio que la grilla por trabajador.
    let redDates = null;
    if (ld.labor.type === "tratoHE") {
      redDates = new Set();
      for (const m of members) {
        // Una labor importada trae sus días en rojo calculados con los
        // feriados de su propio ciclo.
        if (m.importedFrom) {
          for (const d of m.importedFrom.redDates) redDates.add(d);
          continue;
        }
        const sourceRows = isCharge ? (m.chargedRows || m.rows) : m.rows;
        for (const r of sourceRows) {
          if (!r.date) continue;
          const cfg = getDaySingle(dayPrices, m.labor.id, r.date, "normal");
          if (isRedDay(r.date, cfg)) redDates.add(r.date);
        }
      }
    }
    // En cobrar, chargedRows (con overrides y filas extra) y chargedTotals.
    const rows = merged ? mergedRows(members, nameOf) : isCharge ? (ld.chargedRows || ld.rows) : ld.rows;
    const totals = merged ? mergedTotals(members) : isCharge ? (ld.chargedTotals || ld.totals) : ld.totals;
    if (rows.length === 0 && !isCharge) continue;
    // tratoHE en cobrar: si cada labor de la tabla cobra sus horas extras.
    const overtimeToggles = isCharge && ld.labor.type === "tratoHE"
      ? members.map((m) => ({ laborId: m.labor.id, name: nameOf(m), on: m.chargeOvertime !== false }))
      : null;
    sections.push({
      kind: "labor",
      key: ld.labor.id,
      laborId: ld.labor.id,
      laborType: ld.labor.type,
      displayName,
      unit: merged && totals.qty == null ? "Cantidad" : ld.unit,
      overtimeRate: Number(ld.labor.overtimeRate) > 0 ? Number(ld.labor.overtimeRate) : DEFAULT_OVERTIME_RATE,
      rows,
      totals,
      redDates,
      overtimeToggles,
    });
  }
  for (const tg of carriers) {
    if (isCharge && tg.include === false) continue;
    const rows = isCharge ? (tg.chargedRows || tg.rows) : tg.rows;
    if (rows.length === 0 && !isCharge) continue;
    const c = carrierById.get(tg.carrierId);
    const fallbackName = c?.alias || c?.name || "(transportista eliminado)";
    sections.push({
      kind: "carrier",
      key: tg.carrierId,
      carrierId: tg.carrierId,
      displayName: titles.carrierNames?.[tg.carrierId] || fallbackName,
      rows,
      totals: {
        count: isCharge ? (tg.chargedTotalCount ?? tg.totalCount) : tg.totalCount,
        amount: isCharge ? (tg.chargedTotalAmount ?? tg.totalAmount) : tg.totalAmount,
      },
    });
  }
  return sections;
}

// Trato: la unidad del tier (Árbol, Metro…) o "P1", "P2"… junto a la fecha.
// La fila del primer tier lo lleva solo si el día tiene más de una fila.
function tierBadges(rows, typeOf, laborOf, catalogs) {
  const countByDate = new Map();
  for (const r of rows) {
    if (!r.date || r.isExtra || typeOf(r) !== "trato") continue;
    const k = `${laborOf(r)}|${r.date}`;
    countByDate.set(k, (countByDate.get(k) || 0) + 1);
  }
  return (r) => {
    if (typeOf(r) !== "trato" || r.isExtra) return null;
    const same = countByDate.get(`${laborOf(r)}|${r.date}`) || 0;
    if (same < 2 && (r.tierIdx ?? 0) === 0) return null;
    const unitLbl = r.unit != null ? tratoUnitLabel(catalogs, r.unit) : null;
    if (unitLbl) return unitLbl;
    return `P${(r.tierIdx ?? 0) + 1}`;
  };
}

// Las horas extras de una fila de cobro: el monto con sus horas,
// "$7.500 (x 5 HE)", y la tarifa si no es la del encabezado.
function overtimeText(amount, hours, rate = null) {
  return `${fmtCurrency(amount)} (x ${fmtNumber(hours)} HE${rate ? ` a ${fmtCurrency(rate)}` : ""})`;
}

// La columna de horas extras de tratoHE en cobrar. La tarifa va en el
// encabezado si todas las filas con horas usan la misma; si no, en cada
// celda. En edición lleva dos campos: las horas y la tarifa.
function overtimeColumn(rows, editIf) {
  const ratesWithHours = new Set(
    rows.filter((r) => Number(r.chargedOvertimeHours) > 0).map((r) => Number(r.chargedRate) || 0),
  );
  const sharedRate = ratesWithHours.size === 1
    ? [...ratesWithHours][0]
    : ratesWithHours.size === 0 ? Number(rows[0]?.chargedRate) || 0 : 0;
  return {
    key: "he",
    label: sharedRate > 0 ? `Horas extras (${fmtCurrency(sharedRate)} c/u)` : "Horas extras",
    kind: "text",
    value: (r) => {
      const hours = Number(r.chargedOvertimeHours) || 0;
      if (hours <= 0) return null;
      const rate = Number(r.chargedRate) || 0;
      return overtimeText(hours * rate, hours, rate === sharedRate ? null : rate);
    },
    total: (t) => (t.overtimeHours > 0 ? overtimeText(t.heTotal || 0, t.overtimeHours) : null),
    edits: (r) => {
      const hoursEdit = editIf("overtimeHours", r.chargedOvertimeHours, {
        step: "0.25",
        suffix: "HE ×",
        width: 56,
        title: `Horas extras que se cobran ese día${r.workedOvertimeHours != null ? `; se trabajaron ${fmtNumber(r.workedOvertimeHours)}` : ""}. 0 si el día no se cobra.`,
      });
      const rateEdit = editIf("rate", r.chargedRate, { width: 76, title: "Tarifa de la hora extra que se cobra ese día" });
      return hoursEdit ? [hoursEdit, rateEdit] : null;
    },
  };
}

// Columnas de la tabla de una labor (o de una tabla juntada). `edit` marca la
// celda que se edita en cobrar: el campo que guarda y su valor actual; `edits`,
// una celda con varios campos.
export function laborColumns(section, { mode, hiddenColumns = new Set(), catalogs }) {
  const { laborId, laborType, unit, overtimeRate, rows, totals, displayName } = section;
  const isCharge = mode === "charge";
  const isHE = laborType === "tratoHE";
  const showPiso = (totals.pisoAmount || 0) > 0;
  const show = (key) => !hiddenColumns.has(key);
  const typeOf = (r) => r._laborType || laborType;
  const laborOf = (r) => r._laborId || laborId;
  const badgeOf = tierBadges(rows, typeOf, laborOf, catalogs);

  // En cobrar las filas traen chargedQty, chargedOvertimeHours, chargedRate y
  // chargedAmount, con los overrides aplicados; en pagar se leen los campos de
  // la fila agregada.
  const rowQty = (r) => (isCharge ? r.chargedQty : r.qty);
  const rowHE = (r) => (isCharge ? r.chargedOvertimeHours : r.overtimeHours);
  // En pagar el Total HE va a la tarifa HE de la labor; en cobrar, a la tarifa
  // de cada fila, sobre las horas que se cobran.
  const rowHeTotal = (r) => (Number(rowHE(r)) || 0) * (isCharge ? Number(r.chargedRate) || 0 : overtimeRate);
  const rowValueTotal = (r) => (isCharge ? r.chargedAmount : r.amount);
  const rowTransport = (r) => (isCharge ? Number(r.chargedTransport) || 0 : 0);
  const editIf = (field, raw, extra = {}) => (isCharge ? { field, raw, ...extra } : null);

  const cols = [
    { key: "detail", label: "Detalle de jornada", kind: "text", value: (r) => r._laborName || displayName },
    { key: "date", label: "Fecha", kind: "text", value: (r) => dateLabel(r.date), badge: badgeOf },
  ];
  if (isHE && isCharge) {
    // En cobrar, como las labores al día: jornadas × valor, más las horas
    // extras en una sola columna.
    if (show("qty")) {
      cols.push({
        key: "qty", label: "Jornadas", kind: "number",
        value: (r) => (r.chargedWorkdayCount > 0 ? r.chargedWorkdayCount : null),
        total: (t) => (t.workdayCount > 0 ? t.workdayCount : null),
        edit: (r) => editIf("workdayCount", r.chargedWorkdayCount, { title: "Jornadas que se cobran ese día" }),
      });
    }
    if (show("rate")) {
      cols.push({
        key: "rate", label: "Valor", kind: "money",
        value: (r) => (r.chargedWorkdayRate > 0 ? r.chargedWorkdayRate : null),
        total: () => null,
        edit: (r) => editIf("workdayRate", r.chargedWorkdayRate, { title: "Valor de la jornada que se cobra ese día" }),
      });
    }
    const chargesOvertime = (section.overtimeToggles || []).some((t) => t.on) || !section.overtimeToggles;
    if (chargesOvertime && show("he")) cols.push(overtimeColumn(rows, editIf));
  } else if (isHE) {
    if (show("qty")) {
      cols.push({
        key: "qty", label: "Base $", kind: "money",
        value: (r) => (rowQty(r) > 0 ? rowQty(r) : null),
        total: (t) => (t.qty > 0 ? t.qty : null),
      });
    }
    if (show("he")) {
      cols.push({
        key: "he", label: "HE (hrs)", kind: "number",
        value: (r) => (rowHE(r) > 0 ? rowHE(r) : null),
        total: (t) => (t.overtimeHours > 0 ? t.overtimeHours : null),
      });
    }
  } else if (show("qty")) {
    cols.push({
      key: "qty",
      label: unit,
      title: "La cantidad que se paga en esta labor. En pago al día es una jornada por trabajador (coincide con Personas); en cosecha son kilos y en trato unidades (sacos, metros, árboles), que no tienen relación con cuánta gente trabajó.",
      kind: "number",
      // Se pasa el qty resuelto (chargedQty en cobrar, qty en pagar) para que
      // la métrica refleje los overrides.
      value: (r) => formatRowMetric({ ...r, qty: rowQty(r), overtimeHours: rowHE(r) }, typeOf(r), catalogs),
      total: (t) => {
        if (!isCharge) return formatTotalsMetric(t, laborType, rows, catalogs);
        // Tabla juntada con medidas distintas: no se suman.
        if (t.qty == null) return null;
        // Unidades deduplicadas (solo etapas que cuentan).
        if (laborType === "tratoEtapas") return `${fmtNumber(t.countedQty ?? t.qty ?? 0)} unid.`;
        return t.qty || 0;
      },
      edit: (r) => editIf("qty", rowQty(r)),
    });
  }
  if (show("rate") && !(isHE && isCharge)) {
    // En tratoHE (pagar), el Total HE; en el resto, el precio por unidad.
    cols.push(isHE
      ? {
        key: "rate", label: "Total HE", kind: "money",
        value: (r) => (rowHeTotal(r) > 0 ? rowHeTotal(r) : null),
        total: (t) => ((t.heTotal || 0) > 0 ? t.heTotal : null),
      }
      : {
        key: "rate", label: "Valor", kind: "money",
        value: (r) => {
          const rate = isCharge ? r.chargedRate : r.qty > 0 ? Math.round(r.amount / r.qty) : 0;
          return rate > 0 ? rate : null;
        },
        total: () => null,
        edit: (r) => editIf("rate", r.chargedRate),
      });
  }
  if (show("valorTotal")) {
    cols.push({
      key: "valorTotal", label: "Valor total", kind: "money",
      value: (r) => rowValueTotal(r),
      total: (t) => t.amount,
      edit: (r) => editIf("amount", rowValueTotal(r), {
        bold: true,
        title: "Reemplaza el cálculo cantidad × tarifa. Bórralo para volver al cálculo automático.",
      }),
    });
  }
  if (showPiso && show("piso")) {
    cols.push({
      key: "piso", label: "Piso", kind: "money",
      value: (r) => {
        const piso = Number(r.pisoAmount) || 0;
        return piso > 0 ? `${r.pisoCount > 1 ? `${r.pisoCount}× ` : ""}${fmtCurrency(piso)}` : "—";
      },
      total: (t) => t.pisoAmount || 0,
    });
  }
  if (show("transport")) {
    cols.push({
      key: "transport", label: "Transporte", kind: "money",
      value: (r) => (rowTransport(r) > 0 ? rowTransport(r) : "$ -"),
      total: (t) => (isCharge && (t.transport || 0) > 0 ? t.transport : null),
      edit: (r) => editIf("transport", rowTransport(r), {
        title: "Monto de transporte del día — SUMA al Total de la fila y al total a cobrar",
      }),
    });
  }
  if (show("total")) {
    cols.push({
      key: "total", label: "Total", kind: "money",
      value: (r) => (isCharge ? rowValueTotal(r) + rowTransport(r) : rowValueTotal(r) + (Number(r.pisoAmount) || 0)),
      total: (t) => (isCharge ? t.amount + (t.transport || 0) : t.amount + (t.pisoAmount || 0)),
    });
  }
  if (show("personas")) {
    cols.push({
      key: "personas",
      label: "Personas",
      title: "Cuántos trabajadores distintos tuvieron jornada ese día. Es informativo: no entra en ningún cálculo de montos.",
      kind: "raw",
      value: (r) => {
        const wc = isCharge ? Number(r.chargedWorkerCount) || 0 : Number(r.workerCount) || 0;
        return wc > 0 ? wc : (r.isExtra ? "—" : 0);
      },
      total: (t) => ((t.workerDays || 0) > 0 ? t.workerDays : null),
      edit: (r) => editIf("workerCount", isCharge ? r.chargedWorkerCount : r.workerCount, {
        title: "Cantidad de personas del día — informativo, no afecta montos",
      }),
    });
  }
  // Los bonos se pagan y no se cobran: solo en pagar.
  if (isHE && !isCharge && show("bonos")) {
    cols.push({
      key: "bonos", label: "Bonos", kind: "money",
      value: (r) => ((r.bonosTotal || 0) > 0 ? r.bonosTotal : "—"),
      total: (t) => ((t.bonosTotal || 0) > 0 ? t.bonosTotal : "—"),
    });
  }
  return cols;
}

// Columnas de la tabla de un transportista.
export function carrierColumns(section, { mode, hiddenColumns = new Set() }) {
  const isCharge = mode === "charge";
  const show = (key) => !hiddenColumns.has(key);
  const editIf = (field, raw, extra = {}) => (isCharge ? { field, raw, ...extra } : null);
  const rowCount = (r) => (isCharge ? r.chargedCount : r.count);
  const rowRate = (r) => (isCharge ? r.chargedRate : r.count > 0 ? Math.round(r.amount / r.count) : 0);
  const rowTotal = (r) => (isCharge ? r.chargedAmount : r.amount);
  const cols = [
    { key: "detail", label: "🚐 Transporte", kind: "text", value: () => section.displayName },
    { key: "date", label: "Fecha", kind: "text", value: (r) => dateLabel(r.date) },
  ];
  if (show("qty")) {
    cols.push({
      key: "qty", label: "Vueltas", kind: "raw",
      value: (r) => rowCount(r),
      total: (t) => t.count,
      edit: (r) => editIf("count", rowCount(r)),
    });
  }
  if (show("rate")) {
    cols.push({
      key: "rate", label: "Valor", kind: "money",
      value: (r) => (rowRate(r) > 0 ? rowRate(r) : null),
      total: () => null,
      edit: (r) => editIf("rate", rowRate(r)),
    });
  }
  if (show("total")) {
    cols.push({
      key: "total", label: "Total", kind: "money",
      value: (r) => rowTotal(r),
      total: (t) => t.amount,
      edit: (r) => editIf("amount", rowTotal(r), {
        bold: true,
        title: "Reemplaza el cálculo vueltas × valor. Bórralo para volver al cálculo automático.",
      }),
    });
  }
  return cols;
}

// Lo que aporta una tabla al total del resumen, igual que su columna Total:
// en cobrar, lo cobrado más el transporte por fila; en pagar, lo pagado más
// el piso; en un transportista, el total de sus vueltas.
export function sectionTotal(section, mode) {
  const t = section.totals;
  if (section.kind === "carrier") return Number(t.amount) || 0;
  return mode === "charge"
    ? (Number(t.amount) || 0) + (Number(t.transport) || 0)
    : (Number(t.amount) || 0) + (Number(t.pisoAmount) || 0);
}
