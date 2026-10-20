// Formatos y ayudas que comparten las piezas de Nómina.
import { ACCOUNT_TYPES } from "../../utils/banks";
import { currentRutResolver } from "../../utils/workerRut";

// "2026-08-31" -> "31/08". Etiqueta de día corta para las tablas de resumen.
export const fmtDayShortEs = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  return m ? `${m[3]}/${m[2]}` : (d || "");
};

export const fmtDate = (v) => {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL");
};

export const accountTypeShort = (v) => ACCOUNT_TYPES.find((t) => t.value === Number(v))?.code || "JUV";

// Los anticipos cuelgan del rut vigente del trabajador, y un workday guarda el
// rut que tenía al crearse: se resuelve contra la ficha, con la lista de
// trabajadores ya cargada (sin lecturas).
export const resolveCurrentRut = (workers) => {
  const rutOf = currentRutResolver(workers);
  return (agg) => rutOf(agg.rut, agg.workerId);
};
