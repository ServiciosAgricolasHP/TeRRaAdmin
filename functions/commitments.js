// Avisos de "Cheques y pagos" (pantalla `src/screens/Commitments.jsx`).
//
// Una vez al día se leen los vencimientos pendientes (`commitments` con
// `status == "pending"`) y se envía UN correo con lo que vence en los días
// configurados en `commitmentConfig/main.offsets` (por defecto 3, 1 y el mismo
// día), más los vencidos que nadie marcó. Si no hay nada que avisar, no se
// envía nada.
//
// `commitmentNotifications/{YYYY-MM-DD}` es el registro de cada envío y el
// candado contra el doble envío: se crea con `create()` antes de mandar el
// correo, así un reintento del Scheduler no lo repite.
//
// La aritmética de fechas es una copia de `src/utils/commitments.js` (el
// backend se despliega sin la carpeta `src`): si cambia una, cambia la otra.

import process from "node:process";
import nodemailer from "nodemailer";
import { FieldValue } from "firebase-admin/firestore";

const COMMITMENTS = "commitments";
const SERIES = "commitmentSeries";
const CONFIG = "commitmentConfig";
const NOTIFICATIONS = "commitmentNotifications";
const COMPANIES = "companies";
const LOGS = "logs";

export const APP_URL = "https://serviciosagricolashp.github.io/TeRRaAdmin/cheques-pagos";
export const TIME_ZONE = "America/Santiago";
const RECURRING_HORIZON_DAYS = 60;

const DEFAULT_CONFIG = { recipients: [], offsets: [3, 1, 0], includeOverdue: true, sender: "" };

const KIND_LABELS = {
  chequeIssued: "Cheque emitido",
  chequeReceived: "Cheque recibido",
  payment: "Pago comprometido",
  installment: "Cuota de crédito",
};

// Los mismos códigos de `src/utils/banks.js`.
const BANK_NAMES = {
  "012": "Banco Estado",
  "001": "Banco de Chile",
  "037": "Santander",
  "016": "BCI",
  "504": "BBVA",
  "027": "Corpbanca",
  "028": "BICE",
  "055": "Consorcio",
  "507": "Banco del Desarrollo",
  "051": "Falabella",
  "009": "Internacional",
  "039": "Itaú",
  "053": "Ripley",
  "031": "HSBC",
  "014": "Scotiabank",
};

// ── Fechas ──────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");

// Fecha de hoy en Chile, `YYYY-MM-DD`.
export function chileToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000;
}

export function daysUntil(dueDate, today) {
  const d = dayNumber(dueDate) - dayNumber(today);
  return Number.isNaN(d) ? null : d;
}

