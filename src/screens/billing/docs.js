// Ayudas que comparten las piezas de Facturación: el período, los estados de
// pago y el agrupado por centro de costo.
import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";

// Convierte un periodo "YYYY-MM" a "Mes Año" (ej. "2026-05" → "Mayo 2026").
// Si el periodo está vacío, devuelve "Todos los períodos" para que los
// títulos de export tengan algo legible cuando no se filtra por período.
export const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatPeriodPretty(periodo) {
  if (!periodo) return "Todos los períodos";
  const m = String(periodo).match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodo;
  const idx = Number(m[2]) - 1;
  return `${MONTH_NAMES_ES[idx] || m[2]} ${m[1]}`;
}

// Etiqueta del tipo para los títulos de export. La pestaña dice "Facturas";
// lo exportado dice "Ventas/Facturas" para que quien lo reciba entienda el
// contexto fiscal.
export function kindTitleLabel(kind) {
  if (kind === "venta") return "Ventas/Facturas";
  if (kind === "compra") return "Compras";
  return kind;
}

// Etiquetas y colores de los estados de pago. Los 5 estados aplicables a
// facturas/boletas afectas:
//   - unpaid: pendiente de cobro/pago.
//   - paid: completo.
//   - net_only: el cliente solo pagó el NETO (retuvo el IVA, típico de
//     servicios con retención al SII). Se listan aparte en la pestaña "Retenciones".
//   - factored: factura cedida vía factoring (el cliente paga al factor; queda
//     "solo IVA" en libros).
//   - cancelled: factura anulada por una NC posterior. Se marca a mano; si hay
//     una NC candidata, la pantalla lo sugiere.
// Las notas de crédito (tipos 61/112) no usan estos estados: se muestran con
// un chip fijo "Anulada" porque su función es anular otra factura.
export const PAYMENT_STATUSES = {
  unpaid: { label: "No pagado", chip: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" },
  paid: { label: "Pagado", chip: "bg-[var(--color-success-soft)] text-[var(--color-success)]" },
  net_only: { label: "Solo neto", chip: "bg-[var(--color-warning-soft)] text-[var(--color-text)]" },
  factored: { label: "Solo IVA", chip: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" },
  cancelled: { label: "Anulada", chip: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" },
};

export const CREDIT_NOTE_STATE = { label: "Anulada", chip: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" };

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Agrupa docs por centro de costo. Orden de los grupos:
//   - Combustibles (cualquier doc con `otroImpuestoCategory === "combustible"`):
//     un grupo único "⛽ COMBUSTIBLES", siempre primero.
//   - Centros de costo manuales (`costCenterId` presente en `costCentersById`).
//   - El resto, un grupo por contraparte (rutEmisor en compras, rutReceptor en
//     ventas).
// Los grupos manuales y los de contraparte se ordenan por |total| desc; los
// docs de cada grupo, por fecha ascendente. Totales con signo (las NC restan).
// Sin `costCentersById`, todo lo que no es combustible se agrupa por
// contraparte. Combustibles siempre gana: un doc de combustible no se puede
// mover a un centro manual.
export function groupDocsByCostCenter(docs, kind, costCentersById = new Map()) {
  const fuel = { key: "__combustibles__", isFuel: true, razon: "Combustibles", rut: "", docs: [], neto: 0, iva: 0, total: 0 };
  const manualGroups = new Map();
  const byContra = new Map();
  for (const d of docs) {
    const isFuel = d.otroImpuestoCategory === "combustible";
    const cc = !isFuel && d.costCenterId ? costCentersById.get(d.costCenterId) : null;
    if (isFuel) {
      fuel.docs.push(d);
    } else if (cc) {
      if (!manualGroups.has(d.costCenterId)) {
        manualGroups.set(d.costCenterId, {
          key: `cc_${d.costCenterId}`,
          isFuel: false,
          isManual: true,
          razon: cc.emoji ? `${cc.emoji} ${cc.label}` : cc.label,
          rut: "",
          docs: [],
          neto: 0,
          iva: 0,
          total: 0,
        });
      }
      manualGroups.get(d.costCenterId).docs.push(d);
    } else {
      const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
      const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
      const key = rut || `__norut_${razon || "_"}`;
      if (!byContra.has(key)) {
        byContra.set(key, { key, isFuel: false, razon: razon || "—", rut, docs: [], neto: 0, iva: 0, total: 0 });
      }
      byContra.get(key).docs.push(d);
    }
  }
  // Acumular totales con signo (NCs restan).
  const accumulate = (g) => {
    for (const d of g.docs) {
      const s = CREDIT_NOTE_TYPES.has(Number(d.tipo)) ? -1 : 1;
      g.neto += s * (Number(d.neto) || 0);
      g.iva += s * (Number(d.iva) || 0);
      g.total += s * (Number(d.total) || 0);
    }
    g.docs.sort((a, b) => String(a.fechaEmision || "").localeCompare(String(b.fechaEmision || "")));
  };
  accumulate(fuel);
  for (const g of manualGroups.values()) accumulate(g);
  for (const g of byContra.values()) accumulate(g);
  const manual = [...manualGroups.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const others = [...byContra.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return [...(fuel.docs.length > 0 ? [fuel] : []), ...manual, ...others];
}
