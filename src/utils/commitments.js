// Cheques y pagos: tipos, vencimientos, cuotas y el import de la planilla de
// control de cheques. Las fechas son etiquetas `YYYY-MM-DD` y se calculan con
// enteros, nunca con `Date` local: una zona horaria correría el vencimiento
// al día de al lado.
import { BANKS } from "./banks";
import { toTitleName, unshout } from "./textCase";

export const COMMITMENT_KINDS = {
  chequeIssued: { label: "Cheque emitido", icon: "📤", direction: "out" },
  chequeReceived: { label: "Cheque recibido", icon: "📥", direction: "in" },
  payment: { label: "Pago comprometido", icon: "📌", direction: "out" },
  installment: { label: "Cuota de crédito", icon: "🏦", direction: "out" },
  personalDebt: { label: "Deuda personal", icon: "🤝", direction: "out" },
};

export const kindMeta = (kind) => COMMITMENT_KINDS[kind] || COMMITMENT_KINDS.payment;
export const isCheque = (kind) => kind === "chequeIssued" || kind === "chequeReceived";
export const directionOf = (kind) => kindMeta(kind).direction;

// "Vencido" no se guarda: es un pendiente con la fecha ya pasada. Aplazado y
// protestado siguen siendo deuda, pero sin fecha: no se avisan por correo.
export const STATUS_LABELS = {
  pending: "Pendiente",
  overdue: "Vencido",
  postponed: "Aplazado",
  protested: "Protestado",
  paid: "Pagado",
  cancelled: "Anulado",
};

// Deuda abierta: lo que todavía no se paga ni se anula.
const OPEN_STATUSES = new Set(["pending", "postponed", "protested"]);
export const isOpen = (c) => OPEN_STATUSES.has(c?.status || "pending");

// Abonos: pagos parciales de un vencimiento (hoy, de una deuda personal).
// `amount` sigue siendo el monto original; lo que falta pagar de algo abierto
// es ese monto menos lo abonado.
export const partialPaidOf = (c) => (c?.partialPayments || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
export const remainingOf = (c) => (isOpen(c) ? Math.max(0, (Number(c.amount) || 0) - partialPaidOf(c)) : 0);

// Un cheque se cobra; lo demás se paga.
export const paidLabel = (kind) => (isCheque(kind) ? "Cobrado" : "Pagado");

export function statusLabel(c, today) {
  const s = displayStatus(c, today);
  return s === "paid" ? paidLabel(c.kind) : STATUS_LABELS[s] || s;
}

// Días que se mantienen generados por delante en un pago recurrente.
export const RECURRING_HORIZON_DAYS = 60;

const pad = (n) => String(n).padStart(2, "0");

function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000;
}

