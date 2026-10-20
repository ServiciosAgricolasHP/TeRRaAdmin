// Etiquetas y estilos del detalle de pago de una persona.
import { tratoTypeLabel, tratoUnitLabel, cosechaUnit } from "../../utils/cosechaCombos";

export const WORKER_DETAIL_CELL_H = { border: "1px solid #555", padding: "5px 7px", fontSize: 11, fontWeight: 700, textAlign: "left", color: "#000" };

export const WORKER_DETAIL_CELL = { border: "1px solid #999", padding: "4px 7px", fontSize: 11, color: "#000" };

const WD_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function workerDetailDateLabel(d) {
  if (!d) return "";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}-${WD_MONTHS[Number(m[2]) - 1] || m[2]}`;
}

// Etiqueta secundaria (debajo del nombre) según el tipo de labor:
// trato → tratoTypeLabel (Poda, Amarre…) + la unidad, si tiene
// tratoHE → "Tratos HE / Jornadas"
// cosecha → "Cosecha"
// main / supervision / extra → nombres legibles; otro tipo, el tipo tal cual.
export function laborSubtypeLabel(labor, catalogs) {
  if (!labor) return "";
  const t = labor.type;
  if (t === "cosecha") return "Cosecha";
  if (t === "trato") {
    const typeLbl = labor.tratoType != null ? tratoTypeLabel(catalogs, labor.tratoType) : "Trato";
    const unitLbl = labor.tratoUnit != null ? tratoUnitLabel(catalogs, labor.tratoUnit) : null;
    return unitLbl ? `${typeLbl} · ${unitLbl}` : typeLbl;
  }
  if (t === "tratoHE") return "Tratos HE / Jornadas";
  if (t === "main") return "Jornada principal";
  if (t === "supervision") return "Supervisión";
  if (t === "extra") return "Extra";
  return t || "";
}

// Etiqueta corta para el texto plano: nombre y subtipo entre paréntesis.
export function laborDisplayLabel(labor, catalogs) {
  const name = labor?.name || "";
  const sub = laborSubtypeLabel(labor, catalogs);
  return sub ? `${name} (${sub})` : name;
}

export function formatWorkerDetailProd(r, catalogs) {
  const num = (v) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(Number(v) || 0);
  if (r.labor?.type === "cosecha") {
    const unit = r.containers.size > 0 ? cosechaUnit(catalogs, r.containers).toLowerCase() : "kg";
    return r.kilos > 0 ? `${num(r.kilos)} ${unit}` : "—";
  }
  if (r.labor?.type === "trato") {
    if (r.tratoQty === 0) return "—";
    // Usar la(s) unidad(es) del catálogo si están disponibles. Si hay varias
    // (multi-tier con unidades distintas) las juntamos con "/".
    const unitNames = [...r.tratoUnits]
      .map((u) => tratoUnitLabel(catalogs, u))
      .filter(Boolean);
    const unitStr = unitNames.length > 0 ? " " + unitNames.join("/").toLowerCase() : "";
    return `${num(r.tratoQty)}${unitStr}`;
  }
  const jornadas = (n) => `${num(n)} jornada${Number(n) === 1 ? "" : "s"}`;
  if (r.labor?.type === "tratoHE") {
    const base = r.jornadas > 0 ? jornadas(r.jornadas) : "";
    const ot = r.overtimeHours > 0 ? `${num(r.overtimeHours)}h HE` : "";
    return [base, ot].filter(Boolean).join(" · ") || "—";
  }
  return r.jornadas > 0 ? jornadas(r.jornadas) : "—";
}
