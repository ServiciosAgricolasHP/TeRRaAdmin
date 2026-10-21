import { debtState, kindMeta, remainingOf, extraOf, paidTotalOf } from "../../../utils/commitments";
import {
  reportSubtitle,
  debtLabel,
  debtCount,
  fmtDate,
  behindTag,
  debtPayoff,
  behindLabel,
  laterText,
  monthLabel,
  STATE_NOTE,
  itemDetail,
  laterDetail,
  groupLaterDetail,
  counterpartyTitle,
} from "./reportDocument";

// Convención del proyecto: columna A vacía de ancho 6 y fila 1 vacía. Cada
// hoja abre con su título en B2, el subtítulo en B3 y la tabla desde la fila 5.
// Una fila es la lista de valores, o `{ values, bold }` para un subtotal.
export async function writeReportXlsx(report, { today, companyName, byCounterparty, includePaid, paidFrom, paidTo, fileBase }) {
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
    all.forEach((entry, r) => {
      const values = Array.isArray(entry) ? entry : entry.values;
      const row = ws.getRow(6 + r);
      values.forEach((v, i) => {
        const cell = row.getCell(i + 2);
        cell.value = v;
        if (columns[i].money) cell.numFmt = MONEY;
      });
      if (entry.bold || (totalRow && r === all.length - 1)) row.font = { bold: true };
    });
    return ws;
  };

  sheet(
    "Por mes",
    "Vencimientos por mes",
    [{ label: "Mes", width: 22 }, { label: "Pagos", width: 10 }, { label: "Total del mes", money: true, width: 16 }],
    report.months.map((m) => [m.month === "later" ? laterText(report) : monthLabel(m.month), m.count, m.total]),
  );

  const pendingRow = (c) => [
    fmtDate(c.dueDate),
    STATE_NOTE[debtState(c, today)] || "",
    kindMeta(c.kind).label,
    c.counterparty,
    itemDetail(c),
    remainingOf(c),
  ];
  // Por contraparte, sus pagos por fecha, lo de después del corte y un
  // subtotal; si no, todo por fecha.
  const pendingRows = byCounterparty
    ? report.byCounterparty.flatMap((g) => [
        ...g.items.map(pendingRow),
        ...(g.later.count ? [["Más adelante", "", "", g.name, groupLaterDetail(report, g), g.later.total]] : []),
        { values: ["", "", "", `Total ${counterpartyTitle(g)}`, "", g.total.total], bold: true },
      ])
    : [
        ...report.detail.map(pendingRow),
        ...(totals.later.count ? [["Más adelante", "", "", "", laterDetail(report), totals.later.total]] : []),
      ];
  sheet(
    "Pendientes",
    byCounterparty ? "Detalle de pagos pendientes por contraparte" : "Detalle de pagos pendientes",
    [
      { label: "Vence", width: 12 },
      { label: "Situación", width: 12 },
      { label: "Tipo", width: 18 },
      { label: "A quién", width: 28 },
      { label: "Detalle", width: 36 },
      { label: "Monto", money: true, width: 16 },
    ],
    pendingRows,
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

  // El balance de cada deuda va en la última hoja, como en el PDF.
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

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
