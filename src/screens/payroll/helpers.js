// Formatos y ayudas que comparten las piezas de Nómina.
import { ACCOUNT_TYPES } from "../../utils/banks";
import { currentRutResolver } from "../../utils/workerRut";
import { millisOf } from "../../utils/syncedList";

// "2026-08-31" -> "31/08". Etiqueta de día corta para las tablas de resumen.
export const fmtDayShortEs = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  return m ? `${m[3]}/${m[2]}` : (d || "");
};

// Un Timestamp (también el `{ seconds, nanoseconds }` de la copia guardada) o
// un string ISO.
export const fmtDate = (v) => {
  if (!v) return "—";
  const ms = millisOf(v);
  const d = ms ? new Date(ms) : new Date(v);
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

// Ayudas del estimado de lo pendiente por medio de pago, en Generar.
export const PAY_SPLIT_HINT =
  "Estimado en bruto, según el banco que tiene cargado cada trabajador. El monto definitivo por medio de pago sale en la vista previa, después de anticipos/bonos y de los cambios que hagas ahí.";

export const PAY_UNKNOWN_HINT =
  "Trabajadores sin banco cargado o que no están en el catálogo. Se define su medio de pago en la vista previa.";
