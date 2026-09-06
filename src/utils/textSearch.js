// Búsqueda "like" para buscadores de texto libre (nombres, principalmente).
// Cada palabra escrita tiene que aparecer en algún lado del texto, en
// cualquier orden y sin importar acentos — así "bruno silva" encuentra a
// "Bruno Ignacio Silva" aunque "silva" no venga pegado a "bruno".
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
