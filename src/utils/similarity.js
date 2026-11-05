// Similitud de nombres (razón basada en la distancia de Levenshtein).
// Marca posibles trabajadores duplicados, sobre todo con RUT de extranjero, que
// no tiene dígito verificador.

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a, b) {
  const A = normalize(a);
  const B = normalize(b);
  if (!A || !B) return 0;
  const dist = levenshtein(A, B);
  const max = Math.max(A.length, B.length);
  return 1 - dist / max;
}

// Distancia entre dos palabras en la que dos letras vecinas cambiadas de lugar
// ("CLAUIDA") cuentan como un solo error, como cualquier otro tipeo.
function typoDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Palabras de un nombre, sin las de una letra (iniciales).
export const nameTokens = (s) => normalize(s).split(" ").filter((t) => t.length > 1);

// Desde cuánto se parecen dos palabras para contar como la misma (un error
// de tipeo).
export const TOKEN_MATCH = 0.8;

// Parecido de dos palabras, de 0 a 1. Las que difieren en largo más de lo que
// permite `TOKEN_MATCH` dan 0 sin compararlas letra por letra.
export function tokenSimilarity(a, b) {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > max * (1 - TOKEN_MATCH)) return 0;
  return 1 - typoDistance(a, b) / max;
}

// `tokenNameSimilarity` con los nombres ya separados en palabras
// (`nameTokens`), para quien compara un nombre con muchos.
export function tokensSimilarity(A, B) {
  if (!A.length || !B.length) return { score: 0, matched: 0, size: 0 };
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  const used = new Set();
  let matched = 0;
  for (const t of short) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < long.length; i++) {
      if (used.has(i)) continue;
      const s = tokenSimilarity(t, long[i]);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best >= 0 && bestScore >= TOKEN_MATCH) {
      used.add(best);
      matched += 1;
    }
  }
  return { score: matched / short.length, matched, size: short.length };
}

// Parecido de dos nombres palabra por palabra, sin importar el orden: cada
// palabra del más corto busca su par en el otro, y calzan si se parecen en
// 80% o más (un error de tipeo). Da la parte del nombre más corto que calza,
// así "PEREZ SOTO JUAN" y "JUAN CARLOS PEREZ SOTO" dan 1. `matched` dice
// cuántas palabras calzaron y `size`, cuántas tiene el nombre más corto: con
// una sola palabra en común, un nombre de una palabra calzaría con cualquiera
// que la tenga.
export const tokenNameSimilarity = (a, b) => tokensSimilarity(nameTokens(a), nameTokens(b));

export function findSimilarWorkers(name, workers, { threshold = 0.82, limit = 5 } = {}) {
  const target = normalize(name);
  if (!target) return [];
  return workers
    .map((w) => ({ worker: w, score: nameSimilarity(target, w.name) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
