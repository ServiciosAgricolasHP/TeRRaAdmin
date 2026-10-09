// Búsqueda "like" para buscadores de texto libre (sobre todo nombres): cada
// palabra escrita tiene que aparecer en el texto, en cualquier orden y sin
// importar tildes. "juan perez" encuentra a "Juan Ignacio Pérez".
export function normalizeSearchText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function matchesSearchQuery(text, query) {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const n = normalizeSearchText(text);
  return terms.every((t) => n.includes(t));
}
