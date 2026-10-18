import { useMemo, useState } from "react";
import Modal from "./Modal";
import { useToast } from "../contexts/ToastContext";
import { buildPaymentReport, kindMeta, extraOf, paidTotalOf, debtState, partialPaidOf, remainingOf, nextYearEnd } from "../utils/commitments";
import { bankName } from "../utils/banks";
import { fmtCurrency } from "../utils/format";

// Informe de deudas de Cheques y pagos, como documento PDF: resumen, balance de
// cada deuda con la fecha en que queda pagada, lo que vence en los próximos 7
// días y el próximo mes, los vencimientos por mes (detallados hasta una fecha,
// por defecto fin del año siguiente) y, si se piden, el detalle de cada pago
// pendiente y los pagos hechos en un rango. El contenido lo arma una sola vez
// `reportDocument`, y lo dibujan igual la vista previa (HTML) y el PDF.

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Filas de "Vencimientos por mes" que no son un mes.
const SPECIAL_ROWS = {
  overdue: "Vencido sin pagar",
  protested: "Cheques protestados",
  postponed: "Aplazado (sin fecha)",
};

// Cómo se rotula un pago que se debe sin fecha vigente, y su color.
const STATE_NOTE = { overdue: "vencido", protested: "protestado", postponed: "aplazado" };
const STATE_TONE = { overdue: "danger", protested: "danger", postponed: "warn" };

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const monthLabel = (key) => {
  if (SPECIAL_ROWS[key]) return SPECIAL_ROWS[key];
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTHS[m - 1] || key} ${y}`;
};
const money = (v) => fmtCurrency(v);

const btnCls =
  "min-h-8 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50";
const inputCls =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";

function debtLabel(d) {
  if (d.recurring) return "Pago recurrente";
  if (d.kind === "personalDebt") return d.installments ? `Deuda personal en ${d.installments} cuotas` : "Deuda personal";
  if (d.installments) return `Crédito en ${d.installments} cuotas`;
  return "";
}

function debtCount(d) {
  if (d.installments) return `${d.pending.count} de ${d.installments}`;
  return String(d.pending.count);
}

// Cuándo queda pagada una deuda: nunca si es recurrente y si no, con su último
// vencimiento, aunque tenga pagos atrasados (eso lo dice `behindTag`).
function debtPayoff(d) {
  if (d.recurring) return "Sin término";
  return fmtDate(d.payoffDate) || "—";
}

// "2 cuotas atrasadas" en un crédito, "1 pago atrasado" en lo demás. Atrasado
// es todo lo que se debe sin una fecha vigente: vencido, aplazado o protestado.
function behindLabel(count, noun) {
  const many = count === 1 ? "" : "s";
  return `${count} ${noun}${many} ${noun === "cuota" ? "atrasada" : "atrasado"}${many}`;
}
function behindTag(d) {
  return d.behind.count ? behindLabel(d.behind.count, d.installments ? "cuota" : "pago") : "";
}
// Rojo si hay algo vencido o protestado, ámbar si solo hay aplazados.
function behindTone(sum) {
  if (sum.overdue.count || sum.protested.count) return "danger";
  return sum.postponed.count ? "warn" : "";
}

// Lo que se debe de una deuda sin una fecha vigente: aplazado, vencido o
// protestado.
function debtNotes(d) {
  return ["postponed", "overdue", "protested"]
    .filter((k) => d[k].count > 0)
    .map((k) => `${STATE_NOTE[k]} ${money(d[k].total)}`)
    .join(" · ");
}

function payoffNote(report) {
  const { totals, hasRecurring } = report;
  return [
    hasRecurring ? "sin contar los pagos recurrentes" : "",
    totals.behind.count ? `con ${behindLabel(totals.behind.count, "pago")} por ${money(totals.behind.total)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

// "Todas las empresas · al 17-10-2026 · vencimientos hasta el 31-12-2027".
function reportSubtitle(report, { today, companyName }) {
  return [companyName || "Todas las empresas", `al ${fmtDate(today)}`, report.dueUntil ? `vencimientos hasta el ${fmtDate(report.dueUntil)}` : ""]
    .filter(Boolean)
    .join(" · ");
}

const paymentsLabel = (n) => `${n} pago${n === 1 ? "" : "s"}`;

// Lo que vence después del corte: desde cuándo y hasta su último vencimiento.
function laterCell(report) {
  return { text: `Después del ${fmtDate(report.dueUntil)}`, sub: report.laterEnd ? `hasta el ${fmtDate(report.laterEnd)}` : "" };
}
const laterText = (report) => [laterCell(report).text, laterCell(report).sub].filter(Boolean).join(", ");
// Fila del detalle: la fecha va en el detalle, que es la columna ancha.
const laterDetail = (report) => `${paymentsLabel(report.totals.later.count)} ${laterText(report).replace(/^Después/, "después")}, sin detalle`;

function itemDetail(c) {
  return [
    c.installment?.of ? `Cuota ${c.installment.n}/${c.installment.of}` : "",
    partialPaidOf(c) > 0 ? `abonado ${fmtCurrency(partialPaidOf(c))} de ${fmtCurrency(c.amount)}` : "",
    c.bank ? bankName(c.bank) : "",
    c.chequeNumber ? `N° ${c.chequeNumber}` : "",
    c.concept || "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ── Contenido del documento ─────────────────────────────────────────────────

// Bloques en orden: `h2` y `h3` (títulos), `p` (párrafo) y `table`. Una columna
// puede fijar su ancho en mm (`width`), así las tablas iguales se alinean. Una celda es
// texto o `{ text, sub, bold, tone, subTone, muted }`, donde `sub` es una
// segunda línea más chica. Una fila puede ser `total`, `bold` o llevar `tone`
// (fondo de color y la primera celda en ese color).
const ITEM_COLUMNS = [
  { label: "Vence", width: 24 },
  { label: "Tipo", width: 32 },
  { label: "A quién", width: 42 },
  { label: "Detalle" },
  { label: "Monto", num: true, width: 26 },
];

function itemRows(list, today) {
  return list.map((c) => {
    const state = debtState(c, today);
    return {
      cells: [
        { text: fmtDate(c.dueDate), sub: STATE_NOTE[state] || "", tone: STATE_TONE[state] },
        kindMeta(c.kind).label,
        c.counterparty,
        { text: itemDetail(c), muted: true },
        money(remainingOf(c)),
      ],
    };
  });
}

function reportDocument(report, { today, companyName, showDetail, includePaid, paidFrom, paidTo }) {
  const { totals, debts, months, pending, detail, paid, hasExtra, payoffDate, upcoming } = report;
  const blocks = [];
  const h2 = (text) => blocks.push({ kind: "h2", text });
  const h3 = (text) => blocks.push({ kind: "h3", text });
  const p = (text, muted = false) => blocks.push({ kind: "p", text, muted });
  const table = (columns, rows) => blocks.push({ kind: "table", columns, rows });
  const totalRow = (cells) => ({ cells, total: true });
  const sumRow = (label, sum, tone) => ({ cells: [label, String(sum.count), money(sum.total)], tone });
  const paidRange = `${fmtDate(paidFrom) || "inicio"} a ${fmtDate(paidTo) || "hoy"}`;

  h2("Resumen");
  table(
    [{ label: "Concepto" }, { label: "Pagos", num: true, width: 22 }, { label: "Monto", num: true, width: 32 }],
    [
      { ...sumRow("Pendiente por pagar", totals.pending), bold: true },
      ...(totals.postponed.count ? [sumRow("Aplazado (sin fecha)", totals.postponed, "warn")] : []),
      sumRow("Vencido sin pagar", totals.overdue, totals.overdue.count ? "danger" : undefined),
      ...(totals.protested.count ? [sumRow("Cheques protestados", totals.protested, "danger")] : []),
      ...(includePaid ? [sumRow(`Pagado del ${paidRange}`, totals.paid)] : []),
    ],
  );
  if (pending.length === 0) p("No hay pagos pendientes.");
  else if (payoffDate) p(`Todo queda pagado el ${fmtDate(payoffDate)}${payoffNote(report) ? ` (${payoffNote(report)})` : ""}.`);
  if (includePaid && totals.paid.extra) p(`Lo pagado en el período incluye ${money(totals.paid.extra)} de interés.`, true);

  if (debts.length > 0) {
    h2("Balance de deudas");
    table(
      [
        { label: "Deuda" },
        { label: "Pendientes", num: true, width: 22 },
        { label: "Saldo", num: true, width: 28 },
        { label: "Próximo pago", width: 34 },
        { label: "Queda pagada", width: 34 },
      ],
      [
        ...debts.map((d) => ({
          cells: [
            { text: d.counterparty, sub: [debtLabel(d), d.concept].filter(Boolean).join(" · "), bold: true },
            { text: debtCount(d), sub: d.paid.count ? `${d.paid.count} pagada(s)` : "" },
            { text: money(d.pending.total), bold: true },
            { text: fmtDate(d.nextDue) || "—", sub: debtNotes(d), subTone: behindTone(d) },
            { text: debtPayoff(d), sub: behindTag(d), subTone: behindTone(d) },
          ],
        })),
        totalRow([
          "Total",
          String(totals.pending.count),
          money(totals.pending.total),
          "",
          { text: payoffDate ? fmtDate(payoffDate) : "", sub: totals.behind.count ? behindLabel(totals.behind.count, "pago") : "", subTone: behindTone(totals) },
        ]),
      ],
    );
  }

  if (pending.length > 0) {
    h2("Próximos vencimientos");
    const nearGroup = (title, list, sum, emptyText) => {
      h3(`${title} · ${money(sum.total)}`);
      if (list.length === 0) p(emptyText, true);
      else table(ITEM_COLUMNS, [...itemRows(list, today), totalRow(["Total", "", "", "", money(sum.total)])]);
    };
    nearGroup(`Próximos 7 días (hasta el ${fmtDate(upcoming.weekEnd)})`, upcoming.week, upcoming.weekTotal, "Nada vence en los próximos 7 días.");
    nearGroup(`Próximo mes (hasta el ${fmtDate(upcoming.monthEnd)})`, upcoming.month, upcoming.monthTotal, "Nada más vence en el próximo mes.");
  }

  if (months.length > 0) {
    h2("Vencimientos por mes");
    table(
      [{ label: "Mes" }, { label: "Pagos", num: true, width: 22 }, { label: "Total del mes", num: true, width: 34 }],
      months.map((m) => ({
        cells: [m.month === "later" ? laterCell(report) : monthLabel(m.month), String(m.count), { text: money(m.total), bold: true }],
        tone: STATE_TONE[m.month],
      })),
    );
  }

  if (showDetail && pending.length > 0) {
    h2("Detalle de pagos pendientes");
    table(ITEM_COLUMNS, [
      ...itemRows(detail, today),
      ...(totals.later.count
        ? [{ cells: ["Más adelante", "", "", { text: laterDetail(report), muted: true }, money(totals.later.total)] }]
        : []),
      totalRow(["Total", "", "", "", money(totals.pending.total)]),
    ]);
  }

  if (includePaid) {
    h2(`Pagos realizados · ${paidRange}`);
    if (paid.length === 0) p("Sin pagos en el período.", true);
    else
      table(
        [
          { label: "Pagado el" },
          { label: "Vencía" },
          { label: "Tipo" },
          { label: "A quién" },
          { label: "Detalle" },
          ...(hasExtra ? [{ label: "Monto original", num: true }, { label: "Interés / extra", num: true }] : []),
          { label: hasExtra ? "Total pagado" : "Monto", num: true },
        ],
        [
          ...paid.map((c) => ({
            cells: [
              fmtDate(c.paidAt) || "—",
              fmtDate(c.dueDate),
              kindMeta(c.kind).label,
              c.counterparty,
              { text: itemDetail(c), muted: true },
              ...(hasExtra ? [money(c.amount), extraOf(c) ? money(extraOf(c)) : "—"] : []),
              money(paidTotalOf(c)),
            ],
          })),
          totalRow(["Total", "", "", "", "", ...(hasExtra ? [money(totals.paid.amount), money(totals.paid.extra)] : []), money(totals.paid.total)]),
        ],
      );
  }

  return { title: "Informe de deudas", subtitle: reportSubtitle(report, { today, companyName }), blocks };
}

const cellOf = (c) => (c && typeof c === "object" ? c : { text: c ?? "" });

// ── Modal ───────────────────────────────────────────────────────────────────

export default function PaymentReportModal({ items, companies, today, onClose }) {
  const toast = useToast();
  const [companyId, setCompanyId] = useState("");
  const [includePaid, setIncludePaid] = useState(false);
  const [paidFrom, setPaidFrom] = useState(`${today.slice(0, 7)}-01`);
  const [paidTo, setPaidTo] = useState(today);
  const [dueUntil, setDueUntil] = useState(() => nextYearEnd(today));
  const [showDetail, setShowDetail] = useState(true);
  const [busy, setBusy] = useState("");

  const company = companies.find((c) => c.id === companyId);
  const companyName = company ? company.alias || company.razonSocial : "";

  const report = useMemo(() => {
    const scoped = companyId ? items.filter((c) => c.companyId === companyId) : items;
    return buildPaymentReport(scoped, { today, includePaid, paidFrom, paidTo, dueUntil });
  }, [items, companyId, today, includePaid, paidFrom, paidTo, dueUntil]);

  const doc = useMemo(
    () => reportDocument(report, { today, companyName, showDetail, includePaid, paidFrom, paidTo }),
    [report, today, companyName, showDetail, includePaid, paidFrom, paidTo],
  );

  const fileBase = `Informe_deudas_${(companyName || "todas").replace(/[^\w-]+/g, "_")}_${today}`;

  const run = async (kind, fn) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(err.message || String(err));
    } finally {
      setBusy("");
    }
  };

  const downloadPdf = () => run("pdf", () => writeReportPdf(doc, fileBase));
  const downloadXlsx = () => run("xlsx", () => writeReportXlsx(report, { today, companyName, includePaid, paidFrom, paidTo, fileBase }));

  return (
    <Modal
      open
      size="2xl"
      onClose={onClose}
      title="Informe de deudas"
      footer={
        <>
          <button
            type="button"
            className="min-h-8 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            onClick={downloadPdf}
            disabled={!!busy}
          >
            {busy === "pdf" ? "Generando…" : "📄 Descargar PDF"}
          </button>
          <button type="button" className={btnCls} onClick={downloadXlsx} disabled={!!busy}>📊 Excel</button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-muted)]">Empresa</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputCls}>
            <option value="">Todas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.alias || c.razonSocial}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-muted)]">Vencimientos hasta</span>
          <input
            type="date"
            value={dueUntil}
            onChange={(e) => setDueUntil(e.target.value)}
            className={inputCls}
            title="Lo que vence después se resume en una fila. Vacío: sin límite."
          />
        </label>
        <label className="flex min-h-8 items-center gap-2">
          <input type="checkbox" checked={showDetail} onChange={(e) => setShowDetail(e.target.checked)} />
          Detalle de cada pago pendiente
        </label>
        <label className="flex min-h-8 items-center gap-2">
          <input type="checkbox" checked={includePaid} onChange={(e) => setIncludePaid(e.target.checked)} />
          Incluir pagos realizados
        </label>
        {includePaid && (
          <div className="flex items-center gap-2">
            <input type="date" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)} className={inputCls} title="Pagados desde" />
            <span className="text-[var(--color-muted)]">a</span>
            <input type="date" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} className={inputCls} title="Pagados hasta" />
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[#e5e7eb] p-2 sm:p-4">
        <ReportPreview doc={doc} />
      </div>
    </Modal>
  );
}

