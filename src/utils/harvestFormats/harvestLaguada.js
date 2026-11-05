// El JSON de cosecha que genera el script de las planillas de Laguada
// (`formato: "harvestLaguada"`): la producción de cada persona por día, hoja y
// combo (especie, calidad y envase), con los kilos y las unidades del envase
// (`cajas`), y los pisos con el monto de la hoja.
import { normalizeRut } from "../rutUtils";

const VERSIONS = [1];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => Number(v) || 0;
const text = (v) => (v == null ? "" : String(v).trim());

function parse(json) {
  if (!VERSIONS.includes(json.version)) {
    return { error: `El archivo es de una versión que TeRRa no conoce (${json.version}). Actualiza TeRRa o el script.` };
  }
  if (!Array.isArray(json.produccion)) return { error: "El archivo no trae la producción." };
  const rows = [];
  const bad = [];
  json.produccion.forEach((r, i) => {
    const rut = normalizeRut(r?.rut);
    const date = text(r?.fecha);
    if (!rut || !ISO_DATE.test(date)) {
      bad.push(i + 1);
      return;
    }
    rows.push({
      rut,
      name: text(r.nombre),
      contractor: text(r.contratista),
      sheet: text(r.hoja),
      date,
      field: text(r.campo),
      species: text(r.especie),
      quality: text(r.calidad),
      container: text(r.envase),
      kilos: num(r.kilos),
      units: num(r.cajas),
      companyPrice: r.precio_empresa == null ? null : num(r.precio_empresa),
    });
  });
  if (bad.length) {
    return { error: `Hay filas sin RUT o con una fecha inválida (${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}).` };
  }
  const floors = (Array.isArray(json.pisos) ? json.pisos : []).map((p) => ({
    rut: normalizeRut(p?.rut),
    name: text(p?.nombre),
    date: ISO_DATE.test(text(p?.fecha)) ? text(p.fecha) : null,
    amount: num(p?.monto),
    by: p?.por === "envase" ? "container" : p?.por ? "other" : null,
    group: p?.grupo == null ? null : text(p.grupo),
    rule: text(p?.regla),
  })).filter((p) => p.rut && p.amount > 0);
  return {
    file: {
      name: text(json.archivo),
      week: text(json.semana),
      period: { from: json.periodo?.desde || null, to: json.periodo?.hasta || null },
      status: text(json.estado),
      defaultMeasure: json.unidad_pago === "caja" ? "units" : "kilos",
      sheets: (Array.isArray(json.cosechas) ? json.cosechas : []).map((c) => ({
        sheet: text(c.hoja),
        species: Array.isArray(c.especies) ? c.especies.map(text) : [],
      })),
      rows,
      floors,
      warnings: Array.isArray(json.advertencias) ? json.advertencias.map(text) : [],
    },
  };
}

export const harvestLaguada = {
  id: "harvestLaguada",
  label: "Laguada (el JSON del script de sus planillas)",
  matches: (json) => json.formato === "harvestLaguada",
  parse,
};
