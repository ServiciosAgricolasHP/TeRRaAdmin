import { fmtNumber, fmtPercent } from "../../../utils/format";

// Formatos de las tablas del informe de lecturas.

// Una tasa redondeada, o "—" si no hay con qué calcularla.
export const fmtRate = (value) => (value == null ? "—" : fmtNumber(Math.round(value)));

// La parte de un total: "12,5%".
export const fmtShare = (part, total) => (total ? fmtPercent((100 * part) / total, 1) : "—");

// Lo que ahorró una caché, o "—" si nada.
export const fmtSaved = (docs) => (docs ? fmtNumber(docs) : "—");
