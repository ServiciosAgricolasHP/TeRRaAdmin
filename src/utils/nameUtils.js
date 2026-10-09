// Conectores comunes en nombres propios en español que quedan en minúscula
// cuando aparecen en el medio del nombre ("Juan de la Cruz"). En la primera
// posición sí se capitalizan ("De la Torre").
const CONNECTORS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do", "dos", "das"]);

// Iniciales para avatares (2 letras): primera + primera del segundo nombre,
// o las 2 primeras letras si viene un solo nombre.
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Convierte un string a "Nombre Propio": preserva tildes y ñ, y solo corrige
// mayúsculas y minúsculas. Capitaliza después de espacio, guion ("Ana-María")
// y apóstrofe ("D'Angelo"). `normalizeName` de importWorkers.js, en cambio,
// quita las tildes.
export function toProperName(input) {
  if (!input) return "";
  const collapsed = String(input).trim().replace(/\s+/g, " ").toLowerCase();
  if (!collapsed) return "";
  return collapsed
    .split(" ")
    .map((word, idx) => {
      if (idx > 0 && CONNECTORS.has(word)) return word;
      return word.replace(/(^|[\-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    })
    .join(" ");
}
