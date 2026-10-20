// Cálculo del modal de centros de costo de Facturación: los documentos y
// gastos informales de un centro (de todas las empresas y períodos), sus
// filtros, totales y orden. `FUEL_VIEW_ID` es el centro automático de
// combustibles, que sale del código de impuesto del SII.
import { CREDIT_NOTE_TYPES } from "./cashFlowProjection";

export const FUEL_VIEW_ID = "__fuel__";

export function companiesByName(companiesById) {
  return [...companiesById.values()].sort((a, b) => (a.alias || a.razonSocial || "").localeCompare(b.alias || b.razonSocial || ""));
}

export function centerDocsOf(docs, selectedId) {
  if (!selectedId) return [];
  return selectedId === FUEL_VIEW_ID
    ? docs.filter((d) => d.otroImpuestoCategory === "combustible")
    : docs.filter((d) => d.costCenterId === selectedId);
}

export function filterCenterDocs({ baseDocs, kindFilter, companyFilterId, dateFrom, dateTo, search }) {
  let list = baseDocs;
  if (kindFilter) list = list.filter((d) => d.kind === kindFilter);
  if (companyFilterId) list = list.filter((d) => d.companyId === companyFilterId);
  if (dateFrom) list = list.filter((d) => (d.fechaEmision || "") >= dateFrom);
  if (dateTo) list = list.filter((d) => (d.fechaEmision || "") <= dateTo);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter((d) => {
      const razon = (d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor) || "";
      const rut = (d.kind === "venta" ? d.rutReceptor : d.rutEmisor) || "";
      return razon.toLowerCase().includes(q) || rut.toLowerCase().includes(q) || String(d.folio || "").includes(q);
    });
  }
  return list;
}

// Gastos informales del centro elegido — plata sin factura/boleta formal.
// Puramente informativo: nunca entran a `totals` (esos quedan 100% fiscales,
// fieles a los dteDocuments reales); tienen su propio subtotal aparte.
// Nunca aparecen si el filtro Mov. está en "Venta" (un gasto informal nunca
// es una venta).
export function centerInformalOf(informalExpenses, selectedId, kindFilter) {
  if (!selectedId || kindFilter === "venta") return [];
  return informalExpenses.filter((e) => e.costCenterId === selectedId).map((e) => ({ ...e, __informal: true }));
}

export function filterCenterInformal({ baseInformal, companyFilterId, dateFrom, dateTo, search }) {
  let list = baseInformal;
  if (companyFilterId) list = list.filter((e) => e.companyId === companyFilterId);
  if (dateFrom) list = list.filter((e) => (e.date || "") >= dateFrom);
  if (dateTo) list = list.filter((e) => (e.date || "") <= dateTo);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter((e) => (e.detail || "").toLowerCase().includes(q));
  }
  return list;
}

export function centerDocTotals(filtered) {
  let neto = 0, iva = 0, total = 0;
  for (const d of filtered) {
    const s = CREDIT_NOTE_TYPES.has(Number(d.tipo)) ? -1 : 1;
    neto += s * (Number(d.neto) || 0);
    iva += s * (Number(d.iva) || 0);
    total += s * (Number(d.total) || 0);
  }
  return { neto, iva, total };
}

export function informalTotalOf(filteredInformal) {
  return filteredInformal.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

// Valor de una fila (documento o gasto informal) en la columna `key`, para
// ordenar la vista del centro.
export function centerRowSortValue(d, key, companiesById) {
  if (d.__informal) {
    switch (key) {
      case "fechaEmision": return d.date || "";
      case "empresa": {
        const co = companiesById.get(d.companyId);
        return co?.alias || co?.razonSocial || "";
      }
      case "folio": return 0;
      case "razon": return d.detail || "";
      case "neto": return 0;
      case "iva": return 0;
      case "total": return Number(d.amount) || 0;
      default: return "";
    }
  }
  switch (key) {
    case "fechaEmision": return d.fechaEmision || "";
    case "empresa": {
      const co = companiesById.get(d.companyId);
      return co?.alias || co?.razonSocial || "";
    }
    case "folio": return Number(d.folio) || 0;
    case "razon": return (d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor) || "";
    case "neto": return Number(d.neto) || 0;
    case "iva": return Number(d.iva) || 0;
    case "total": return Number(d.total) || 0;
    default: return "";
  }
}

// Documentos y gastos informales juntos, en el orden elegido.
export function sortCenterRows(filtered, filteredInformal, sortBy, companiesById) {
  const arr = [...filtered, ...filteredInformal];
  arr.sort((a, b) => {
    const av = centerRowSortValue(a, sortBy.key, companiesById);
    const bv = centerRowSortValue(b, sortBy.key, companiesById);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortBy.dir === "asc" ? cmp : -cmp;
  });
  return arr;
}
