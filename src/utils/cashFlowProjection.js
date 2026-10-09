// Proyección de flujo de caja para Facturación.
//
// Una temporada se proyecta escalando la anterior: se toman los ingresos de
// los 12 meses previos, mes a mes, y se les aplica un porcentaje. Cada mes sale
// del mismo mes de la temporada anterior: la temporada es estacional y el flujo
// de caja tiene que mostrar en qué mes entra la plata.
//
// Un "período" es la etiqueta "YYYY-MM" del RCV, no un instante: la aritmética
// de meses va con enteros, nunca con `Date`, para que una zona horaria no corra
// un documento al mes de al lado.

// Notas de crédito. Restan: revierten una venta, no son una entrada nueva.
export const CREDIT_NOTE_TYPES = new Set([61, 112]);

export const PROJECTION_MONTHS = 12;
export const DEFAULT_PROJECTION_PERCENT = 75;

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const PERIOD_RE = /^(\d{4})-(\d{2})$/;

// "2026-09" desplazado `delta` meses, o null si `periodo` no tiene la forma
// "YYYY-MM" con un mes válido.
export function shiftPeriod(periodo, delta) {
  const m = PERIOD_RE.exec(String(periodo || ""));
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  const idx = Number(m[1]) * 12 + (mes - 1) + Number(delta || 0);
  if (idx < 0) return null;
  const y = Math.floor(idx / 12);
  const mo = idx % 12;
  return `${String(y).padStart(4, "0")}-${String(mo + 1).padStart(2, "0")}`;
}

// Los `months` períodos consecutivos que arrancan en `start`.
export function periodWindow(start, months = PROJECTION_MONTHS) {
  const n = Number(months) || 0;
  if (n <= 0) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = shiftPeriod(start, i);
    if (!p) return [];
    out.push(p);
  }
  return out;
}

export function periodMonthName(periodo) {
  const m = PERIOD_RE.exec(String(periodo || ""));
  return m ? MONTH_NAMES_ES[Number(m[2]) - 1] || m[2] : "";
}

export function formatPeriod(periodo) {
  const m = PERIOD_RE.exec(String(periodo || ""));
  return m ? `${periodMonthName(periodo)} ${m[1]}` : String(periodo || "");
}

// Etiqueta de la temporada: "Septiembre 2026-2027". Una ventana que no cruza de
// año (arranca en enero) queda "Enero 2026" a secas.
export function windowLabel(start, months = PROJECTION_MONTHS) {
  const w = periodWindow(start, months);
  if (w.length === 0) return "";
  const y1 = w[0].slice(0, 4);
  const y2 = w[w.length - 1].slice(0, 4);
  const mes = periodMonthName(w[0]);
  return y1 === y2 ? `${mes} ${y1}` : `${mes} ${y1}-${y2}`;
}

// Facturas de compra: las emite el COMPRADOR y se queda con el IVA (cambio de
// sujeto), así que en el registro de ventas aparecen con el IVA retenido.
export const FACTURA_COMPRA_TYPES = new Set([45, 46]);

// Lo que un documento deja efectivamente en la cuenta.
//
// - Con IVA retenido (factura de compra, o cualquier documento al que el
//   cliente le retuvo el IVA): **solo el neto**. Ese IVA no es plata que entre.
// - Todo el resto: el Monto Total del SII, o sea el neto más el IVA que sí se
//   cobra, y en un documento exento el exento.
//
// La retención se deduce de los montos: `neto + exento + iva` que no da el
// `total` **es** la retención. Así una NC sobre una factura de compra resta con
// la misma regla que el documento que reversa, y el par cierra en cero.
export function cashInOf(d) {
  const tipo = Number(d?.tipo) || 0;
  const neto = Number(d?.neto) || 0;
  const iva = Number(d?.iva) || 0;
  const exento = Number(d?.exento) || 0;
  const total = Number(d?.total) || 0;
  // El margen de 1 peso absorbe el redondeo del SII, que no siempre cuadra al peso.
  const conRetencion = FACTURA_COMPRA_TYPES.has(tipo)
    || (iva > 0 && exento + neto + iva - total > 1);
  const bruto = conRetencion ? neto : total;
  return {
    monto: (CREDIT_NOTE_TYPES.has(tipo) ? -1 : 1) * bruto,
    conRetencion,
  };
}