function isoFromDayNumber(n) {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Días desde `today` hasta `dueDate` (negativo si ya pasó). `null` si alguna
// fecha no es válida.
export function daysUntil(dueDate, today) {
  const d = dayNumber(dueDate) - dayNumber(today);
  return Number.isNaN(d) ? null : d;
}

export function addDays(iso, days) {
  const n = dayNumber(iso);
  return Number.isNaN(n) ? "" : isoFromDayNumber(n + days);
}

export function displayStatus(c, today) {
  const status = c?.status || "pending";
  if (status === "pending" && daysUntil(c.dueDate, today) < 0) return "overdue";
  return status;
}

// Se aplaza lo que ya venció (o vence hoy) y no tiene fecha de pago.
export const canPostpone = (c, today) => (c?.status || "pending") === "pending" && daysUntil(c.dueDate, today) <= 0;

// Un cheque se protesta cuando el banco lo rechaza, aunque ya se haya marcado
// cobrado.
export const canProtest = (c) => isCheque(c?.kind) && ["pending", "paid"].includes(c?.status || "pending");

export function urgencyLabel(days) {
  if (days == null) return "";
  if (days < -1) return `Vencido hace ${-days} días`;
  if (days === -1) return "Venció ayer";
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `En ${days} días`;
}

// La fecha `offset` meses después de `startIso`, en el día `dayOfMonth`
// recortado al largo del mes (el 31 cae el 28 o 29 en febrero).
export function monthlyDate(startIso, offset, dayOfMonth) {
  const [y, m] = String(startIso).split("-").map(Number);
  const idx = m - 1 + offset;
  const yy = y + Math.floor(idx / 12);
  const mm = (((idx % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${pad(mm)}-${pad(Math.min(dayOfMonth, last))}`;
}

const dayOf = (iso) => Number(String(iso).slice(8, 10));

// Las cuotas de un crédito: una por mes desde `firstDate`, el mismo día.
export function buildInstallments({ firstDate, count }) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (Number.isNaN(dayNumber(firstDate))) return [];
  const day = dayOf(firstDate);
  return Array.from({ length: n }, (_, i) => ({ n: i + 1, of: n, dueDate: monthlyDate(firstDate, i, day) }));
}

// La misma fecha `months` meses después (o antes), con el día recortado al
// largo del mes.
export const shiftMonths = (iso, months) => (Number.isNaN(dayNumber(iso)) ? "" : monthlyDate(iso, months, dayOf(iso)));

// La fecha en otro día del mismo mes, recortado al largo del mes.
export const withDayOfMonth = (iso, day) => (Number.isNaN(dayNumber(iso)) ? "" : monthlyDate(iso, 0, day));

// Los vencimientos mensuales de una serie que caen después de `after` (o desde
// `firstDate` si es vacío) y hasta `until`, ambos `YYYY-MM-DD`. El día del mes
// es el de `firstDate`, salvo que la serie traiga `dayOfMonth` (se cambió
// después de crearla).
export function recurringDates({ firstDate, after = "", until, dayOfMonth = null }) {
  if (Number.isNaN(dayNumber(firstDate)) || Number.isNaN(dayNumber(until))) return [];
  const day = Number(dayOfMonth) || dayOf(firstDate);
  const out = [];
  for (let i = 0; i < 600; i++) {
    const d = monthlyDate(firstDate, i, day);
    if (d > until) break;
    if (!after || d > after) out.push(d);
  }
  return out;
}

// Hasta dónde llega el grupo "Próximo mes": el mismo día del mes siguiente.
export const upcomingMonthEnd = (today) => shiftMonths(today, 1);

// Vista "Próximos": lo vencido, los cheques protestados, lo que vence en los
// próximos 7 días, lo que vence de ahí hasta el mismo día del mes siguiente
// (`month`) y lo que vence más adelante. Lo aplazado va al principio de los
// próximos 7 días, rotulado "ya vencido": se sigue debiendo y no tiene fecha,
// así que se muestra con lo que viene.
export function groupUpcoming(items, today) {
  const groups = { overdue: [], protested: [], week: [], month: [], later: [] };
  const monthEnd = upcomingMonthEnd(today);
  const open = items.filter(isOpen).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  groups.week.push(...open.filter((c) => c.status === "postponed"));
  for (const c of open) {
    if (c.status === "postponed") continue;
    if (c.status === "protested") {
      groups.protested.push(c);
      continue;
    }
    const days = daysUntil(c.dueDate, today);
    groups[days < 0 ? "overdue" : days <= 7 ? "week" : c.dueDate <= monthEnd ? "month" : "later"].push(c);
  }
  return groups;
}

// Resumen por sentido de la plata: lo que se paga (`out`) y lo que se cobra
// (`in`, cheques recibidos) no se suman entre sí.
export function summarize(commitments, today) {
  const blank = () => ({ amount: 0, count: 0 });
  const acc = {
    out: { pending: blank(), overdue: blank(), next7: blank(), postponed: blank(), protested: blank() },
    in: { pending: blank(), overdue: blank(), next7: blank(), postponed: blank(), protested: blank() },
    paidThisMonth: blank(),
    cancelled: blank(),
  };
  const month = String(today).slice(0, 7);
  const add = (slot, amount) => {
    slot.amount += Number(amount) || 0;
    slot.count += 1;
  };
  for (const c of commitments) {
    const status = displayStatus(c, today);
    const dir = acc[directionOf(c.kind)];
    if (status === "pending" || status === "overdue") {
      add(dir[status], remainingOf(c));
      const days = daysUntil(c.dueDate, today);
      if (days != null && days >= 0 && days <= 7) add(dir.next7, remainingOf(c));
    } else if (status === "postponed" || status === "protested") {
      add(dir[status], remainingOf(c));
    } else if (status === "paid") {
      if (String(c.paidAt || "").slice(0, 7) === month) add(acc.paidThisMonth, paidTotalOf(c));
    } else if (status === "cancelled") {
      add(acc.cancelled, c.amount);
    }
  }
  return acc;
}

// ── Informe de pagos ────────────────────────────────────────────────────────

// `amount` es el monto original. `extra` es lo que se pagó por sobre él
// (interés por atraso u otro recargo) y solo cuenta en lo ya pagado.
export const extraOf = (c) => (c?.status === "paid" ? Math.max(0, Number(c.extra) || 0) : 0);
export const paidTotalOf = (c) => (Number(c?.amount) || 0) + extraOf(c);

const isRecurring = (c) => !!c.seriesId && !c.installment?.of;

// Situación de una deuda abierta: con fecha (`scheduled`), vencida, protestada
// o aplazada. Las dos últimas no tienen fecha de pago.
export function debtState(c, today) {
  if (c.status === "postponed" || c.status === "protested") return c.status;
  return daysUntil(c.dueDate, today) < 0 ? "overdue" : "scheduled";
}

// Una deuda es un crédito (su serie) o, si el vencimiento está suelto, todo lo
// de la misma contraparte.
export function debtKey(c) {
  return c.seriesId ? `s:${c.seriesId}` : `c:${fold(c.counterparty)}`;
}

const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
const blankSum = () => ({ count: 0, amount: 0, extra: 0, total: 0 });
// Lo abierto suma lo que falta pagar (descontados los abonos); lo pagado, su
// monto original más el interés.
function addTo(sum, c) {
  const base = isOpen(c) ? remainingOf(c) : Number(c.amount) || 0;
  sum.count += 1;
  sum.amount += base;
  sum.extra += extraOf(c);
  sum.total += base + extraOf(c);
}

// Filas de "Pagos por mes" que no son un mes: lo vencido y lo protestado van
// primero; lo aplazado, que no tiene fecha, al final.
const MONTH_RANK = { overdue: 0, protested: 1, postponed: 3 };
const monthRank = (key) => MONTH_RANK[key] ?? 2;

// Lo que se paga (sin cheques recibidos ni anulados): lo que se debe, el
// balance de cada deuda con la fecha en que queda pagada, lo que vence cada
// mes con el saldo que queda después, y, si se pide, lo pagado en un rango
// (por fecha de pago). Una deuda queda pagada con su último vencimiento, aunque
// tenga pagos atrasados (vencidos, aplazados o protestados, que van con su
// fecha original); `behind` dice cuántos son. Los pagos recurrentes no terminan
// y no tienen `payoffDate`.
export function buildPaymentReport(items, { today, includePaid = false, paidFrom = "", paidTo = "" } = {}) {
  const out = items.filter((c) => directionOf(c.kind) === "out");
  const pending = out.filter(isOpen).sort(byDue);
  const paidAll = out.filter((c) => c.status === "paid");

  const groups = new Map();
  const groupOf = (c) => {
    const key = debtKey(c);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        // Tipo de la deuda; vacío si junta vencimientos de tipos distintos.
        kind: c.kind,
        counterparty: c.counterparty || "",
        concept: c.concept || "",
        recurring: isRecurring(c),
        installments: c.installment?.of || null,
        pending: blankSum(),
        overdue: blankSum(),
        postponed: blankSum(),
        protested: blankSum(),
        behind: blankSum(),
        paid: blankSum(),
        nextDue: "",
        payoffDate: "",
      });
    }
    return groups.get(key);
  };
  for (const c of pending) {
    const g = groupOf(c);
    if (g.kind !== c.kind) g.kind = "";
    const state = debtState(c, today);
    addTo(g.pending, c);
    if (state !== "scheduled") {
      addTo(g[state], c);
      addTo(g.behind, c);
    }
    if ((state === "scheduled" || state === "overdue") && (!g.nextDue || c.dueDate < g.nextDue)) g.nextDue = c.dueDate;
    if (!g.recurring && c.dueDate > g.payoffDate) g.payoffDate = c.dueDate;
  }
  for (const c of paidAll) {
    const key = debtKey(c);
    if (groups.has(key)) addTo(groups.get(key).paid, c);
  }
  // Una deuda sin fecha va primero si tiene algo protestado y al final si
  // solo está aplazada.
  const sortKey = (d) => d.nextDue || (d.protested.count ? "" : "9999");
  const debts = [...groups.values()].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

  const totals = { pending: blankSum(), overdue: blankSum(), postponed: blankSum(), protested: blankSum(), behind: blankSum(), paid: blankSum() };
  const months = new Map();
  for (const c of pending) {
    const state = debtState(c, today);
    addTo(totals.pending, c);
    if (state !== "scheduled") {
      addTo(totals[state], c);
      addTo(totals.behind, c);
    }
    const key = state === "scheduled" ? c.dueDate.slice(0, 7) : state;
    if (!months.has(key)) months.set(key, { month: key, ...blankSum() });
    addTo(months.get(key), c);
  }
  let remaining = totals.pending.total;
  const monthRows = [...months.values()]
    .sort((a, b) => monthRank(a.month) - monthRank(b.month) || (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    .map((m) => {
      remaining -= m.total;
      return { ...m, remainingAfter: remaining };
    });

  const paidDate = (c) => c.paidAt || c.dueDate;
  const paid = includePaid
    ? paidAll
        .filter((c) => (!paidFrom || paidDate(c) >= paidFrom) && (!paidTo || paidDate(c) <= paidTo))
        .sort((a, b) => (paidDate(a) < paidDate(b) ? -1 : paidDate(a) > paidDate(b) ? 1 : 0))
    : [];
  for (const c of paid) addTo(totals.paid, c);

  const payoffDate = debts.reduce((max, d) => (d.payoffDate > max ? d.payoffDate : max), "");
  return {
    pending,
    paid,
    debts,
    months: monthRows,
    totals,
    payoffDate,
    hasRecurring: debts.some((d) => d.recurring),
    hasExtra: paid.some((c) => extraOf(c) > 0),
  };
}

// ── Abonos y ajuste de series ───────────────────────────────────────────────

const byDueThenN = (a, b) =>
  a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : (a.installment?.n || 0) - (b.installment?.n || 0);

// Reparte un abono a toda la deuda entre sus vencimientos abiertos, del más
// antiguo al más nuevo: cada uno recibe hasta lo que le falta. `closes` marca
// los que quedan pagados; lo que no cabe queda en `leftover`.
export function allocatePartialPayment(items, amount) {
  let left = Math.round(Number(amount) || 0);
  const parts = [];
  for (const c of items.filter(isOpen).sort(byDueThenN)) {
    if (left <= 0) break;
    const due = remainingOf(c);
    if (due <= 0) continue;
    const take = Math.min(due, left);
    parts.push({ id: c.id, amount: take, closes: take === due });
    left -= take;
  }
  return { parts, leftover: left };
}

// Filas del editor de una serie, en orden de vencimiento. Solo lo abierto se
// ajusta: lo pagado o anulado queda como registro.
export function seriesRows(items) {
  return [...items].sort(byDueThenN).map((c) => ({
    id: c.id,
    n: c.installment?.n || null,
    dueDate: c.dueDate,
    amount: Number(c.amount) || 0,
    editable: isOpen(c),
  }));
}

// Una herramienta del editor aplicada a las filas abiertas desde `fromIndex`:
// correr las fechas `months` meses, llevarlas al día `day` del mes, o poner
// un mismo `amount`.
export function applySeriesTool(rows, { fromIndex = 0, months = 0, day = null, amount = null }) {
  return rows.map((r, i) => {
    if (i < fromIndex || !r.editable) return r;
    let dueDate = r.dueDate;
    if (months) dueDate = shiftMonths(dueDate, months);
    if (day) dueDate = withDayOfMonth(dueDate, day);
    return { ...r, dueDate, amount: amount != null ? amount : r.amount };
  });
}

// Lo que cambia el borrador respecto de lo guardado: fecha y monto de cada
// vencimiento abierto que se tocó.
export function seriesChanges(items, rows) {
  const byId = new Map(items.map((c) => [c.id, c]));
  return rows.flatMap((r) => {
    const c = byId.get(r.id);
    if (!c || !isOpen(c)) return [];
    const patch = {};
    if (r.dueDate !== c.dueDate) patch.dueDate = r.dueDate;
    const amount = Math.round(Number(r.amount) || 0);
    if (amount !== (Number(c.amount) || 0)) patch.amount = amount;
    return Object.keys(patch).length ? [{ id: r.id, patch }] : [];
  });
}

// Por qué no se puede guardar una fila: sin fecha, monto en cero, o un monto
// menor que lo que ya se le abonó.
export function seriesRowError(row, item) {
  if (!row.editable) return "";
  if (Number.isNaN(dayNumber(row.dueDate))) return "Falta la fecha";
  const amount = Math.round(Number(row.amount) || 0);
  if (!(amount > 0)) return "El monto debe ser mayor a 0";
  if (item && amount < partialPaidOf(item)) return "Es menos que lo ya abonado";
  return "";
}

// ── Import de la planilla "Control de Cheques" ─────────────────────────────

// Fecha de una celda de Excel: un `Date` (ExcelJS los da a medianoche UTC), un
// número de serie, o texto `YYYY-MM-DD`, `DD-MM-YY`, `DD-MM-YYYY` o con `/`.
// Devuelve "" si no se reconoce.
export function parseLooseDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === "number") {
    if (value < 20_000 || value > 80_000) return "";
    return isoFromDayNumber(Math.floor(value) + dayNumber("1899-12-30"));
  }
  const s = String(value).trim();
  let y, m, d;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (match) [, y, m, d] = match.map(Number);
  else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
    if (!match) return "";
    [, d, m, y] = match.map(Number);
    if (y < 100) y += 2000;
  }
  if (m < 1 || m > 12 || d < 1) return "";
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fold = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Palabras que identifican a cada banco en lo que se escribe a mano ("bco
// chile", "BICE", "Estado").
const BANK_ALIASES = [
  ["001", ["chile", "bch"]],
  ["012", ["estado", "bancoestado"]],
  ["028", ["bice"]],
  ["037", ["santander"]],
  ["016", ["bci", "credito e inversiones", "mach"]],
  ["039", ["itau"]],
  ["014", ["scotiabank", "scotia"]],
  ["504", ["bbva"]],
  ["055", ["consorcio"]],
  ["051", ["falabella"]],
  ["053", ["ripley"]],
  ["009", ["internacional"]],
  ["507", ["desarrollo"]],
];

// Código del banco a partir de su nombre escrito a mano, o "" si no se
// reconoce.
export function bankCodeFromText(text) {
  const t = fold(text).replace(/\b(banco|bco|bank|de|del)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  for (const [code, words] of BANK_ALIASES) {
    if (words.some((w) => t === w || t.split(" ").includes(w) || (w.includes(" ") && t.includes(w)))) {
      return code;
    }
  }
  const exact = BANKS.find((b) => fold(b.name) === fold(text));
  return exact ? exact.code : "";
}

export function excelStatus(text) {
  const t = fold(text);
  if (t.startsWith("cobrad") || t.startsWith("pagad")) return "paid";
  if (t.startsWith("anulad")) return "cancelled";
  if (t.startsWith("protestad")) return "protested";
  if (t.startsWith("aplazad")) return "postponed";
  return "pending";
}

// Empresa por alias o razón social, sin distinguir mayúsculas ni tildes.
export function matchCompany(text, companies) {
  const t = fold(text);
  if (!t) return null;
  return (
    (companies || []).find((c) => fold(c.alias) === t || fold(c.razonSocial) === t) ||
    (companies || []).find((c) => (c.alias && t.includes(fold(c.alias))) || (c.razonSocial && fold(c.razonSocial).includes(t))) ||
    null
  );
}

// Id estable de un cheque importado: reimportar la planilla no lo duplica.
export function chequeDocId(bank, chequeNumber) {
  const b = fold(bank).replace(/[^a-z0-9]+/g, "") || "sinbanco";
  const n = String(chequeNumber ?? "").replace(/[^0-9A-Za-z]+/g, "");
  return n ? `chq_${b}_${n}` : "";
}

// Valor plano de una celda de ExcelJS: el resultado de una fórmula, el texto
// de un texto enriquecido o el valor tal cual.
function cellValue(v) {
  if (!v || typeof v !== "object" || v instanceof Date) return v;
  if ("result" in v) return v.result;
  if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return v.text;
  return v;
}

// Columnas de la hoja "Control de Cheques": N°, Fecha, Banco, N° cheque,
// Beneficiario, Concepto, Monto, Fecha de cobro, Estado, Cuenta / Empresa,
// Observaciones. `cells` va en ese orden (sin la columna vacía de ExcelJS).
// Devuelve `null` para una fila vacía y `{ error }` para una que no se puede
// importar.
export function mapExcelRow(cells, { companies = [] } = {}) {
  const [, rawDate, rawBank, rawNumber, rawPayee, rawConcept, rawAmount, rawPaidAt, rawStatus, rawCompany, rawNotes] =
    cells.map(cellValue);
  const hasData = [rawDate, rawBank, rawNumber, rawPayee, rawAmount].some((v) => v != null && String(v).trim() !== "");
  if (!hasData) return null;

  const dueDate = parseLooseDate(rawDate);
  const amount = Math.round(Number(String(rawAmount ?? "").replace(/[^0-9-]/g, "")) || 0);
  const chequeNumber = String(rawNumber ?? "").trim();
  if (!dueDate) return { error: `Fecha no reconocida: "${rawDate ?? ""}"` };
  if (amount <= 0) return { error: "Sin monto" };

  const bankText = String(rawBank ?? "").trim();
  const bankCode = bankCodeFromText(bankText);
  const company = matchCompany(rawCompany, companies);
  const status = excelStatus(rawStatus);
  const paidAt = status === "paid" ? parseLooseDate(rawPaidAt) || "" : "";

  return {
    id: chequeDocId(bankCode || bankText, chequeNumber),
    data: {
      kind: "chequeIssued",
      dueDate,
      amount,
      bank: bankCode || toTitleName(bankText),
      chequeNumber,
      counterparty: toTitleName(String(rawPayee ?? "")),
      concept: unshout(String(rawConcept ?? "").trim()),
      notes: unshout(String(rawNotes ?? "").trim()),
      companyId: company?.id || null,
      // Nombre de empresa tal cual, como la razón social (utils/textCase.js).
      companyLabel: company ? "" : String(rawCompany ?? "").trim(),
      status,
      paidAt,
      source: "excel_import",
    },
  };
}
