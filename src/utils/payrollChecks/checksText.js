// La revisión de la nómina como texto, para avisar lo que hay que corregir.
// Va solo lo que falta revisar: las alertas revisadas no se copian.
import { normalizeRut } from "../rutUtils";
import { SEVERITY_ICON, worstSeverity } from "./checkContext";

// Una persona y lo encontrado: en la misma línea si es una sola cosa, y debajo
// si son varias. El RUT va sin puntos.
function alertText(a) {
  const who = a.general ? a.name : `${a.name || "(sin nombre)"} (${normalizeRut(a.rut)})`;
  if (a.lines.length === 1) return `• ${who}: ${a.lines[0]}`;
  return [`• ${who}:`, ...a.lines.map((line) => `   - ${line}`)].join("\n");
}

// Una revisión: su título, cuántas personas faltan y una línea por persona.
// Vacío si están todas revisadas.
export function checkGroupText(check, alerts) {
  const open = (alerts || []).filter((a) => !a.review);
  if (!open.length) return "";
  return [`${SEVERITY_ICON[worstSeverity(open.map((a) => a.severity))]} ${check.title} (${open.length})`, ...open.map(alertText)].join("\n");
}

// Todas las revisiones (`[{ check, alerts }]`, en el orden en que se ven),
// con el nombre de la nómina arriba. Vacío si no falta nada por revisar.
export function checksText(payrollName, groups) {
  const parts = (groups || []).map((g) => checkGroupText(g.check, g.alerts)).filter(Boolean);
  if (!parts.length) return "";
  const title = payrollName ? `Revisión de la nómina ${payrollName}` : "Revisión de la nómina";
  return [title, ...parts].join("\n\n");
}
