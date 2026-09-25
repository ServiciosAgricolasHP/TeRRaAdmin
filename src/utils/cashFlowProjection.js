// Proyección de flujo de caja para Facturación.
//
// Una temporada se proyecta escalando la anterior: se toman las ventas netas
// de los 12 meses previos, mes a mes, y se les aplica un porcentaje.
//
// Mes a mes y no como un único número anual: el punto de un flujo de caja es
// saber CUÁNDO entra la plata. La temporada acá es estacional —la cosecha se
// concentra en pocos meses— y repartir el total en doceavos parejos escondería
// justo eso.
//
// Un "período" es la etiqueta "YYYY-MM" del RCV, no un instante: toda la
// aritmética de meses va con enteros y nunca con `Date`, así no hay forma de
// que una zona horaria corra un documento al mes de al lado.

// Notas de crédito. Restan: revierten una venta, no son una entrada nueva.
export const CREDIT_NOTE_TYPES = new Set([61, 112]);

export const PROJECTION_MONTHS = 12;
export const DEFAULT_PROJECTION_PERCENT = 75;

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const PERIOD_RE = /^(\d{4})-(\d{2})$/;

// "2026-09" desplazado `delta` meses. Devuelve null si el período no tiene
// forma de período — el llamador decide qué hacer, pero nunca recibe un
// "NaN-NaN" que después se filtra contra los documentos y no matchea nada.
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
// año (arranca en enero) queda "Enero 2026" a secas — "2026-2026" se lee como
// un error de la app, no como un dato.
export function windowLabel(start, months = PROJECTION_MONTHS) {
  const w = periodWindow(start, months);
  if (w.length === 0) return "";
  const y1 = w[0].slice(0, 4);
  const y2 = w[w.length - 1].slice(0, 4);
  const mes = periodMonthName(w[0]);
  return y1 === y2 ? `${mes} ${y1}` : `${mes} ${y1}-${y2}`;
}

// Ventas netas de una empresa en una ventana de períodos.
//
// Solo `kind: "venta"`: las compras son salidas y en una proyección de entradas
// no tienen nada que hacer. El neto va con signo, así que la suma del detalle
// es exactamente el total — si las NC se filtraran, el Excel mostraría un total
// que sus propias filas no dan.
export function netSalesByPeriod(docs, { companyId = "", periods = [] } = {}) {
  const byPeriod = new Map(periods.map((p) => [p, { periodo: p, neto: 0, count: 0 }]));
  const detail = [];
  for (const d of docs || []) {
    if (!d || d.kind !== "venta") continue;
    if (companyId && d.companyId !== companyId) continue;
    const periodo = String(d.periodo || "");
    const bucket = byPeriod.get(periodo);
    if (!bucket) continue;
    const isNc = CREDIT_NOTE_TYPES.has(Number(d.tipo));
    const neto = (isNc ? -1 : 1) * (Number(d.neto) || 0);
    bucket.neto += neto;
    bucket.count += 1;
    detail.push({
      id: d.id,
      fechaEmision: d.fechaEmision || "",
      periodo,
      tipo: Number(d.tipo) || 0,
      tipoLabel: d.tipoLabel || "",
      folio: d.folio ?? "",
      razonSocial: d.razonSocialReceptor || "",
      rut: d.rutReceptor || "",
      neto,
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
    total: rows.reduce((s, r) => s + r.neto, 0),
    count: rows.reduce((s, r) => s + r.count, 0),
  };
}

// Agrupa el detalle por contraparte, de mayor a menor. Es lo que muestra de
// dónde viene la base: una proyección sostenida por dos clientes no se lee
// igual que una repartida entre veinte.
export function groupByCounterparty(detail) {
  const by = new Map();
  for (const d of detail || []) {
    const key = d.rut || d.razonSocial || "(sin RUT)";
    if (!by.has(key)) by.set(key, { rut: d.rut || "", razonSocial: d.razonSocial || "", neto: 0, count: 0 });
    const g = by.get(key);
    g.neto += d.neto;
    g.count += 1;
    if (!g.razonSocial && d.razonSocial) g.razonSocial = d.razonSocial;
  }
  return [...by.values()].sort((a, b) => b.neto - a.neto);
}

// La proyección completa. `startPeriod` es el primer mes proyectado; la base
// son los `months` meses inmediatamente anteriores.
//
// El redondeo va POR MES y el total es la suma de los meses redondeados, no el
// redondeo de la suma: si no, la columna del Excel no daría el total impreso
// al pie y quien lo revise va a pensar que hay una fila escondida.
export function projectCashFlow(docs, {
  companyId = "",
  startPeriod,
  percent = DEFAULT_PROJECTION_PERCENT,
  months = PROJECTION_MONTHS,
} = {}) {
  const targetPeriods = periodWindow(startPeriod, months);
  const baseStart = targetPeriods.length ? shiftPeriod(startPeriod, -months) : null;
  const basePeriods = baseStart ? periodWindow(baseStart, months) : [];
  const base = netSalesByPeriod(docs, { companyId, periods: basePeriods });
  const factor = (Number(percent) || 0) / 100;

  const rows = targetPeriods.map((periodo, i) => {
    const b = base.rows[i] || { periodo: basePeriods[i] || "", neto: 0, count: 0 };
    return {
      periodo,
      monthName: periodMonthName(periodo),
      basePeriodo: b.periodo,
      baseNeto: b.neto,
      baseCount: b.count,
      proyectado: Math.round(b.neto * factor),
    };
  });

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
    total: rows.reduce((s, r) => s + r.proyectado, 0),
  };
}
