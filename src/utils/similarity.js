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

const HISTOGRAM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";

// Cuántas veces está cada letra en un nombre ya normalizado.
function histogramOf(s) {
  const counts = new Array(HISTOGRAM_CHARS.length).fill(0);
  for (const ch of s) {
    const i = HISTOGRAM_CHARS.indexOf(ch);
    if (i >= 0) counts[i] += 1;
  }
  return counts;
}

// Los pares de nombres de la lista que se parecen en `threshold` o más, como
// `nameSimilarity`: `[[i, j, score]]`, con i < j. Normaliza cada nombre una
// vez y descarta sin calcular la distancia los pares cuyo largo o cuyas letras
// ya no dan para el parecido pedido: la distancia es al menos la mitad de las
// letras que no tienen par.
export function similarNamePairs(names, threshold) {
  const list = names.map((n) => {
    const s = normalize(n);
    return { s, hist: histogramOf(s) };
  });
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (!a.s) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      if (!b.s) continue;
      const max = Math.max(a.s.length, b.s.length);
      const allowed = (1 - threshold) * max;
      if (Math.abs(a.s.length - b.s.length) > allowed) continue;
      let unmatched = 0;
      for (let k = 0; k < a.hist.length; k += 1) unmatched += Math.abs(a.hist[k] - b.hist[k]);
      if (unmatched / 2 > allowed) continue;
      const score = 1 - levenshtein(a.s, b.s) / max;
      if (score >= threshold) pairs.push([i, j, score]);
    }
  }
  return pairs;
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

// Busca fichas por nombre sin comparar cada nombre con todas: indexa las
// palabras de los nombres de las fichas y compara a fondo solo las fichas con
// dos o más palabras parecidas a las del nombre buscado. Calzan las que
// comparten dos tercios del nombre más corto y al menos dos palabras.
export function nameSearchOf(workers) {
  const tokens = workers.map((w) => nameTokens(w.name));
  const byToken = new Map();
  tokens.forEach((ts, i) => {
    for (const t of new Set(ts)) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(i);
    }
  });
  const vocabulary = [...byToken.keys()];
  const similar = new Map();
  const similarTo = (t) => {
    if (!similar.has(t)) similar.set(t, vocabulary.filter((v) => tokenSimilarity(t, v) >= TOKEN_MATCH));
    return similar.get(t);
  };
  return (name) => {
    const own = nameTokens(name);
    const hits = new Map();
    own.forEach((t, k) => {
      for (const v of similarTo(t)) {
        for (const i of byToken.get(v)) {
          if (!hits.has(i)) hits.set(i, new Set());
          hits.get(i).add(k);
        }
      }
    });
    const out = [];
    for (const [i, words] of hits) {
      if (words.size < 2) continue;
      const { score, matched } = tokensSimilarity(own, tokens[i]);
      if (matched >= 2 && score >= 0.66) out.push({ worker: workers[i], score });
    }
    return out.sort((a, b) => b.score - a.score);
  };
}
