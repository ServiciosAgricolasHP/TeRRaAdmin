// El informe de deudas como documento (títulos, párrafos y tablas), y los
// formatos que comparten la vista previa, el PDF y el Excel.
import { partialPaidOf, debtState, kindMeta, remainingOf, extraOf, paidTotalOf } from "../../../utils/commitments";
import { bankName } from "../../../utils/banks";
import { fmtCurrency } from "../../../utils/format";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Filas de "Vencimientos por mes" que no son un mes.
const SPECIAL_ROWS = {
  overdue: "Vencido sin pagar",
  protested: "Cheques protestados",
  postponed: "Aplazado (sin fecha)",
};

// Cómo se rotula un pago que se debe sin fecha vigente, y su color.
export const STATE_NOTE = { overdue: "vencido", protested: "protestado", postponed: "aplazado" };

const STATE_TONE = { overdue: "danger", protested: "danger", postponed: "warn" };

export const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

export const monthLabel = (key) => {
  if (SPECIAL_ROWS[key]) return SPECIAL_ROWS[key];
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTHS[m - 1] || key} ${y}`;
};

export function debtLabel(d) {
  if (d.recurring) return "Pago recurrente";
  if (d.kind === "personalDebt") return d.installments ? `Deuda personal en ${d.installments} cuotas` : "Deuda personal";
  if (d.installments) return `Crédito en ${d.installments} cuotas`;
  return "";
}

export function debtCount(d) {
  if (d.installments) return `${d.pending.count} de ${d.installments}`;
  return String(d.pending.count);
}

// Cuándo queda pagada una deuda: nunca si es recurrente y si no, con su último
// vencimiento, aunque tenga pagos atrasados (eso lo dice `behindTag`).
export function debtPayoff(d) {
  if (d.recurring) return "Sin término";
  return fmtDate(d.payoffDate) || "—";
}

// "2 cuotas atrasadas" en un crédito, "1 pago atrasado" en lo demás. Atrasado
// es todo lo que se debe sin una fecha vigente: vencido, aplazado o protestado.
export function behindLabel(count, noun) {
  const many = count === 1 ? "" : "s";
  return `${count} ${noun}${many} ${noun === "cuota" ? "atrasada" : "atrasado"}${many}`;
}

export function behindTag(d) {
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
    .map((k) => `${STATE_NOTE[k]} ${fmtCurrency(d[k].total)}`)
    .join(" · ");
}

function payoffNote(report) {
  const { totals, hasRecurring } = report;
  return [
    hasRecurring ? "sin contar los pagos recurrentes" : "",
    totals.behind.count ? `con ${behindLabel(totals.behind.count, "pago")} por ${fmtCurrency(totals.behind.total)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

// "Todas las empresas · al 17-10-2026 · vencimientos hasta el 31-12-2027".
export function reportSubtitle(report, { today, companyName }) {
  return [companyName || "Todas las empresas", `al ${fmtDate(today)}`, report.dueUntil ? `vencimientos hasta el ${fmtDate(report.dueUntil)}` : ""]
    .filter(Boolean)
    .join(" · ");
}

const paymentsLabel = (n) => `${n} pago${n === 1 ? "" : "s"}`;

// Lo que vence después del corte: desde cuándo y hasta su último vencimiento.
function laterCell(report) {
  return { text: `Después del ${fmtDate(report.dueUntil)}`, sub: report.laterEnd ? `hasta el ${fmtDate(report.laterEnd)}` : "" };
}

export const laterText = (report) => [laterCell(report).text, laterCell(report).sub].filter(Boolean).join(", ");

// Fila del detalle: la fecha va en el detalle, que es la columna ancha.
export const laterDetail = (report) => `${paymentsLabel(report.totals.later.count)} ${laterText(report).replace(/^Después/, "después")}, sin detalle`;

// Lo mismo para una contraparte: sus pagos de después del corte.
export const groupLaterDetail = (report, g) =>
  `${paymentsLabel(g.later.count)} después del ${fmtDate(report.dueUntil)}${g.laterEnd ? `, hasta el ${fmtDate(g.laterEnd)}` : ""}, sin detalle`;

export const counterpartyTitle = (g) => g.name || "Sin contraparte";

export function itemDetail(c) {
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

// Por contraparte, el nombre va en el título de cada tabla.
const PARTY_ITEM_COLUMNS = ITEM_COLUMNS.filter((col) => col.label !== "A quién");

function itemRows(list, today, { withCounterparty = true } = {}) {
  return list.map((c) => {
    const state = debtState(c, today);
    return {
      cells: [
        { text: fmtDate(c.dueDate), sub: STATE_NOTE[state] || "", tone: STATE_TONE[state] },
        kindMeta(c.kind).label,
        ...(withCounterparty ? [c.counterparty] : []),
        { text: itemDetail(c), muted: true },
        fmtCurrency(remainingOf(c)),
      ],
    };
  });
}

export function reportDocument(report, { today, companyName, showDetail, byCounterparty, includePaid, paidFrom, paidTo }) {
  const { totals, debts, months, pending, detail, paid, hasExtra, payoffDate, upcoming } = report;
  const blocks = [];
  const h2 = (text) => blocks.push({ kind: "h2", text });
  const h3 = (text) => blocks.push({ kind: "h3", text });
  const p = (text, muted = false) => blocks.push({ kind: "p", text, muted });
  const table = (columns, rows) => blocks.push({ kind: "table", columns, rows });
  const totalRow = (cells) => ({ cells, total: true });
  const sumRow = (label, sum, tone) => ({ cells: [label, String(sum.count), fmtCurrency(sum.total)], tone });
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
  if (includePaid && totals.paid.extra) p(`Lo pagado en el período incluye ${fmtCurrency(totals.paid.extra)} de interés.`, true);

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
            { text: fmtCurrency(d.pending.total), bold: true },
            { text: fmtDate(d.nextDue) || "—", sub: debtNotes(d), subTone: behindTone(d) },
            { text: debtPayoff(d), sub: behindTag(d), subTone: behindTone(d) },
          ],
        })),
        totalRow([
          "Total",
          String(totals.pending.count),
          fmtCurrency(totals.pending.total),
          "",
          { text: payoffDate ? fmtDate(payoffDate) : "", sub: totals.behind.count ? behindLabel(totals.behind.count, "pago") : "", subTone: behindTone(totals) },
        ]),
      ],
    );
  }

  if (pending.length > 0) {
    h2("Próximos vencimientos");
    const nearGroup = (title, list, sum, emptyText) => {
      h3(`${title} · ${fmtCurrency(sum.total)}`);
      if (list.length === 0) p(emptyText, true);
      else table(ITEM_COLUMNS, [...itemRows(list, today), totalRow(["Total", "", "", "", fmtCurrency(sum.total)])]);
    };
    nearGroup(`Próximos 7 días (hasta el ${fmtDate(upcoming.weekEnd)})`, upcoming.week, upcoming.weekTotal, "Nada vence en los próximos 7 días.");
    nearGroup(`Próximo mes (hasta el ${fmtDate(upcoming.monthEnd)})`, upcoming.month, upcoming.monthTotal, "Nada más vence en el próximo mes.");
  }

  if (months.length > 0) {
    h2("Vencimientos por mes");
    table(
      [{ label: "Mes" }, { label: "Pagos", num: true, width: 22 }, { label: "Total del mes", num: true, width: 34 }],
      months.map((m) => ({
        cells: [m.month === "later" ? laterCell(report) : monthLabel(m.month), String(m.count), { text: fmtCurrency(m.total), bold: true }],
        tone: STATE_TONE[m.month],
      })),
    );
  }

  // Por contraparte: una tabla por cada una, con sus pagos por fecha y lo que
  // vence después del corte en una fila.
  if (showDetail && byCounterparty && pending.length > 0) {
    h2("Detalle de pagos pendientes por contraparte");
    for (const g of report.byCounterparty) {
      h3(`${counterpartyTitle(g)} · ${paymentsLabel(g.total.count)} · ${fmtCurrency(g.total.total)}`);
      const rows = [
        ...itemRows(g.items, today, { withCounterparty: false }),
        ...(g.later.count ? [{ cells: ["Más adelante", "", { text: groupLaterDetail(report, g), muted: true }, fmtCurrency(g.later.total)] }] : []),
      ];
      table(PARTY_ITEM_COLUMNS, rows.length > 1 ? [...rows, totalRow(["Total", "", "", fmtCurrency(g.total.total)])] : rows);
    }
    p(`Total pendiente: ${paymentsLabel(totals.pending.count)} por ${fmtCurrency(totals.pending.total)}.`);
  } else if (showDetail && pending.length > 0) {
    h2("Detalle de pagos pendientes");
    table(ITEM_COLUMNS, [
      ...itemRows(detail, today),
      ...(totals.later.count
        ? [{ cells: ["Más adelante", "", "", { text: laterDetail(report), muted: true }, fmtCurrency(totals.later.total)] }]
        : []),
      totalRow(["Total", "", "", "", fmtCurrency(totals.pending.total)]),
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
              ...(hasExtra ? [fmtCurrency(c.amount), extraOf(c) ? fmtCurrency(extraOf(c)) : "—"] : []),
              fmtCurrency(paidTotalOf(c)),
            ],
          })),
          totalRow(["Total", "", "", "", "", ...(hasExtra ? [fmtCurrency(totals.paid.amount), fmtCurrency(totals.paid.extra)] : []), fmtCurrency(totals.paid.total)]),
        ],
      );
  }

  return { title: "Informe de deudas", subtitle: reportSubtitle(report, { today, companyName }), blocks };
}

export const cellOf = (c) => (c && typeof c === "object" ? c : { text: c ?? "" });