// Ingresos de una empresa en una ventana de períodos. Solo cuenta
// `kind: "venta"`: las compras son salidas. Las NC van al detalle con signo
// negativo, así la suma del detalle da exactamente el total.
export function cashInByPeriod(docs, { companyId = "", periods = [] } = {}) {
  const byPeriod = new Map(periods.map((p) => [p, { periodo: p, monto: 0, count: 0 }]));
  const detail = [];
  for (const d of docs || []) {
    if (!d || d.kind !== "venta") continue;
    if (companyId && d.companyId !== companyId) continue;
    const periodo = String(d.periodo || "");
    const bucket = byPeriod.get(periodo);
    if (!bucket) continue;
    const tipo = Number(d.tipo) || 0;
    const isNc = CREDIT_NOTE_TYPES.has(tipo);
    const signo = isNc ? -1 : 1;
    const { monto, conRetencion } = cashInOf(d);
    bucket.monto += monto;
    bucket.count += 1;
    detail.push({
      id: d.id,
      fechaEmision: d.fechaEmision || "",
      periodo,
      tipo,
      tipoLabel: d.tipoLabel || "",
      folio: d.folio ?? "",
      razonSocial: d.razonSocialReceptor || "",
      rut: d.rutReceptor || "",
      neto: signo * (Number(d.neto) || 0),
      iva: signo * (Number(d.iva) || 0),
      total: signo * (Number(d.total) || 0),
      monto,
      conRetencion,
      isNc,
    });
  }
  detail.sort((a, b) =>
    (a.fechaEmision || "").localeCompare(b.fechaEmision || "") ||
    (Number(a.folio) || 0) - (Number(b.folio) || 0));
  const rows = periods.map((p) => byPeriod.get(p));
  return {
    rows,
    detail,
    total: rows.reduce((s, r) => s + r.monto, 0),
    count: rows.reduce((s, r) => s + r.count, 0),
  };
}

// Agrupa el detalle por contraparte, de mayor a menor monto: muestra de dónde
// viene la base.
export function groupByCounterparty(detail) {
  const by = new Map();
  for (const d of detail || []) {
    const key = d.rut || d.razonSocial || "(sin RUT)";
    if (!by.has(key)) by.set(key, { rut: d.rut || "", razonSocial: d.razonSocial || "", monto: 0, neto: 0, count: 0 });
    const g = by.get(key);
    g.monto += d.monto;
    g.neto += d.neto;
    g.count += 1;
    if (!g.razonSocial && d.razonSocial) g.razonSocial = d.razonSocial;
  }
  return [...by.values()].sort((a, b) => b.monto - a.monto);
}

// La proyección completa. `startPeriod` es el primer mes proyectado; la base
// son los `months` meses inmediatamente anteriores.
//
// **Un mes que ya tiene ventas cargadas no se proyecta: vale su dato real.**
// Cada fila dice de dónde salió (`esReal`) y el resultado separa `totalReal`
// de `totalProyectado`.
//
// El redondeo va por mes y el total es la suma de los meses redondeados, no el
// redondeo de la suma: así la columna del Excel da el total impreso al pie.
export function projectCashFlow(docs, {
  companyId = "",
  startPeriod,
  percent = DEFAULT_PROJECTION_PERCENT,
  months = PROJECTION_MONTHS,
} = {}) {
  const targetPeriods = periodWindow(startPeriod, months);
  const baseStart = targetPeriods.length ? shiftPeriod(startPeriod, -months) : null;
  const basePeriods = baseStart ? periodWindow(baseStart, months) : [];
  const base = cashInByPeriod(docs, { companyId, periods: basePeriods });
  // Las ventas que YA existen dentro de la ventana proyectada.
  const real = cashInByPeriod(docs, { companyId, periods: targetPeriods });
  const factor = (Number(percent) || 0) / 100;

  const rows = targetPeriods.map((periodo, i) => {
    const b = base.rows[i] || { periodo: basePeriods[i] || "", monto: 0, count: 0 };
    const r = real.rows[i] || { periodo, monto: 0, count: 0 };
    const proyectado = Math.round(b.monto * factor);
    // El corte es que HAYA documentos, no que el neto dé distinto de cero: un
    // mes facturado y anulado con NC cierra en $0 y ese cero es el dato real.
    const esReal = r.count > 0;
    return {
      periodo,
      monthName: periodMonthName(periodo),
      basePeriodo: b.periodo,
      baseMonto: b.monto,
      baseCount: b.count,
      proyectado,
      realMonto: r.monto,
      realCount: r.count,
      esReal,
      monto: esReal ? r.monto : proyectado,
    };
  });

  const reales = rows.filter((r) => r.esReal);
  const estimados = rows.filter((r) => !r.esReal);

  return {
    percent: Number(percent) || 0,
    factor,
    months,
    targetPeriods,
    targetLabel: windowLabel(startPeriod, months),
    basePeriods,
    baseLabel: baseStart ? windowLabel(baseStart, months) : "",
    baseRows: base.rows,
    baseTotal: base.total,
    baseCount: base.count,
    detail: base.detail,
    rows,
    mesesReales: reales.length,
    mesesEstimados: estimados.length,
    totalReal: reales.reduce((s, r) => s + r.monto, 0),
    totalProyectado: estimados.reduce((s, r) => s + r.monto, 0),
    total: rows.reduce((s, r) => s + r.monto, 0),
  };
}
