// Billetes y monedas para pagar una nómina en efectivo.

// Billetes y monedas chilenos, de mayor a menor.
export const CASH_DENOMINATIONS = [
  { value: 20000, kind: "bill" },
  { value: 10000, kind: "bill" },
  { value: 5000, kind: "bill" },
  { value: 2000, kind: "bill" },
  { value: 1000, kind: "bill" },
  { value: 500, kind: "coin" },
  { value: 100, kind: "coin" },
  { value: 50, kind: "coin" },
  { value: 10, kind: "coin" },
];

// Los que se tienen a mano por defecto.
export const DEFAULT_AVAILABLE = [10000, 5000, 1000, 500, 100];

export const isBill = (value) => CASH_DENOMINATIONS.find((d) => d.value === value)?.kind === "bill";

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Para cada item de efectivo, el menor monto que lo cubre y que se puede armar
// con los billetes y monedas disponibles (`available`), con la menor cantidad
// de piezas. Si el monto no calza justo, se redondea hacia arriba.
//
// Devuelve `{ totalNeeded, totalOriginal, counts, perWorker }`: `counts` es
// Map(denominación → cantidad total), con todas las disponibles de mayor a
// menor (las que no se usan, en 0), y `perWorker` trae el monto original, el
// redondeado y el desglose de cada persona. Sin nada disponible no arma nada.
export function estimateCashBreakdown(cashItems = [], available = DEFAULT_AVAILABLE) {
  const dens = [...new Set((available || []).map(Number).filter((d) => d > 0))].sort((a, b) => b - a);
  const counts = new Map(dens.map((d) => [d, 0]));
  const perWorker = [];
  let totalNeeded = 0;
  let totalOriginal = 0;
  if (dens.length === 0) return { totalNeeded, totalOriginal, counts, perWorker };

  // Se cuenta en unidades del máximo común divisor, así el arreglo es corto.
  // `pieces[i]` es la menor cantidad de piezas que suman i unidades y
  // `last[i]`, la última pieza de esa suma. Cada intervalo de largo igual a la
  // pieza más grande contiene un múltiplo suyo, así que el arreglo alcanza
  // para encontrar un monto armable sobre cada objetivo.
  const unit = dens.reduce(gcd);
  const steps = dens.map((d) => d / unit);
  const targets = cashItems.map((it) => Math.ceil(Math.max(0, Number(it.amount) || 0) / unit));
  const size = Math.max(0, ...targets) + steps[0] + 1;
  const pieces = new Array(size).fill(Infinity);
  const last = new Array(size).fill(0);
  pieces[0] = 0;
  for (let i = 1; i < size; i++) {
    for (const s of steps) {
      if (s <= i && pieces[i - s] + 1 < pieces[i]) {
        pieces[i] = pieces[i - s] + 1;
        last[i] = s;
      }
    }
  }

  cashItems.forEach((it, idx) => {
    const original = Number(it.amount) || 0;
    let i = targets[idx];
    while (pieces[i] === Infinity) i += 1;
    const breakdown = {};
    for (let j = i; j > 0; j -= last[j]) {
      const d = last[j] * unit;
      breakdown[d] = (breakdown[d] || 0) + 1;
      counts.set(d, counts.get(d) + 1);
    }
    const rounded = i * unit;
    perWorker.push({ rut: it.rut, name: it.name, leader: it.groupLeader, original, rounded, delta: rounded - original, breakdown });
    totalNeeded += rounded;
    totalOriginal += original;
  });
  return { totalNeeded, totalOriginal, counts, perWorker };
}
