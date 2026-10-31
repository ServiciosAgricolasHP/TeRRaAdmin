import MiniSearch from "minisearch";
import { plainText } from "./helpGuides";

// Buscar en la ayuda escribiendo una pregunta: "cómo agrego a una persona a
// nómina" encuentra las secciones que lo explican aunque usen otras palabras.
// Cada término pasa por `termKeys`: sin mayúsculas ni tildes, sin palabras
// vacías, con la raíz de la palabra (agrego = agregar = agregué) y con los
// sinónimos del negocio llevados a una sola forma.

const STOPWORDS = new Set([
  "a", "al", "algo", "algun", "alguna", "alguno", "como", "con", "cual", "cuando", "de", "del",
  "donde", "e", "el", "ella", "en", "es", "esa", "ese", "eso", "esta", "este", "esto", "hacer",
  "hago", "hay", "la", "las", "le", "les", "lo", "los", "me", "mi", "mis", "muy", "ni", "no",
  "o", "para", "pero", "por", "puedo", "que", "quiero", "se", "si", "sin", "sobre", "su",
  "sus", "te", "tengo", "tu", "un", "una", "uno", "unos", "unas", "y", "ya", "yo",
]);

// De más larga a más corta: se saca la primera que deja una raíz de 3 letras o más.
const SUFFIXES = [
  "aciones", "amiento", "imiento", "acion", "ieron", "ando", "iendo", "aron", "aban", "ados", "adas",
  "idos", "idas", "ado", "ada", "ido", "ida", "ar", "er", "ir", "es", "as", "os", "e", "a", "o", "s",
];

export function normalizeWord(word) {
  return String(word || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// agregué → agregu → agreg, saqué → saqu → sac: igual que agregar y sacar.
const fixQu = (w) => (w.endsWith("gu") ? w.slice(0, -1) : w.endsWith("qu") ? `${w.slice(0, -2)}c` : w);

const cutFirst = (w, suffixes) => {
  const suffix = suffixes.find((x) => w.endsWith(x) && w.length - x.length >= 3);
  return fixQu(suffix ? w.slice(0, -suffix.length) : w);
};

// La raíz corta: saca la terminación verbal o de plural (agregado → agreg).
export function stem(word) {
  return cutFirst(normalizeWord(word), SUFFIXES);
}

// La raíz corta y la larga, que solo saca la vocal o la s final (olvido →
// olvid, donde la corta dejaría olv). Dos palabras calzan si comparten una.
export function stems(word) {
  const w = normalizeWord(word);
  return [...new Set([cutFirst(w, SUFFIXES), cutFirst(w, ["es", "s", "a", "e", "o"])])];
}

// Cada grupo cuenta como su primera palabra. Se agrega un grupo cuando una
// pregunta real no encuentra su sección por usar otra palabra.
const SYNONYM_GROUPS = [
  ["persona", "trabajador", "trabajadora", "alguien", "gente", "empleado", "empleada"],
  ["agregar", "sumar", "anadir", "meter", "incluir"],
  ["sacar", "quitar", "eliminar", "borrar", "remover"],
  ["vuelta", "viaje", "flete"],
  ["anticipo", "adelanto"],
  ["monto", "plata", "valor"],
  ["celda", "casilla", "cuadro"],
];
const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) {
  const canonical = stem(group[0]);
  for (const w of group) SYNONYMS.set(stem(w), canonical);
}

// Las formas con que se indexa y se busca un término, o null si no cuenta.
export function termKeys(term) {
  const w = normalizeWord(term);
  if (!w || STOPWORDS.has(w)) return null;
  return [...new Set(stems(w).map((s) => SYNONYMS.get(s) || s))];
}

// Una entrada por sección: título, preguntas de ejemplo y texto.
export function helpDocuments(guides) {
  const docs = [];
  for (const g of guides) {
    for (const s of g.sections) {
      docs.push({
        id: `${g.id}#${s.id}`,
        guideId: g.id,
        sectionId: s.id,
        guideTitle: g.title,
        title: s.title,
        questions: s.questions.join(" · "),
        text: plainText(s.body),
        adminOnly: !!g.adminOnly,
      });
    }
  }
  return docs;
}

export function buildHelpIndex(guides) {
  const index = new MiniSearch({
    fields: ["title", "questions", "text", "guideTitle"],
    storeFields: ["guideId", "sectionId", "guideTitle", "title", "text", "adminOnly"],
    processTerm: termKeys,
  });
  index.addAll(helpDocuments(guides));
  return index;
}

// Las mejores secciones para la pregunta. Lo que queda muy por debajo de la
// primera no se muestra: con OR, una sola palabra en común alcanza para salir.
export function searchHelp(index, query, { limit = 5, isAdmin = false } = {}) {
  if (!String(query || "").trim()) return [];
  const results = index.search(query, {
    boost: { questions: 4, title: 3, guideTitle: 1.5, text: 1 },
    // Tolera errores de tipeo ("nomna", "agrgar") en las palabras de 4 letras o más.
    fuzzy: (term) => (term.length >= 7 ? 2 : term.length >= 4 ? 1 : 0),
    prefix: (term) => term.length > 2,
    combineWith: "OR",
  });
  const visible = results.filter((r) => isAdmin || !r.adminOnly);
  if (visible.length === 0) return [];
  const best = visible[0].score;
  return visible.filter((r) => r.score >= best * 0.3).slice(0, limit);
}

// El extracto de una sección: la frase con más términos de la pregunta,
// partida en trozos marcados (`hit`) para dibujarla sin HTML.
export function snippetOf(text, query, maxLength = 160) {
  const keys = new Set(String(query || "").split(/[^\p{L}\p{N}]+/u).flatMap((w) => termKeys(w) || []));
  const isHit = (word) => (termKeys(word) || []).some((k) => keys.has(k));
  const sentences = String(text || "").split(/(?<=[.!?:])\s+/);
  let best = sentences[0] || "";
  let bestHits = -1;
  for (const s of sentences) {
    const hits = s.split(/[^\p{L}\p{N}]+/u).filter(isHit).length;
    if (hits > bestHits) { best = s; bestHits = hits; }
  }
  const cut = best.length > maxLength ? `${best.slice(0, maxLength).replace(/\s+\S*$/, "")}…` : best;
  return cut.split(/([\p{L}\p{N}]+)/u).filter(Boolean).map((part) => ({ text: part, hit: isHit(part) }));
}
