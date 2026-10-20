// Códigos QR de la cosecha: el prefijo y el número de un código, quién lo
// tiene y qué códigos de un prefijo quedan libres.

// El prefijo de un código es lo que va antes del primer guion (`XX-0123` →
// `XX`), la misma convención que usa la app de escaneo para saber a qué faena
// pertenece el pesaje.
export const prefixOfCode = (code) => {
  const raw = String(code || "").trim().toUpperCase();
  const cut = raw.indexOf("-");
  return cut > 0 ? raw.slice(0, cut) : "";
};

// Una persona lleva **un** QR por cosecha: el prefijo es la cosecha, así que
// darle XX-21 a quien tiene XX-19 le quita el 19, que vuelve al pozo. Esto
// devuelve los códigos que hay que soltar para respetar esa regla.
export const codesToRelease = (codes, incoming) => {
  const pfx = prefixOfCode(incoming);
  if (!pfx) return [];
  return codes.filter((c) => c !== incoming && prefixOfCode(c) === pfx);
};

export const codesOfWorker = (w) => (w?.idQr || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);

// Quién tiene hoy ese código, si alguien lo tiene.
export const ownerOfCode = (workers, code) => {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  return workers.find((w) => codesOfWorker(w).includes(clean)) || null;
};

const numberOfCode = (code) => {
  const m = /^.+-(\d+)$/.exec(String(code || ""));
  return m ? { n: Number(m[1]), pad: m[1].length } : null;
};

// Hasta `max` códigos del prefijo que hoy no tiene nadie. Como no hay catálogo
// de QR impresos, "libre" es un número que falta en la serie asignada, hasta
// el mayor visto entre los asignados y los pesajes (`knownCodes`). `printed`
// marca los que aparecen en pesajes, que existen físicamente. Si no queda
// ningún hueco, sugiere el siguiente al mayor (`outOfRange`), que quizá
// nunca se imprimió.
export function suggestFreeCodes(workers, prefixId, knownCodes, max = 3) {
  if (!prefixId) return [];
  const taken = new Set();
  const pads = new Map();
  let top = 0;
  const countCode = (code) => {
    if (prefixOfCode(code) !== prefixId) return null;
    const parsed = numberOfCode(code);
    if (!parsed) return null;
    pads.set(parsed.pad, (pads.get(parsed.pad) || 0) + 1);
    if (parsed.n > top) top = parsed.n;
    return parsed;
  };
  for (const w of workers) {
    for (const c of codesOfWorker(w)) {
      const parsed = countCode(c);
      if (parsed) taken.add(parsed.n);
    }
  }
  for (const c of knownCodes) countCode(c);

  const pad = [...pads.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 1;
  const fmt = (n) => `${prefixId}-${String(n).padStart(pad, "0")}`;

  const out = [];
  for (let i = 1; i <= top && out.length < max; i++) {
    if (taken.has(i)) continue;
    const code = fmt(i);
    out.push({ code, printed: knownCodes.has(code) });
  }
  if (out.length === 0) out.push({ code: fmt(top + 1), printed: false, outOfRange: true });
  return out;
}
