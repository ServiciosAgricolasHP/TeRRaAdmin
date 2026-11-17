// Revisiones de los montos de la nómina. Cada una devuelve
// `[{ person, severity, lines }]`.
import { fmtCurrency } from "../format";
import { SEVERITY, listText } from "./checkContext";

// El líquido sobre esta proporción de su promedio en las últimas nóminas.
export const AMOUNT_FACTOR = 2;
// Cuántas nóminas anteriores entran al promedio.
export const AMOUNT_HISTORY = 3;
// Lo mínimo que tiene que subir sobre el promedio para marcarse: entre montos
// chicos, el doble es poca plata.
export const AMOUNT_MIN_JUMP = 30000;

const num = (v) => Math.round(Number(v) || 0);

// El líquido muy sobre lo que cobró en sus últimas nóminas.
export function unusualAmount(ctx) {
  const found = [];
  for (const r of ctx.rows) {
    const past = ctx
      .historyOf(r.person)
      .slice(0, AMOUNT_HISTORY)
      .map(({ item }) => num(item.amount))
      .filter((v) => v > 0);
    if (!past.length) continue;
    const avg = Math.round(past.reduce((s, v) => s + v, 0) / past.length);
    const now = num(r.item.amount);
    if (now <= AMOUNT_FACTOR * avg || now - avg < AMOUNT_MIN_JUMP) continue;
    const span = past.length === 1 ? "su última nómina" : `sus últimas ${past.length} nóminas`;
    found.push({ person: r.person, severity: SEVERITY.orange, lines: [`Líquido ${fmtCurrency(now)}; su promedio en ${span} es ${fmtCurrency(avg)}`] });
  }
  return found;
}

// Tiene bruto y los anticipos se lo llevan todo.
export function zeroByAdvances(ctx) {
  const found = [];
  for (const r of ctx.rows) {
    const gross = num(r.item.grossAmount);
    const advance = num(r.item.advance);
    if (gross <= 0 || advance <= 0 || num(r.item.amount) > 0) continue;
    found.push({
      person: r.person,
      severity: SEVERITY.info,
      lines: [`Bruto ${fmtCurrency(gross)} y los anticipos descuentan ${fmtCurrency(advance)}: queda en $0`],
    });
  }
  return found;
}

// Le quedan jornadas con monto sin nómina en los ciclos abiertos: esta nómina
// le paga solo una parte.
export function pendingElsewhere(ctx) {
  const found = [];
  for (const r of ctx.rows) {
    const byCycle = new Map();
    for (const f of ctx.factsByPerson.get(r.person) || []) {
      if (f.own || f.wd.payrollId || f.pay <= 0) continue;
      const k = f.wd.cycleId;
      if (!byCycle.has(k)) byCycle.set(k, { label: f.cycle?.label || "otro ciclo", amount: 0, dates: new Set() });
      const e = byCycle.get(k);
      e.amount += f.pay;
      e.dates.add(f.wd.date);
    }
    if (!byCycle.size) continue;
    const parts = [...byCycle.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((e) => `${fmtCurrency(e.amount)} en ${e.label} (${e.dates.size === 1 ? "1 día" : `${e.dates.size} días`})`);
    found.push({ person: r.person, severity: SEVERITY.info, lines: [`Le quedan pendientes ${listText(parts)}`] });
  }
  return found;
}
