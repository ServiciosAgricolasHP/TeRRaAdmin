// Revisiones de los datos de pago de la nómina. Cada una devuelve
// `[{ person, severity, lines }]`.
import { accountTypeLabel, bankName, isCashBank, rutWithoutDv } from "../banks";
import { formatRutForDisplay, normalizeRut } from "../rutUtils";
import { SEVERITY, listText } from "./checkContext";

const digits = (v) => String(v || "").replace(/\D/g, "").replace(/^0+/, "");

// La cuenta de un item, con la tupla `bankDetails` de los items antiguos como
// respaldo.
function accountOf(item) {
  const bd = item?.bankDetails || [];
  const bankCode = String(item?.bankCode ?? bd[3] ?? "").toUpperCase();
  const type = item?.accountType ?? bd[2];
  return {
    cash: isCashBank(bankCode),
    bankCode,
    number: digits(item?.accountNumber ?? bd[1]),
    type: type == null || type === "" ? null : Number(type),
    paymentRut: normalizeRut(item?.paymentRut ?? bd[0] ?? ""),
  };
}

const known = (a) => a.cash || !!(a.bankCode || a.number);

const sameAccount = (a, b) =>
  a.cash === b.cash && (a.cash || (a.bankCode === b.bankCode && a.number === b.number && a.type === b.type && a.paymentRut === b.paymentRut));

function accountText(a) {
  if (a.cash) return "efectivo";
  const parts = [bankName(a.bankCode), a.type != null ? accountTypeLabel(a.type) : "", a.number || "sin número"];
  const text = parts.filter(Boolean).join(" · ");
  return a.paymentRut ? `${text} (RUT ${formatRutForDisplay(a.paymentRut)})` : text;
}

// La cuenta cambió desde la última nómina que le pagó a la persona. Rojo si
// ahora va a una cuenta; naranja si pasó a efectivo.
export function accountChanged(ctx) {
  const found = [];
  for (const r of ctx.rows) {
    const last = ctx.historyOf(r.person)[0];
    if (!last) continue;
    const before = accountOf(last.item);
    const now = accountOf(r.item);
    if (!known(before) || sameAccount(before, now)) continue;
    found.push({
      person: r.person,
      severity: now.cash ? SEVERITY.orange : SEVERITY.red,
      lines: [`Antes (${last.payroll.name || "nómina anterior"}): ${accountText(before)}`, `Ahora: ${accountText(now)}`],
    });
  }
  return found;
}

// Una Cuenta RUT cuyo número no es el RUT de pago sin el dígito verificador.
export function cuentaRutMismatch(ctx) {
  const found = [];
  for (const r of ctx.rows) {
    const a = accountOf(r.item);
    if (a.cash || a.type !== 3 || !a.number) continue;
    const payRut = a.paymentRut || normalizeRut(r.item.rut);
    if (a.number === digits(rutWithoutDv(payRut))) continue;
    found.push({
      person: r.person,
      severity: SEVERITY.red,
      lines: [`La Cuenta RUT ${a.number} no es el RUT de pago ${formatRutForDisplay(payRut)}`],
    });
  }
  return found;
}

// Dos o más personas cobran en la misma cuenta.
export function sharedAccount(ctx) {
  const groups = new Map();
  for (const r of ctx.rows) {
    const a = accountOf(r.item);
    if (a.cash || !a.number) continue;
    const k = `${a.bankCode}|${a.number}`;
    if (!groups.has(k)) groups.set(k, []);
    if (!groups.get(k).some((x) => x.person === r.person)) groups.get(k).push(r);
  }
  const found = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const r of list) {
      const others = list.filter((x) => x !== r).map((x) => x.name || formatRutForDisplay(x.item.rut));
      found.push({ person: r.person, severity: SEVERITY.orange, lines: [`Comparte la cuenta con ${listText(others)}`] });
    }
  }
  return found;
}

// Cobra en la cuenta de otra persona y la ficha no dice de quién es.
export function missingPayee(ctx) {
  const found = [];
  for (const r of ctx.rows) {
    const pay = normalizeRut(r.item.paymentRut);
    if (!pay || String(r.item.paymentName || "").trim()) continue;
    const w = r.worker;
    const own = [r.item.rut, r.person, w?.id, w?.rut, ...(w?.rutHistory || [])].filter(Boolean).map(normalizeRut);
    if (own.includes(pay)) continue;
    found.push({ person: r.person, severity: SEVERITY.orange, lines: [`Cobra en la cuenta del RUT ${formatRutForDisplay(pay)}, sin titular en la ficha`] });
  }
  return found;
}

// Primera vez en una nómina.
export function firstPayment(ctx) {
  return ctx.rows
    .filter((r) => !ctx.historyOf(r.person).length)
    .map((r) => ({ person: r.person, severity: SEVERITY.info, lines: ["Primera vez en una nómina"] }));
}
