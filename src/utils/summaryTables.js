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

// Columnas de la tabla de una labor (o de una tabla juntada). `edit` marca la
// celda que se edita en cobrar: el campo que guarda y su valor actual.
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
  if (isHE) {
    if (show("qty")) {
      cols.push({
        key: "qty", label: "Base $", kind: "money",
        value: (r) => (rowQty(r) > 0 ? rowQty(r) : null),
        total: (t) => (t.qty > 0 ? t.qty : null),
        edit: (r) => editIf("qty", rowQty(r)),
      });
    }
    // En cobrar, las horas que se trabajaron, junto a las que se cobran.
    if (isCharge && show("heWorked")) {
      cols.push({
        key: "heWorked", label: "HE trabajadas", kind: "number",
        value: (r) => (r.workedOvertimeHours == null ? "—" : r.workedOvertimeHours > 0 ? r.workedOvertimeHours : null),
        total: (t) => (t.workedOvertimeHours > 0 ? t.workedOvertimeHours : null),
      });
    }
    if (show("he")) {
      cols.push({
        key: "he", label: isCharge ? "HE a cobrar" : "HE (hrs)", kind: "number",
        value: (r) => (rowHE(r) > 0 ? rowHE(r) : null),
        total: (t) => (t.overtimeHours > 0 ? t.overtimeHours : null),
        edit: (r) => editIf("overtimeHours", rowHE(r), {
          step: "0.25",
          title: "Horas extras que se cobran ese día. Parte en las trabajadas; 0 si el día no se cobra.",
        }),
      });
    }
    if (isCharge && show("heRate")) {
      cols.push({
        key: "heRate", label: "Tarifa HE", kind: "money",
        value: (r) => (Number(r.chargedRate) > 0 ? r.chargedRate : null),
        total: () => null,
        edit: (r) => editIf("rate", r.chargedRate, { title: "Tarifa de la hora extra que se cobra ese día" }),
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
  if (show("rate")) {
    // En tratoHE, el Total HE; en el resto, el precio por unidad.
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
  if (isHE && show("bonos")) {
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
