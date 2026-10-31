// Mayúsculas y minúsculas de lo que se escribe a mano.
//
// - Los nombres de registros (faena, labor, transportista, quincena…) van como
//   título: `toTitleName`. Las siglas (KWS, HP) quedan en mayúsculas.
// - Las notas libres solo se corrigen si vienen enteras en mayúsculas
//   (`unshout`): si el texto tiene alguna minúscula, quien lo escribió eligió
//   sus mayúsculas y se respeta.
//
// Los nombres de personas usan `toProperName` (utils/nameUtils.js), que deja
// los artículos en minúscula en cualquier posición ("María de los Ángeles").

// Siempre en minúscula fuera de la primera palabra.
const LINKS = new Set(["de", "del", "y", "e", "o", "u", "a", "en", "con", "por", "para"]);
// En minúscula solo justo después de "de"/"del" ("Quincena de la Cosecha");
// en otra posición son parte del nombre ("Fundo Los Robles").
const ARTICLES = new Set(["el", "la", "las", "los"]);
// Abreviaturas sin vocales que no son siglas: van con mayúscula inicial ("Km 12").
const ABBREVIATIONS = new Set(["kg", "km", "gr", "grs", "mt", "mts", "cm", "mm", "lt", "lts", "hr", "hrs", "sr", "sres", "dr"]);
const VOWEL = /[aeiouyáéíóúü]/u;

// Una parte de una palabra (lo que hay entre guiones, apóstrofos, barras y
// paréntesis) con mayúscula inicial. Si tiene dos letras o más:
// - escrita entera en mayúsculas, se deja así cuando `keepUpper`;
// - sin vocales es una sigla ("kws" → "KWS"), salvo las ABBREVIATIONS.
function titlePart(part, keepUpper) {
  const letters = (part.match(/\p{L}/gu) || []).join("").toLowerCase();
  if (letters.length >= 2) {
    if (keepUpper && part === part.toUpperCase()) return part;
    if (!VOWEL.test(letters) && !ABBREVIATIONS.has(letters)) return part.toUpperCase();
  }
  return part.toLowerCase().replace(/^\p{L}/u, (ch) => ch.toUpperCase());
}

const capitalize = (word, keepUpper) =>
  word
    .split(/([-'/(])/)
    .map((part) => titlePart(part, keepUpper))
    .join("");

// Nombre de un registro como título: cada palabra con mayúscula inicial,
// salvo los conectores (ver LINKS y ARTICLES), y las siglas en mayúsculas.
// Si el nombre tiene alguna minúscula, una palabra escrita entera en
// mayúsculas es una sigla elegida por quien la escribió ("Ensayo INIA") y se
// respeta; un nombre entero en mayúsculas solo reconoce las siglas sin
// vocales. Junta los espacios repetidos.
export function toTitleName(input) {
  if (input == null) return input;
  const words = String(input).trim().replace(/\s+/g, " ").split(" ");
  if (words.length === 1 && words[0] === "") return "";
  const hasLower = words.some((w) => w !== w.toUpperCase());
  const lower = words.map((w) => w.toLowerCase());
  return words
    .map((word, i) => {
      const w = lower[i];
      const connector = LINKS.has(w) || ARTICLES.has(w);
      if (i > 0 && LINKS.has(w)) return w;
      if (i > 0 && ARTICLES.has(w) && (lower[i - 1] === "de" || lower[i - 1] === "del")) return w;
      return capitalize(word, hasLower && !connector);
    })
    .join(" ");
}

// Texto entero en mayúsculas → formato de oración: todo en minúscula, salvo la
// primera letra y la que sigue a un punto, signo de exclamación o de
// interrogación. Con menos de dos letras no hace nada ("A", "1-B"), y tampoco
// si el texto tiene alguna minúscula.
export function unshout(text) {
  if (text == null) return text;
  const s = String(text);
  const letters = s.match(/\p{L}/gu) || [];
  if (letters.length < 2) return s;
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^\s*|[.!?¡¿]\s*)(\p{L})/gu, (_, before, ch) => before + ch.toUpperCase());
}
