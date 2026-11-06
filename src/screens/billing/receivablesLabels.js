// Textos de la pestaña Pendientes que comparten la tabla del escritorio, las
// tarjetas del teléfono y lo que se exporta.
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { fmtCurrency } from "../../utils/format";
import { RECEIVABLE_CATEGORIES } from "../../utils/billingDocs";
import { formatPeriodPretty, PAYMENT_STATUSES } from "./docs";

// Los filtros de categoría, en el orden en que se muestran.
export const RECEIVABLE_CHIPS = [
  { v: "", label: "Todos" },
  ...Object.values(RECEIVABLE_CATEGORIES)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ v: c.key, label: c.label })),
];

// El tipo de documento, como en la columna Tipo del listado.
export function docTypeLabel(d) {
  return d.tipoLabel || dteTypeLabel(d.tipo);
}

// El estado de pago, como lo dice el selector de la fila.
export function statusLabel(d) {
  return PAYMENT_STATUSES[d.paymentStatus || "unpaid"]?.label || "—";
}

// "septiembre 2026", para los subtotales del IVA.
export function monthLabel(periodo) {
  return formatPeriodPretty(periodo).toLowerCase();
}

// "Septiembre", para el botón que marca pagado un mes.
export function monthName(periodo) {
  return formatPeriodPretty(periodo).split(" ")[0];
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// La línea "Agrícola Demo $X · Transportes Demo $Y" de un cliente que les
// debe a más de una empresa. Vacía si es una sola.
export function companyBreakdown(byCompany, companyLabel) {
  if (!byCompany || byCompany.length < 2) return "";
  return byCompany.map((c) => `${companyLabel(c.companyId)} ${fmtCurrency(c.amount)}`).join(" · ");
}

// La pregunta antes de marcar pagado un mes del IVA de un cliente.
export function monthBulkMessage(group, month) {
  return `¿Marcar pagado el IVA de ${monthLabel(month.periodo)} de ${group.razon || "este cliente"}? Son ${plural(month.count, "factura", "facturas")} por ${fmtCurrency(month.total)}.`;
}

// La pregunta antes de marcar pagado todo lo de un cliente en una sección.
export function clientBulkMessage(group, isVat) {
  const what = isVat ? "todo el IVA pendiente" : `las ${plural(group.count, "factura", "facturas")} pendientes`;
  return `¿Marcar pagado ${what} de ${group.razon || "este cliente"}? ${isVat ? `Son ${plural(group.count, "factura", "facturas")} por` : "Suman"} ${fmtCurrency(group.total)}.`;
}
