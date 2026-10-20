// Cálculo de Facturación sobre los documentos del RCV ya cargados: los filtros
// y el orden del listado, los totales con signo (las NC restan), las
// retenciones por contraparte, lo pendiente de cobro, las NC que pueden anular
// una factura y el resumen anual de IVA. `kindTab` es la pestaña: "venta",
// "compra" o "retenciones".
import { CREDIT_NOTE_TYPES } from "./cashFlowProjection";

// Categorías de facturas pendientes que aparecen en el modal "Ver pendientes".
// Cada factura no anulada y no pagada cae en una sola categoría según su
// estado y sus pagos registrados:
//   - full:    estado "unpaid" sin abonos → debe el total completo.
//   - partial: estado "unpaid" con abonos pero saldo > 0.
//   - iva:     estado "net_only" → IVA pendiente (el IVA menos lo que ya
//              cubren los pagos registrados por encima del neto).
export const RECEIVABLE_CATEGORIES = {
  full:    { key: "full",    label: "Factura completa pendiente", order: 1, hex: "#ffd6d6" },
  partial: { key: "partial", label: "Abono parcial",              order: 2, hex: "#fff2cc" },
  iva:     { key: "iva",     label: "IVA pendiente",              order: 3, hex: "#dde9ff" },
};

// Devuelve `{ category, amount }` para una factura pendiente, o null si no
// tiene nada pendiente (pagada, anulada, NC, etc.).
// `factored` (Solo IVA, cedida vía factoring) cuenta como **pagada** para
// efectos de cobranza: el factor ya pagó el neto al emisor y el cliente le
// debe al factor, no a la empresa. El IVA es una obligación tributaria
// separada que se gestiona en el F29, no en este flujo.
export function pendingFor(d) {
  if (CREDIT_NOTE_TYPES.has(Number(d.tipo))) return null;
  const st = d.paymentStatus || "unpaid";
  if (st === "cancelled" || st === "paid" || st === "factored") return null;
  const total = Number(d.total) || 0;
  const neto = Number(d.neto) || 0;
  const iva = Number(d.iva) || 0;
  const paid = Number(d.amountPaid) || 0;
  if (st === "unpaid") {
    const pending = total - paid;
    if (pending <= 0.5) return null;
    return { category: paid > 0 ? "partial" : "full", amount: pending };
  }
  if (st === "net_only") {
    // Lo que ya está cubierto por pagos por encima del neto se imputa al IVA.
    const vatCovered = Math.max(0, paid - neto);
    const pending = Math.max(0, iva - vatCovered);
    if (pending <= 0.5) return null;
    return { category: "iva", amount: pending };
  }
  return null;
}

// Heurística para sugerir que una factura está anulada por una NC.
// Coincide: misma empresa + kind + contraparte (RUT) + total exacto, con la NC
// emitida en fecha >= factura. Es solo una sugerencia: un cliente con dos
// facturas del mismo monto y una NC da coincidencia en ambas, así que el
// usuario decide si la marca como Anulada.
export function findCancellingNcs(dteDoc, allDocs) {
  if (CREDIT_NOTE_TYPES.has(Number(dteDoc.tipo))) return [];
  const total = Number(dteDoc.total) || 0;
  if (total <= 0) return [];
  const counterpartyRut = dteDoc.kind === "venta" ? dteDoc.rutReceptor : dteDoc.rutEmisor;
  if (!counterpartyRut) return [];
  const out = [];
  for (const d of allDocs) {
    if (!CREDIT_NOTE_TYPES.has(Number(d.tipo))) continue;
    if (d.companyId !== dteDoc.companyId) continue;
    if (d.kind !== dteDoc.kind) continue;
    const dRut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
    if (dRut !== counterpartyRut) continue;
    if ((Number(d.total) || 0) !== total) continue;
    if (d.fechaEmision && dteDoc.fechaEmision && d.fechaEmision < dteDoc.fechaEmision) continue;
    out.push(d);
  }
  return out;
}

