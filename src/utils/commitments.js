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
};

export const kindMeta = (kind) => COMMITMENT_KINDS[kind] || COMMITMENT_KINDS.payment;
export const isCheque = (kind) => kind === "chequeIssued" || kind === "chequeReceived";
export const directionOf = (kind) => kindMeta(kind).direction;

// "Vencido" no se guarda: es un pendiente con la fecha ya pasada.
export const STATUS_LABELS = {
  pending: "Pendiente",
  overdue: "Vencido",
  paid: "Pagado",
  cancelled: "Anulado",
};

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

// Los vencimientos mensuales de una serie que caen después de `after` (o desde
// `firstDate` si es vacío) y hasta `until`, ambos `YYYY-MM-DD`.
export function recurringDates({ firstDate, after = "", until }) {
  if (Number.isNaN(dayNumber(firstDate)) || Number.isNaN(dayNumber(until))) return [];
  const day = dayOf(firstDate);
  const out = [];
  for (let i = 0; i < 600; i++) {
    const d = monthlyDate(firstDate, i, day);
    if (d > until) break;
    if (!after || d > after) out.push(d);
  }
  return out;
}

// Resumen por sentido de la plata: lo que se paga (`out`) y lo que se cobra
// (`in`, cheques recibidos) no se suman entre sí.
export function summarize(commitments, today) {
  const blank = () => ({ amount: 0, count: 0 });
  const acc = {
    out: { pending: blank(), overdue: blank(), next7: blank() },
    in: { pending: blank(), overdue: blank(), next7: blank() },
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
      add(dir[status], c.amount);
      const days = daysUntil(c.dueDate, today);
      if (days != null && days >= 0 && days <= 7) add(dir.next7, c.amount);
    } else if (status === "paid") {
      if (String(c.paidAt || "").slice(0, 7) === month) add(acc.paidThisMonth, c.amount);
    } else if (status === "cancelled") {
      add(acc.cancelled, c.amount);
    }
  }
  return acc;
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