export function addDays(iso, days) {
  const n = dayNumber(iso);
  if (Number.isNaN(n)) return "";
  const d = new Date((n + days) * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function monthlyDate(startIso, offset, dayOfMonth) {
  const [y, m] = String(startIso).split("-").map(Number);
  const idx = m - 1 + offset;
  const yy = y + Math.floor(idx / 12);
  const mm = (((idx % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${pad(mm)}-${pad(Math.min(dayOfMonth, last))}`;
}

export function recurringDates({ firstDate, after = "", until }) {
  if (Number.isNaN(dayNumber(firstDate)) || Number.isNaN(dayNumber(until))) return [];
  const day = Number(String(firstDate).slice(8, 10));
  const out = [];
  for (let i = 0; i < 600; i++) {
    const d = monthlyDate(firstDate, i, day);
    if (d > until) break;
    if (!after || d > after) out.push(d);
  }
  return out;
}

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso || "");
};

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 });
const fmtMoney = (v) => clp.format(Number(v) || 0);

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ── Resumen ─────────────────────────────────────────────────────────────────

function sectionTitle(offset) {
  if (offset === 0) return "Vence hoy";
  if (offset === 1) return "Vence mañana";
  return `Vence en ${offset} días`;
}

// Lo que hay que avisar hoy, agrupado: primero los vencidos (si se piden) y
// después cada día de anticipación, del más cercano al más lejano.
export function buildDigest(commitments, today, config) {
  const offsets = [...new Set((config.offsets || []).map(Number))].filter((n) => n >= 0).sort((a, b) => a - b);
  const pending = commitments.filter((c) => (c.status || "pending") === "pending");
  const byDate = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
  const sections = [];
  if (config.includeOverdue) {
    const overdue = pending.filter((c) => daysUntil(c.dueDate, today) < 0).sort(byDate);
    if (overdue.length) sections.push({ key: "overdue", title: "Vencidos sin marcar como pagados", items: overdue });
  }
  for (const offset of offsets) {
    const items = pending.filter((c) => daysUntil(c.dueDate, today) === offset);
    if (items.length) sections.push({ key: `d${offset}`, title: sectionTitle(offset), items });
  }
  const all = sections.flatMap((s) => s.items);
  return { sections, count: all.length, total: all.reduce((s, c) => s + (Number(c.amount) || 0), 0) };
}

function describe(c, companies) {
  const company = companies[c.companyId];
  return {
    kind: KIND_LABELS[c.kind] || "Pago",
    counterparty: c.counterparty || "",
    amount: fmtMoney(c.amount),
    dueDate: fmtDate(c.dueDate),
    detail: [
      c.installment?.of ? `Cuota ${c.installment.n}/${c.installment.of}` : "",
      c.bank ? BANK_NAMES[c.bank] || c.bank : "",
      c.chequeNumber ? `N° ${c.chequeNumber}` : "",
      company ? company.alias || company.razonSocial : c.companyLabel || "",
      c.concept || "",
    ]
      .filter(Boolean)
      .join(" · "),
    incoming: c.kind === "chequeReceived",
  };
}

// Asunto, texto plano y HTML del correo.
export function renderDigest(digest, today, companies = {}, { test = false } = {}) {
  const prefix = test ? "[Prueba] " : "";
  const overdue = digest.sections.find((s) => s.key === "overdue")?.items.length || 0;
  const subject = digest.count
    ? `${prefix}Cheques y pagos: ${digest.count} vencimiento(s)${overdue ? `, ${overdue} vencido(s)` : ""} — ${fmtDate(today)}`
    : `${prefix}Cheques y pagos: sin vencimientos para avisar — ${fmtDate(today)}`;

  const lines = [];
  const blocks = [];
  for (const s of digest.sections) {
    lines.push("", s.title.toUpperCase());
    const rows = s.items.map((c) => describe(c, companies));
    for (const r of rows) {
      lines.push(`- ${r.dueDate} · ${r.kind} · ${r.counterparty} · ${r.incoming ? "+" : ""}${r.amount}${r.detail ? ` (${r.detail})` : ""}`);
    }
    blocks.push(`
      <h3 style="margin:18px 0 6px;font-size:15px;color:${s.key === "overdue" ? "#b91c1c" : "#111827"}">${escapeHtml(s.title)}</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        ${rows
          .map(
            (r) => `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${escapeHtml(r.dueDate)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb"><b>${escapeHtml(r.counterparty)}</b><br><span style="color:#6b7280">${escapeHtml(r.kind)}${r.detail ? " · " + escapeHtml(r.detail) : ""}</span></td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;font-weight:600">${r.incoming ? "+" : ""}${escapeHtml(r.amount)}</td>
        </tr>`,
          )
          .join("")}
      </table>`);
  }

  const intro = digest.count
    ? `${digest.count} vencimiento(s) por ${fmtMoney(digest.total)}.`
    : "Hoy no hay vencimientos para avisar.";
  const text = [intro, ...lines, "", `Ver en TeRRa: ${APP_URL}`].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px">
    ${test ? '<p style="background:#fef3c7;padding:8px;border-radius:6px">Correo de prueba enviado desde TeRRa.</p>' : ""}
    <p style="font-size:14px">${escapeHtml(intro)}</p>
    ${blocks.join("")}
    <p style="margin-top:20px;font-size:13px"><a href="${APP_URL}">Abrir Cheques y pagos en TeRRa</a></p>
  </div>`;
  return { subject, text, html };
}

// ── Envío ───────────────────────────────────────────────────────────────────

// Gmail con contraseña de aplicación. En el emulador el correo no sale: se
// arma como JSON y se devuelve.
export function createMailer({ sender, password }) {
  if (process.env.FUNCTIONS_EMULATOR === "true") return nodemailer.createTransport({ jsonTransport: true });
  return nodemailer.createTransport({ service: "gmail", auth: { user: sender, pass: password } });
}

async function readConfig(db) {
  const snap = await db.collection(CONFIG).doc("main").get();
  return { ...DEFAULT_CONFIG, ...(snap.exists ? snap.data() : {}) };
}

async function readCompanies(db, commitments) {
  const ids = [...new Set(commitments.map((c) => c.companyId).filter(Boolean))];
  const snaps = await Promise.all(ids.map((id) => db.collection(COMPANIES).doc(id).get()));
  return Object.fromEntries(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
}

// Mantiene creados los vencimientos de los pagos recurrentes activos hasta
// `RECURRING_HORIZON_DAYS` por delante. `generatedUntil` marca hasta dónde se
// generó, así un vencimiento que alguien eliminó no vuelve a aparecer.
export async function extendRecurringSeries(db, today) {
  const until = addDays(today, RECURRING_HORIZON_DAYS);
  const snap = await db.collection(SERIES).where("active", "==", true).get();
  let created = 0;
  for (const doc of snap.docs) {
    const s = doc.data();
    if (s.count != null || (s.generatedUntil && s.generatedUntil >= until)) continue;
    const dates = recurringDates({ firstDate: s.firstDate, after: s.generatedUntil || "", until });
    for (const dueDate of dates) {
      try {
        await db.collection(COMMITMENTS).doc(`${doc.id}_${dueDate}`).create({
          kind: s.kind || "payment",
          dueDate,
          issueDate: "",
          amount: Number(s.amount) || 0,
          counterparty: s.counterparty || "",
          concept: s.concept || "",
          notes: s.notes || "",
          bank: "",
          chequeNumber: "",
          companyId: s.companyId || null,
          companyLabel: s.companyLabel || "",
          status: "pending",
          paidAt: "",
          seriesId: doc.id,
          installment: null,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: null,
        });
        created += 1;
      } catch (err) {
        // 6 = ALREADY_EXISTS: ya estaba generado.
        if (err?.code !== 6) throw err;
      }
    }
    await doc.ref.update({ generatedUntil: until });
    await db.collection(LOGS).add({
      uid: null,
      email: null,
      action: "update",
      entity: "commitmentSeries",
      entityId: doc.id,
      changes: { generatedUntil: { from: s.generatedUntil || null, to: until } },
      before: null,
      after: null,
      meta: { auto: "extendRecurring", dates },
      timestamp: FieldValue.serverTimestamp(),
    });
  }
  return created;
}

// El aviso del día. Con `test` se envía igual aunque no haya nada (para probar
// la entrega) y no deja el candado del día.
export async function runCommitmentDigest(db, { password, now = new Date(), test = false, mailer } = {}) {
  const today = chileToday(now);
  const config = await readConfig(db);
  const extended = test ? 0 : await extendRecurringSeries(db, today);

  const pendingSnap = await db.collection(COMMITMENTS).where("status", "==", "pending").get();
  const pending = pendingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const digest = buildDigest(pending, today, config);
  const recipients = (config.recipients || []).filter(Boolean);
  const base = { today, count: digest.count, recipients, extended };

  if (!test && !digest.count) return { ...base, sent: false, reason: "empty" };
  if (!recipients.length || !config.sender) return { ...base, sent: false, reason: "no-config" };

  const lockRef = db.collection(NOTIFICATIONS).doc(today);
  if (!test) {
    try {
      await lockRef.create({
        status: "sending",
        recipients,
        count: digest.count,
        total: digest.total,
        sections: digest.sections.map((s) => ({ key: s.key, ids: s.items.map((c) => c.id) })),
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (err?.code === 6) return { ...base, sent: false, reason: "already-sent" };
      throw err;
    }
  }

  const companies = await readCompanies(db, digest.sections.flatMap((s) => s.items));
  const { subject, text, html } = renderDigest(digest, today, companies, { test });
  try {
    const transport = mailer || createMailer({ sender: config.sender, password });
    const info = await transport.sendMail({
      from: `"TeRRa · Cheques y pagos" <${config.sender}>`,
      to: recipients.join(", "),
      subject,
      text,
      html,
    });
    if (!test) await lockRef.update({ status: "sent", subject, messageId: info.messageId || null, sentAt: FieldValue.serverTimestamp() });
    return { ...base, sent: true, subject, messageId: info.messageId || null };
  } catch (err) {
    // Sin el candado, el reintento del Scheduler puede volver a intentarlo.
    if (!test) await lockRef.delete().catch(() => {});
    throw err;
  }
}
