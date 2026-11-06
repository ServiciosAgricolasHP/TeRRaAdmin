// Lo pendiente de cobro de las ventas como lo muestra la pestaña ⏳ Pendientes
// de Facturación: de todas las empresas o de una, agrupado por cliente. Las
// facturas por cobrar (completas y con abonos) van por cliente, y el IVA
// pendiente (las de solo neto), por cliente y por mes. Lo pendiente de cada
// factura sale de `pendingFor` (utils/billingDocs.js).
import { pendingFor } from "./billingDocs";
import { matchesSearchQuery } from "./textSearch";

// Las categorías que van en cada sección de la pestaña.
const INVOICE_CATEGORIES = new Set(["full", "partial"]);
const SECTIONS = ["invoices", "vat"];
const sectionOf = (category) => (INVOICE_CATEGORIES.has(category) ? "invoices" : "vat");

// La clave de una fila fijada en `pinned`: la factura y su sección, así una
// factura puede quedar fijada en las dos.
export function pinKeyOf(docId, category) {
  return `${docId}:${sectionOf(category)}`;
}

// Busca por cliente, RUT (con o sin puntos), folio o empresa.
function matchesSearch(d, search) {
  const q = String(search || "").trim();
  if (!q) return true;
  const text = [d.razonSocialReceptor, d.rutReceptor, d.folio, d.companyAlias].join(" ");
  return matchesSearchQuery(text, q) || matchesSearchQuery(text, q.replace(/\./g, ""));
}

// Por fecha de emisión y, el mismo día, por folio.
function byDate(a, b) {
  const da = String(a.doc.fechaEmision || "");
  const db = String(b.doc.fechaEmision || "");
  if (da !== db) return da.localeCompare(db);
  return (Number(a.doc.folio) || 0) - (Number(b.doc.folio) || 0);
}

// Los clientes de un grupo de filas, con lo que deben en total y por empresa.
// Una fila resuelta (`resolved`) no suma, pero cuenta para el orden: así un
// cliente no cambia de lugar mientras se van marcando sus facturas.
function groupByClient(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const rut = r.doc.rutReceptor || "";
    const razon = r.doc.razonSocialReceptor || "";
    const key = rut || `__${razon}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, rut, razon, total: 0, count: 0, weight: 0, rows: [], byCompany: new Map() };
      byKey.set(key, g);
    }
    g.rows.push(r);
    g.weight += r.pending;
    if (r.resolved) continue;
    g.total += r.pending;
    g.count += 1;
    g.byCompany.set(r.doc.companyId, (g.byCompany.get(r.doc.companyId) || 0) + r.pending);
  }
  return [...byKey.values()]
    .map((g) => ({
      key: g.key,
      rut: g.rut,
      razon: g.razon,
      total: g.total,
      count: g.count,
      weight: g.weight,
      rows: g.rows.sort(byDate),
      byCompany: [...g.byCompany].map(([companyId, amount]) => ({ companyId, amount })).sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.weight - a.weight || a.razon.localeCompare(b.razon, "es"));
}

// Los meses de un cliente del IVA pendiente, del más viejo al más nuevo, cada
// uno con su subtotal. El mes es el período del RCV.
function monthsOf(rows) {
  const byPeriod = new Map();
  for (const r of rows) {
    const periodo = r.doc.periodo || String(r.doc.fechaEmision || "").slice(0, 7);
    let m = byPeriod.get(periodo);
    if (!m) {
      m = { periodo, total: 0, count: 0, rows: [] };
      byPeriod.set(periodo, m);
    }
    m.rows.push(r);
    if (!r.resolved) {
      m.total += r.pending;
      m.count += 1;
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

// La vista de la pestaña. Cada fila es `{ doc, category, pending, resolved }`.
// - `companyId`: una empresa, o vacío para todas.
// - `category`: "full", "partial", "iva" o vacío para todas.
// - `search`: cliente, RUT, folio o empresa.
// - `pinned`: Map `pinKeyOf` → `{ category, pending }` de las filas que se
//   tocaron en esta visita. Si la factura ya no está pendiente en esa
//   sección, sigue en su lugar como resuelta, sin sumar. Una que pasó de
//   factura completa a solo neto aparece en las dos secciones: resuelta en la
//   primera y pendiente en la del IVA. Una que con un abono pasó de completa
//   a abono parcial sigue en la misma sección, una sola vez.
// `totals` cuenta lo pendiente de cada categoría con la empresa y la búsqueda
// (para los botones de categoría); `visibleTotal`, lo que se ve.
export function receivablesView(docs, { companyId = "", category = "", search = "", pinned = null } = {}) {
  const totals = { full: 0, partial: 0, iva: 0, total: 0, count: { full: 0, partial: 0, iva: 0, total: 0 } };
  const rows = [];
  for (const d of docs || []) {
    if (d.kind !== "venta") continue;
    if (companyId && d.companyId !== companyId) continue;
    if (!matchesSearch(d, search)) continue;
    const p = pendingFor(d);
    if (p) {
      totals[p.category] += p.amount;
      totals.total += p.amount;
      totals.count[p.category] += 1;
      totals.count.total += 1;
      rows.push({ doc: d, category: p.category, pending: p.amount, resolved: false });
    }
    if (!pinned) continue;
    for (const section of SECTIONS) {
      const pin = pinned.get(`${d.id}:${section}`);
      if (pin && !(p && sectionOf(p.category) === section)) {
        rows.push({ doc: d, category: pin.category, pending: pin.pending, resolved: true });
      }
    }
  }
  const visible = category ? rows.filter((r) => r.category === category) : rows;
  const vat = groupByClient(visible.filter((r) => r.category === "iva")).map((g) => ({ ...g, months: monthsOf(g.rows) }));
  return {
    totals,
    visibleTotal: visible.reduce((s, r) => s + (r.resolved ? 0 : r.pending), 0),
    visibleCount: visible.filter((r) => !r.resolved).length,
    invoices: groupByClient(visible.filter((r) => INVOICE_CATEGORIES.has(r.category))),
    vat,
  };
}

// La vista sin lo resuelto en la visita, para copiar, imprimir o bajar en
// Excel: lo que se exporta es lo que sigue pendiente. Los meses y los clientes
// que quedan sin nada pendiente salen.
export function withoutResolved(view) {
  const keep = (rows) => rows.filter((r) => !r.resolved);
  const invoices = view.invoices
    .map((g) => ({ ...g, rows: keep(g.rows) }))
    .filter((g) => g.rows.length > 0);
  const vat = view.vat
    .map((g) => {
      const months = g.months.map((m) => ({ ...m, rows: keep(m.rows) })).filter((m) => m.rows.length > 0);
      return { ...g, rows: keep(g.rows), months };
    })
    .filter((g) => g.rows.length > 0);
  return { ...view, invoices, vat };
}

// Las facturas que siguen pendientes en un grupo (un cliente o un mes): las
// que marca de una vez "✓ … pagado".
export function pendingDocsOf(rows) {
  return (rows || []).filter((r) => !r.resolved).map((r) => r.doc);
}