// Filtros del listado.
export function filterDocs({ docs, kindTab, isWithholdingsView, selectedCompanyId, periodFilter, typeFilter, paymentFilter, search }) {
  let arr = docs;
  if (isWithholdingsView) {
    // En retenciones: filtro implícito por estado, sin restringir kind.
    arr = arr.filter((d) => (d.paymentStatus || "unpaid") === "net_only");
  } else {
    arr = arr.filter((d) => d.kind === kindTab);
  }
  if (selectedCompanyId) arr = arr.filter((d) => d.companyId === selectedCompanyId);
  // Al buscar por texto (contraparte/RUT/folio) el período se ignora: la
  // búsqueda responde "todas las facturas de esa empresa", no solo las del
  // mes elegido. Al limpiar la búsqueda el filtro de período vuelve a regir.
  const searching = !!search.trim();
  if (periodFilter && !searching) arr = arr.filter((d) => d.periodo === periodFilter);
  if (typeFilter) arr = arr.filter((d) => String(d.tipo) === String(typeFilter));
  // El estado de pago solo se lleva en ventas; en Compras los chips del
  // filtro no se muestran, así que tampoco filtran.
  if (kindTab === "venta" && paymentFilter) {
    arr = arr.filter((d) => (d.paymentStatus || "unpaid") === paymentFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase().trim();
    arr = arr.filter((d) => {
      const razonV = (d.razonSocialReceptor || "").toLowerCase();
      const razonC = (d.razonSocialEmisor || "").toLowerCase();
      const rutV = (d.rutReceptor || "").toLowerCase();
      const rutC = (d.rutEmisor || "").toLowerCase();
      return (
        razonV.includes(q) || razonC.includes(q) ||
        rutV.includes(q) || rutC.includes(q) ||
        String(d.folio).includes(q)
      );
    });
  }
  return arr;
}

// Valor de un documento en la columna `key`, para ordenar el listado. Al
// ordenar por estado, las NC usan la clave `zz_anulada`, que las deja al final
// en orden ascendente.
export function docSortValue(d, key, kindTab) {
  switch (key) {
    case "fechaEmision": return d.fechaEmision || "";
    case "tipo": return Number(d.tipo) || 0;
    case "folio": return Number(d.folio) || 0;
    case "razon": return (kindTab === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor) || "";
    case "rut": return (kindTab === "venta" ? d.rutReceptor : d.rutEmisor) || "";
    case "neto": return Number(d.neto) || 0;
    case "iva": return Number(d.iva) || 0;
    case "total": return Number(d.total) || 0;
    case "pagado": return Number(d.amountPaid) || 0;
    case "saldo": return (Number(d.total) || 0) - (Number(d.amountPaid) || 0);
    case "estado": return CREDIT_NOTE_TYPES.has(Number(d.tipo)) ? "zz_anulada" : (d.paymentStatus || "unpaid");
    default: return 0;
  }
}

// Orden de la tabla principal (facturas y compras); la vista de retenciones
// agrupa por su cuenta.
export function sortDocs(filtered, sortBy, kindTab) {
  const arr = [...filtered];
  arr.sort((a, b) => {
    const av = docSortValue(a, sortBy.key, kindTab);
    const bv = docSortValue(b, sortBy.key, kindTab);
    let cmp;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortBy.dir === "asc" ? cmp : -cmp;
  });
  return arr;
}

// Números de página con ventana: 1 … (cur−1) cur (cur+1) … último.
export function pageWindow(pageCount, currentPage) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const set = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

// Lista de contrapartes únicas (razón social) para el datalist del buscador.
// Sale de los docs filtrados solo por empresa y kind, sin el resto de los
// filtros, para que el dropdown muestre todas las opciones posibles.
export function counterpartyOptions({ docs, kindTab, isWithholdingsView, selectedCompanyId }) {
  const set = new Set();
  for (const d of docs) {
    if (!isWithholdingsView && d.kind !== kindTab) continue;
    if (selectedCompanyId && d.companyId !== selectedCompanyId) continue;
    const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
    if (razon) set.add(razon);
  }
  return [...set].sort();
}

// Retenciones agrupadas por contraparte (RUT) → suma neto/iva/total + lista
// de docs. Para la pestaña Retenciones.
export function withholdingsByCounterpartyOf(filtered, isWithholdingsView) {
  if (!isWithholdingsView) return [];
  const map = new Map();
  for (const d of filtered) {
    const rutContra = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
    const razonContra = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
    const key = rutContra || "__sin_rut__";
    if (!map.has(key)) {
      map.set(key, {
        rut: rutContra, razon: razonContra,
        neto: 0, iva: 0, total: 0, count: 0, docs: [],
      });
    }
    const g = map.get(key);
    g.neto += Number(d.neto) || 0;
    g.iva += Number(d.iva) || 0;
    g.total += Number(d.total) || 0;
    g.count++;
    g.docs.push(d);
  }
  return [...map.values()].sort((a, b) => b.iva - a.iva);
}

export function periodOptionsOf({ docs, kindTab, isWithholdingsView, selectedCompanyId, current }) {
  const set = new Set();
  for (const d of docs) {
    // En retenciones la pestaña no corresponde a un `kind` (venta/compra),
    // así que se toma cualquier doc con estado net_only para que el dropdown
    // ofrezca los meses pasados que tienen retenciones.
    const matchesTab = isWithholdingsView
      ? (d.paymentStatus || "unpaid") === "net_only"
      : d.kind === kindTab;
    if (matchesTab && d.periodo) {
      if (!selectedCompanyId || d.companyId === selectedCompanyId) set.add(d.periodo);
    }
  }
  set.add(current);
  return [...set].sort().reverse();
}

export function typeOptionsOf({ docs, kindTab, selectedCompanyId }) {
  const set = new Set();
  for (const d of docs) {
    if (d.kind === kindTab) {
      if (!selectedCompanyId || d.companyId === selectedCompanyId) set.add(d.tipo);
    }
  }
  return [...set].sort((a, b) => a - b);
}

// Totales con signo: las NC restan en lugar de sumar. Además cuenta las NC
// por separado para su tarjeta propia, y desglosa los montos por estado de
// pago (unpaid/net_only/factored) sumando solo facturas, no NC.
export function docTotals(filtered) {
  const t = {
    neto: 0, iva: 0, total: 0, count: 0,
    ncTotal: 0, ncCount: 0,
    unpaidTotal: 0, netOnlyTotal: 0, netOnlyIva: 0, factoredTotal: 0,
  };
  for (const d of filtered) {
    const sign = CREDIT_NOTE_TYPES.has(Number(d.tipo)) ? -1 : 1;
    t.neto += sign * (Number(d.neto) || 0);
    t.iva += sign * (Number(d.iva) || 0);
    t.total += sign * (Number(d.total) || 0);
    t.count++;
    if (sign < 0) {
      t.ncTotal += Number(d.total) || 0;
      t.ncCount++;
    }
    const st = d.paymentStatus || "unpaid";
    if (sign > 0) {
      if (st === "unpaid") t.unpaidTotal += Number(d.total) || 0;
      if (st === "net_only") {
        t.netOnlyTotal += Number(d.total) || 0;
        t.netOnlyIva += Number(d.iva) || 0;
      }
      if (st === "factored") t.factoredTotal += Number(d.total) || 0;
    }
  }
  return t;
}

// Mapa de docId → [NC candidatas]. Se calcula sobre TODOS los docs (no solo
// filtered) para que una NC cuente aunque el usuario esté filtrando por otra
// cosa. Excluye las facturas ya marcadas como anuladas: para esas la
// sugerencia no aplica.
export function cancellingNcsByDoc(docs) {
  const m = new Map();
  for (const d of docs) {
    if (CREDIT_NOTE_TYPES.has(Number(d.tipo))) continue;
    if ((d.paymentStatus || "unpaid") === "cancelled") continue;
    const ncs = findCancellingNcs(d, docs);
    if (ncs.length > 0) m.set(d.id, ncs);
  }
  return m;
}

// Lista global de facturas pendientes (cualquier período) para la empresa
// seleccionada; alimenta el modal "Ver pendientes". **Solo ventas** (kind
// === "venta"): las compras tienen su propio flujo de seguimiento, y las
// cuentas por cobrar no se mezclan con las cuentas por pagar.
// Cada item lleva `_category` y `_pending` calculados por `pendingFor`.
// Ordenado por categoría (full → partial → iva) y luego por fecha ascendente.
export function receivablesOf(docs, selectedCompanyId) {
  const arr = [];
  for (const d of docs) {
    if (d.kind !== "venta") continue;
    if (selectedCompanyId && d.companyId !== selectedCompanyId) continue;
    const p = pendingFor(d);
    if (!p) continue;
    arr.push({ ...d, _category: p.category, _pending: p.amount });
  }
  arr.sort((a, b) => {
    const oa = RECEIVABLE_CATEGORIES[a._category].order;
    const ob = RECEIVABLE_CATEGORIES[b._category].order;
    if (oa !== ob) return oa - ob;
    return String(a.fechaEmision || "").localeCompare(String(b.fechaEmision || ""));
  });
  return arr;
}

export function receivablesTotalsOf(receivablesList) {
  const t = { full: 0, partial: 0, iva: 0, total: 0, count: { full: 0, partial: 0, iva: 0 } };
  for (const d of receivablesList) {
    t[d._category] += d._pending;
    t.total += d._pending;
    t.count[d._category]++;
  }
  return t;
}

// ===== Resumen anual (pestaña "Resumen") =====
// Años disponibles para el selector — derivados de los períodos de la empresa
// seleccionada. Siempre incluye el año actual aunque no tenga docs todavía.
export function summaryYearsOf(docs, selectedCompanyId, currentYear) {
  const set = new Set();
  for (const d of docs) {
    if (selectedCompanyId && d.companyId !== selectedCompanyId) continue;
    const y = String(d.periodo || "").slice(0, 4);
    if (y) set.add(y);
  }
  set.add(String(currentYear));
  return [...set].sort().reverse();
}

// Resumen mensual del año elegido para la empresa seleccionada. Por cada mes
// acumula ventas/compras con signo (NC restan) separando IVA débito (ventas)
// de IVA crédito (compras). El IVA de las facturas "Solo neto" (net_only) se
// suma normalmente al débito/crédito que corresponda, sin separarlo.
// IVA a pagar del mes = débito − crédito.
export function annualSummary(docs, selectedCompanyId, summaryYear) {
  const mk = () => ({
    salesNet: 0, vatDebit: 0, salesTotal: 0, salesCount: 0,
    purchasesNet: 0, vatCredit: 0, purchasesTotal: 0, purchasesCount: 0,
  });
  const months = Array.from({ length: 12 }, mk);
  for (const d of docs) {
    if (selectedCompanyId && d.companyId !== selectedCompanyId) continue;
    const p = String(d.periodo || "");
    if (p.slice(0, 4) !== summaryYear) continue;
    const mi = Number(p.slice(5, 7)) - 1;
    if (mi < 0 || mi > 11) continue;
    const m = months[mi];
    const sign = CREDIT_NOTE_TYPES.has(Number(d.tipo)) ? -1 : 1;
    const neto = Number(d.neto) || 0;
    const iva = Number(d.iva) || 0;
    const total = Number(d.total) || 0;
    if (d.kind === "venta") {
      m.salesNet += sign * neto;
      m.vatDebit += sign * iva;
      m.salesTotal += sign * total;
      m.salesCount++;
    } else if (d.kind === "compra") {
      m.purchasesNet += sign * neto;
      m.vatCredit += sign * iva;
      m.purchasesTotal += sign * total;
      m.purchasesCount++;
    }
  }
  const total = mk();
  for (const m of months) {
    for (const k of Object.keys(total)) total[k] += m[k];
  }
  return { months, total };
}

// ===== Proyección de flujo de caja (solo admin) =====
// Estima la temporada que viene escalando la anterior: los ingresos por
// ventas de los 12 meses previos, mes a mes, por un porcentaje. Sale entera
// de `docs`, que ya está en memoria con toda la colección: la proyección no
// cuesta lecturas.
export function projectionYearsOf(docs, selectedCompanyId, currentYear) {
  const now = currentYear;
  const set = new Set([now, now + 1, now + 2].map(String));
  for (const d of docs) {
    if (selectedCompanyId && d.companyId !== selectedCompanyId) continue;
    const y = String(d.periodo || "").slice(0, 4);
    // La base son los 12 meses anteriores, así que un año con datos habilita
    // a proyectar el siguiente.
    if (y) { set.add(y); set.add(String(Number(y) + 1)); }
  }
  return [...set].sort().reverse();
}