// ── Vista previa (HTML) ─────────────────────────────────────────────────────

// Una hoja A4 aproximada, con la misma tipografía y colores que el PDF.
const S = {
  page: {
    background: "#ffffff",
    color: "#111827",
    padding: "28px 32px",
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: 11,
    minWidth: 640,
    maxWidth: 800,
    margin: "0 auto",
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
  },
  h1: { fontSize: 20, fontWeight: 700, margin: 0 },
  sub: { color: "#4b5563", marginTop: 2 },
  h2: { fontSize: 14, fontWeight: 700, margin: "20px 0 6px" },
  h3: { fontSize: 12, fontWeight: 700, margin: "12px 0 5px" },
  p: { margin: "6px 0" },
  table: { borderCollapse: "collapse", width: "100%" },
  th: { background: "#374151", color: "#ffffff", textAlign: "left", padding: "4px 6px", border: "1px solid #374151", fontWeight: 700 },
  td: { padding: "4px 6px", border: "1px solid #d1d5db", verticalAlign: "top" },
  num: { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  total: { background: "#f3f4f6", fontWeight: 700 },
  small: { color: "#6b7280", fontSize: 10 },
};
const TONE_COLOR = { danger: "#b91c1c", warn: "#b45309" };
const TONE_TINT = { danger: "#fef2f2", warn: "#fffbeb" };

function ReportPreview({ doc }) {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>{doc.title}</h1>
      <div style={S.sub}>{doc.subtitle}</div>
      {doc.blocks.map((b, i) => {
        if (b.kind === "h2") return <h2 key={i} style={S.h2}>{b.text}</h2>;
        if (b.kind === "h3") return <h3 key={i} style={S.h3}>{b.text}</h3>;
        if (b.kind === "p") return <p key={i} style={{ ...S.p, ...(b.muted ? { color: "#6b7280" } : {}) }}>{b.text}</p>;
        return <PreviewTable key={i} table={b} />;
      })}
    </div>
  );
}

