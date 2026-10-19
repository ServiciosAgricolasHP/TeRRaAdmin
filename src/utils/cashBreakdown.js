// Billetes y monedas para pagar una nómina en efectivo.
import { fmtCurrency } from "./format";

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

// Las personas del desglose (`perWorker` va en el orden de `allItems`),
// agrupadas: primero las de esta nómina por líder y después las de cada
// nómina con efectivo pendiente.
export function cashWorkerGroupsOf(est, allItems) {
  const groups = new Map();
  est.perWorker.forEach((w, i) => {
    const from = allItems[i]?.pendingFrom || "";
    const key = from ? `pending:${from}` : `own:${w.leader || ""}`;
    if (!groups.has(key)) {
      groups.set(key, { key, label: from ? `Pendiente de ${from}` : w.leader || "Sin grupo", pending: !!from, rows: [] });
    }
    groups.get(key).rows.push(w);
  });
  const list = [...groups.values()];
  for (const g of list) g.rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
  return list.sort((a, b) => Number(a.pending) - Number(b.pending) || a.label.localeCompare(b.label, "es"));
}

// "3 × $10.000 + 1 × $5.000", de mayor a menor.
export function cashPiecesText(breakdown, denominations) {
  return denominations.filter((d) => breakdown[d]).map((d) => `${breakdown[d]} × ${fmtCurrency(d)}`).join(" + ");
}

// Desglose principal en texto plano, para pegar en un chat o una nota.
// padStart alinea las cantidades en monospace.
export function cashSummaryText({ payrollName, allItems, est, usePending, ownTotal, extraTotal, pendingNote, diff, denominations, totalPieces }) {
  const lines = [];
  lines.push(`💵 Estimación de efectivo — ${payrollName}`);
  lines.push(`${allItems.length} trabajador(es) · Total: ${fmtCurrency(est.totalNeeded)}`);
  if (usePending) {
    lines.push(`Esta nómina: ${fmtCurrency(ownTotal)} · Pendiente de otras nóminas: ${fmtCurrency(extraTotal)}`);
    lines.push(pendingNote);
  }
  if (diff > 0) {
    lines.push(`(Original ${fmtCurrency(est.totalOriginal)} + redondeo ${fmtCurrency(diff)})`);
  }
  lines.push("");
  lines.push("Billetes y monedas:");
  for (const d of denominations) {
    const n = est.counts.get(d) || 0;
    if (n === 0) continue;
    const denomStr = fmtCurrency(d).padStart(9, " ");
    const qtyStr = String(n).padStart(4, " ");
    const subStr = fmtCurrency(n * d).padStart(11, " ");
    lines.push(`  ${denomStr} ${isBill(d) ? "billete" : " moneda"} × ${qtyStr} = ${subStr}`);
  }
  lines.push("");
  lines.push(`Total: ${totalPieces} billetes/monedas · ${fmtCurrency(est.totalNeeded)}`);
  return lines.join("\n");
}

// La lista por trabajador en texto plano: cuánto recibe cada uno y con qué
// billetes y monedas, por grupo.
export function cashListText({ payrollName, usePending, pendingNote, workerGroups, est, denominations }) {
  const piecesText = (breakdown) => cashPiecesText(breakdown, denominations);
  const lines = [`💵 Efectivo por trabajador — ${payrollName}`];
  if (usePending) lines.push(pendingNote);
  for (const g of workerGroups) {
    lines.push("", g.label);
    for (const w of g.rows) {
      const amount = w.delta > 0 ? `${fmtCurrency(w.rounded)} (de ${fmtCurrency(w.original)})` : fmtCurrency(w.rounded);
      lines.push(`  ${w.name}: ${amount} → ${piecesText(w.breakdown) || "sin efectivo"}`);
    }
  }
  lines.push("", `Total: ${est.perWorker.length} trabajador(es) · ${fmtCurrency(est.totalNeeded)}`);
  lines.push(`Billetes y monedas: ${piecesText(Object.fromEntries(est.counts))}`);
  return lines.join("\n");
}
