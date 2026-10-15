// Mayúsculas y minúsculas de lo que se escribe a mano.
//
// - Los nombres de registros (faena, labor, transportista, quincena…) van como
//   título: `toTitleName`.
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

const capitalize = (word) =>
  word.replace(/(^|[-'/(])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

// Nombre de un registro como título: cada palabra con mayúscula inicial,
// salvo los conectores (ver LINKS y ARTICLES). Junta los espacios repetidos.
export function toTitleName(input) {
  if (input == null) return input;
  const words = String(input).trim().replace(/\s+/g, " ").toLowerCase().split(" ");
  if (words.length === 1 && words[0] === "") return "";
  return words
    .map((w, i) => {
      if (i === 0) return capitalize(w);
      if (LINKS.has(w)) return w;
      if (ARTICLES.has(w) && (words[i - 1] === "de" || words[i - 1] === "del")) return w;
      return capitalize(w);
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