function PreviewTable({ table }) {
  return (
    <table style={S.table}>
      <thead>
        <tr>
          {table.columns.map((col) => (
            <th key={col.label} style={{ ...S.th, ...(col.num ? { textAlign: "right" } : {}), ...(col.width ? { width: `${col.width}mm` } : {}) }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r} style={row.total ? S.total : row.tone ? { background: TONE_TINT[row.tone] } : undefined}>
            {row.cells.map((raw, i) => {
              const cell = cellOf(raw);
              const tone = cell.tone || (i === 0 ? row.tone : "");
              const subTone = cell.subTone || cell.tone;
              return (
                <td key={i} style={{ ...S.td, ...(table.columns[i]?.num ? S.num : {}) }}>
                  <span style={{ fontWeight: cell.bold || row.bold ? 700 : undefined, color: TONE_COLOR[tone] || (cell.muted ? "#6b7280" : undefined) }}>
                    {cell.text}
                  </span>
                  {cell.sub && <div style={{ ...S.small, ...(TONE_COLOR[subTone] ? { color: TONE_COLOR[subTone] } : {}) }}>{cell.sub}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── PDF ─────────────────────────────────────────────────────────────────────

// A4 vertical con jsPDF + jspdf-autotable, cargados lazy: texto seleccionable,
// el encabezado de cada tabla se repite al cambiar de hoja y cada hoja lleva al
// pie el título y "Página N de M". Helvetica cubre tildes, ñ, "°" y "·".
const RGB = {
  text: [17, 24, 39],
  muted: [107, 114, 128],
  head: [55, 65, 81],
  line: [209, 213, 219],
  total: [243, 244, 246],
  danger: [185, 28, 28],
  warn: [180, 83, 9],
  dangerTint: [254, 242, 242],
  warnTint: [255, 251, 235],
};

async function writeReportPdf(doc, fileBase) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const M = 15;
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const bottom = H - M - 6;
  let y = M + 4;

  const font = (size, style = "normal", color = RGB.text) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };
  // Salta de hoja si no caben `mm` más; así un título no queda solo al pie.
  const ensure = (mm) => {
    if (y + mm > bottom) {
      pdf.addPage();
      y = M + 4;
    }
  };
  const lines = (text, size) => {
    font(size);
    return pdf.splitTextToSize(text, W - 2 * M);
  };

  font(16, "bold");
  pdf.text(doc.title, M, y);
  y += 6;
  const sub = lines(doc.subtitle, 9);
  font(9, "normal", RGB.muted);
  pdf.text(sub, M, y);
  y += sub.length * 4 + 2;

  for (const b of doc.blocks) {
    if (b.kind === "h2") {
      ensure(24);
      y += 6;
      font(12, "bold");
      pdf.text(b.text, M, y);
      y += 3;
    } else if (b.kind === "h3") {
      ensure(18);
      y += 2;
      font(10, "bold");
      pdf.text(b.text, M, y);
      y += 2.5;
    } else if (b.kind === "p") {
      const ls = lines(b.text, 9);
      ensure(ls.length * 4 + 3);
      y += 3;
      font(9, "normal", b.muted ? RGB.muted : RGB.text);
      pdf.text(ls, M, y);
      y += (ls.length - 1) * 4 + 2;
    } else {
      autoTable(pdf, {
        startY: y + 1,
        margin: { left: M, right: M, top: M, bottom: M + 6 },
        head: [b.columns.map((c) => c.label)],
        body: b.rows.map((row) =>
          row.cells.map((raw) => {
            const cell = cellOf(raw);
            return cell.sub ? `${cell.text}\n${cell.sub}` : String(cell.text);
          }),
        ),
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8, cellPadding: 1.5, lineColor: RGB.line, lineWidth: 0.2, textColor: RGB.text, valign: "top" },
        headStyles: { fillColor: RGB.head, textColor: 255, fontStyle: "bold" },
        columnStyles: Object.fromEntries(
          b.columns.map((c, i) => [i, { ...(c.num ? { halign: "right" } : {}), ...(c.width ? { cellWidth: c.width } : {}) }]),
        ),
        didParseCell: (data) => {
          if (data.section === "head") {
            if (b.columns[data.column.index]?.num) data.cell.styles.halign = "right";
            return;
          }
          const row = b.rows[data.row.index];
          const cell = cellOf(row.cells[data.column.index]);
          if (row.total) {
            data.cell.styles.fillColor = RGB.total;
            data.cell.styles.fontStyle = "bold";
          } else if (row.tone) {
            data.cell.styles.fillColor = RGB[`${row.tone}Tint`];
          }
          if (row.bold || cell.bold) data.cell.styles.fontStyle = "bold";
          const tone = cell.tone || cell.subTone || (data.column.index === 0 ? row.tone : "");
          if (tone) data.cell.styles.textColor = RGB[tone];
          else if (cell.muted) data.cell.styles.textColor = RGB.muted;
        },
      });
      y = pdf.lastAutoTable.finalY + 2;
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    font(8, "normal", RGB.muted);
    pdf.text(`${doc.title} · ${doc.subtitle}`, M, H - 8, { maxWidth: W - 2 * M - 30 });
    pdf.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: "right" });
  }
  pdf.save(`${fileBase}.pdf`);
}

// ── Excel ───────────────────────────────────────────────────────────────────

// Convención del proyecto: columna A vacía de ancho 6 y fila 1 vacía. Cada
// hoja abre con su título en B2, el subtítulo en B3 y la tabla desde la fila 5.
async function writeReportXlsx(report, { today, companyName, includePaid, paidFrom, paidTo, fileBase }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const MONEY = '"$"#,##0';
  const { totals } = report;
  const subtitle = reportSubtitle(report, { today, companyName });

  const sheet = (name, title, columns, rows, totalRow) => {
    const ws = wb.addWorksheet(name);
    ws.getColumn(1).width = 6;
    ws.getCell("B2").value = title;
    ws.getCell("B2").font = { bold: true, size: 14 };
    ws.getCell("B3").value = subtitle;
    ws.getCell("B3").font = { color: { argb: "FF4B5563" } };
    columns.forEach((col, i) => {
      const cell = ws.getRow(5).getCell(i + 2);
      cell.value = col.label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
      ws.getColumn(i + 2).width = col.width || 14;
    });
    const all = totalRow ? [...rows, totalRow] : rows;
    all.forEach((values, r) => {
      const row = ws.getRow(6 + r);
      values.forEach((v, i) => {
        const cell = row.getCell(i + 2);
        cell.value = v;
        if (columns[i].money) cell.numFmt = MONEY;
      });
      if (totalRow && r === all.length - 1) row.font = { bold: true };
    });
    return ws;
  };

  // Columnas de lo que se debe sin fecha vigente, solo si hay algo.
  const stateKeys = ["postponed", "overdue", "protested"].filter((k) => k === "overdue" || totals[k].count > 0);
  const STATE_HEAD = { overdue: "Vencido", protested: "Protestado", postponed: "Aplazado" };

  sheet(
    "Balance",
    "Balance de deudas",
    [
      { label: "Deuda", width: 30 },
      { label: "Tipo", width: 22 },
      { label: "Pendientes", width: 12 },
      { label: "Saldo", money: true, width: 16 },
      ...stateKeys.map((k) => ({ label: STATE_HEAD[k], money: true })),
      { label: "Próximo pago", width: 14 },
      { label: "Queda pagada", width: 32 },
    ],
    report.debts.map((d) => [
      d.counterparty,
      [debtLabel(d), d.concept].filter(Boolean).join(" · "),
      debtCount(d),
      d.pending.total,
      ...stateKeys.map((k) => d[k].total),
      fmtDate(d.nextDue),
      behindTag(d) ? `${debtPayoff(d)} (${behindTag(d)})` : debtPayoff(d),
    ]),
    [
      "Total",
      "",
      totals.pending.count,
      totals.pending.total,
      ...stateKeys.map((k) => totals[k].total),
      "",
      [report.payoffDate ? fmtDate(report.payoffDate) : "", totals.behind.count ? `(${behindLabel(totals.behind.count, "pago")})` : ""]
        .filter(Boolean)
        .join(" "),
    ],
  );

  sheet(
    "Por mes",
    "Vencimientos por mes",
    [{ label: "Mes", width: 22 }, { label: "Pagos", width: 10 }, { label: "Total del mes", money: true, width: 16 }],
    report.months.map((m) => [m.month === "later" ? laterText(report) : monthLabel(m.month), m.count, m.total]),
  );

  sheet(
    "Pendientes",
    "Detalle de pagos pendientes",
    [
      { label: "Vence", width: 12 },
      { label: "Situación", width: 12 },
      { label: "Tipo", width: 18 },
      { label: "A quién", width: 28 },
      { label: "Detalle", width: 36 },
      { label: "Monto", money: true, width: 16 },
    ],
    [
      ...report.detail.map((c) => [
        fmtDate(c.dueDate),
        STATE_NOTE[debtState(c, today)] || "",
        kindMeta(c.kind).label,
        c.counterparty,
        itemDetail(c),
        remainingOf(c),
      ]),
      ...(totals.later.count
        ? [["Más adelante", "", "", "", laterDetail(report), totals.later.total]]
        : []),
    ],
    ["Total", "", "", "", "", totals.pending.total],
  );

  if (includePaid) {
    sheet(
      "Pagados",
      `Pagos realizados · ${fmtDate(paidFrom) || "inicio"} a ${fmtDate(paidTo) || "hoy"}`,
      [
        { label: "Pagado el", width: 12 },
        { label: "Vencía", width: 12 },
        { label: "Tipo", width: 18 },
        { label: "A quién", width: 28 },
        { label: "Detalle", width: 36 },
        { label: "Monto original", money: true, width: 16 },
        { label: "Interés / extra", money: true, width: 16 },
        { label: "Total pagado", money: true, width: 16 },
      ],
      report.paid.map((c) => [
        fmtDate(c.paidAt),
        fmtDate(c.dueDate),
        kindMeta(c.kind).label,
        c.counterparty,
        itemDetail(c),
        Number(c.amount) || 0,
        extraOf(c),
        paidTotalOf(c),
      ]),
      ["Total", "", "", "", "", totals.paid.amount, totals.paid.extra, totals.paid.total],
    );
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
