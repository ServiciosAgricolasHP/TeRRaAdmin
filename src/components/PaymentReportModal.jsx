import { forwardRef, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { useToast } from "../contexts/ToastContext";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../utils/imageCapture";
import { buildPaymentReport, kindMeta, extraOf, paidTotalOf, debtState, partialPaidOf, remainingOf } from "../utils/commitments";
import { bankName } from "../utils/banks";
import { fmtCurrency } from "../utils/format";

// Informe de pagos de Cheques y pagos: lo que se debe, el balance de cada
// deuda con la fecha en que queda pagada y lo que vence cada mes.
// Opcionalmente, los pagos ya hechos en un rango, con el interés pagado aparte.
// La vista previa es el mismo nodo que se copia, descarga e imprime.

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Filas de "Pagos por mes" que no son un mes.
const SPECIAL_ROWS = {
  overdue: "Vencido sin pagar",
  protested: "Cheques protestados",
  postponed: "Aplazado (sin fecha)",
};

// Cómo se rotula un pago que se debe sin fecha vigente.
const STATE_NOTE = { overdue: "vencido", protested: "protestado", postponed: "aplazado" };

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const monthLabel = (key) => {
  if (SPECIAL_ROWS[key]) return SPECIAL_ROWS[key];
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTHS[m - 1] || key} ${y}`;
};

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

// Lo que se debe de una deuda sin una fecha vigente: vencido, protestado o
// aplazado.
function debtNotes(d, money) {
  return ["overdue", "protested", "postponed"]
    .filter((k) => d[k].count > 0)
    .map((k) => ({ key: k, text: `${STATE_NOTE[k]} ${money(d[k].total)}` }));
}

function payoffNote(report, money) {
  const { totals, hasRecurring } = report;
  return [
    hasRecurring ? "sin contar los pagos recurrentes" : "",
    totals.behind.count ? `con ${behindLabel(totals.behind.count, "pago")} por ${money(totals.behind.total)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

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

export default function PaymentReportModal({ items, companies, today, onClose }) {
  const toast = useToast();
  const printRef = useRef(null);
  const [companyId, setCompanyId] = useState("");
  const [includePaid, setIncludePaid] = useState(false);
  const [paidFrom, setPaidFrom] = useState(`${today.slice(0, 7)}-01`);
  const [paidTo, setPaidTo] = useState(today);
  const [showDetail, setShowDetail] = useState(true);
  const [busy, setBusy] = useState("");

  const company = companies.find((c) => c.id === companyId);
  const companyName = company ? company.alias || company.razonSocial : "";

  const report = useMemo(() => {
    const scoped = companyId ? items.filter((c) => c.companyId === companyId) : items;
    return buildPaymentReport(scoped, { today, includePaid, paidFrom, paidTo });
  }, [items, companyId, today, includePaid, paidFrom, paidTo]);

  const fileBase = `Informe_pagos_${(companyName || "todas").replace(/[^\w-]+/g, "_")}_${today}`;

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

  const copyImage = () =>
    run("copy", async () => {
      const blob = await captureFullWidthBlob(printRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    });

  const downloadPng = () =>
    run("png", async () => {
      const dataUrl = await captureFullWidthDataUrl(printRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const a = document.createElement("a");
      a.download = `${fileBase}.png`;
      a.href = dataUrl;
      a.click();
    });

  const print = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Informe de pagos</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 16px; color: #000; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
        @media print { @page { margin: 12mm; } }
      </style>
    </head><body>${printRef.current.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  const downloadXlsx = () => run("xlsx", () => writeReportXlsx(report, { today, companyName, includePaid, paidFrom, paidTo, fileBase }));

  return (
    <Modal
      open
      size="2xl"
      onClose={onClose}
      title="Informe de pagos"
      footer={
        <>
          <button type="button" className={btnCls} onClick={copyImage} disabled={!!busy}>📋 Copiar</button>
          <button type="button" className={btnCls} onClick={downloadPng} disabled={!!busy}>📥 PNG</button>
          <button type="button" className={btnCls} onClick={print} disabled={!!busy}>🖨 Imprimir</button>
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
      <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
        <PaymentReport
          ref={printRef}
          report={report}
          today={today}
          companyName={companyName}
          showDetail={showDetail}
          includePaid={includePaid}
          paidFrom={paidFrom}
          paidTo={paidTo}
        />
      </div>
    </Modal>
  );
}

// ── Vista imprimible ────────────────────────────────────────────────────────

const S = {
  page: { background: "#ffffff", color: "#111827", padding: 20, fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: 12, minWidth: 720 },
  h1: { fontSize: 20, fontWeight: 800, margin: 0 },
  sub: { color: "#4b5563", marginTop: 2 },
  h2: { fontSize: 14, fontWeight: 700, margin: "18px 0 6px" },
  table: { borderCollapse: "collapse", width: "100%" },
  th: { background: "#374151", color: "#ffffff", textAlign: "left", padding: "5px 8px", border: "1px solid #374151", fontWeight: 600 },
  td: { padding: "5px 8px", border: "1px solid #d1d5db", verticalAlign: "top" },
  num: { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  total: { background: "#f3f4f6", fontWeight: 700 },
  small: { color: "#6b7280", fontSize: 11 },
  danger: { color: "#b91c1c" },
  warn: { color: "#b45309" },
  cards: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  card: { border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 12px", minWidth: 150 },
  cardLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280" },
  cardValue: { fontSize: 16, fontWeight: 700 },
};

// Color de lo que se debe sin fecha vigente: rojo lo vencido o protestado,
// ámbar lo aplazado.
const stateStyle = (key) => (key === "postponed" ? S.warn : key === "overdue" || key === "protested" ? S.danger : undefined);
const ROW_TINT = { overdue: "#fef2f2", protested: "#fef2f2", postponed: "#fffbeb" };

// Etiqueta de pagos atrasados bajo la fecha en que queda pagada una deuda:
// roja si hay algo vencido o protestado, ámbar si solo hay aplazados.
function BehindTag({ sum, children }) {
  const red = sum.overdue.count > 0 || sum.protested.count > 0;
  return (
    <div>
      <span
        style={{
          display: "inline-block",
          marginTop: 3,
          padding: "1px 7px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 600,
          whiteSpace: "nowrap",
          background: red ? "#fee2e2" : "#fef3c7",
          color: red ? "#b91c1c" : "#92400e",
        }}
      >
        ⚠ {children}
      </span>
    </div>
  );
}

const Th = ({ children, num }) => <th style={{ ...S.th, ...(num ? { textAlign: "right" } : {}) }}>{children}</th>;
const Td = ({ children, num, style }) => <td style={{ ...S.td, ...(num ? S.num : {}), ...style }}>{children}</td>;

function Card({ label, value, note, tone }) {
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={{ ...S.cardValue, ...(stateStyle(tone) || {}) }}>{value}</div>
      {note && <div style={S.small}>{note}</div>}
    </div>
  );
}

const PaymentReport = forwardRef(function PaymentReport(
  { report, today, companyName, showDetail, includePaid, paidFrom, paidTo },
  ref,
) {
  const { totals, debts, months, pending, paid, hasExtra, payoffDate } = report;
  const money = (v) => fmtCurrency(v);

  return (
    <div ref={ref} style={S.page}>
      <h1 style={S.h1}>Informe de pagos</h1>
      <div style={S.sub}>
        {companyName || "Todas las empresas"} · al {fmtDate(today)}
      </div>

      <div style={S.cards}>
        <Card label="Pendiente por pagar" value={money(totals.pending.total)} note={`${totals.pending.count} pago(s)`} />
        <Card label="Vencido sin pagar" value={money(totals.overdue.total)} note={`${totals.overdue.count} pago(s)`} tone={totals.overdue.count ? "overdue" : ""} />
        {totals.protested.count > 0 && (
          <Card label="Cheques protestados" value={money(totals.protested.total)} note={`${totals.protested.count} cheque(s)`} tone="protested" />
        )}
        {totals.postponed.count > 0 && (
          <Card label="Aplazado (sin fecha)" value={money(totals.postponed.total)} note={`${totals.postponed.count} pago(s)`} tone="postponed" />
        )}
        <Card label="Todo pagado al" value={payoffDate ? fmtDate(payoffDate) : "—"} note={payoffNote(report, money)} />
        {includePaid && (
          <Card
            label="Pagado en el período"
            value={money(totals.paid.total)}
            note={`${fmtDate(paidFrom) || "inicio"} a ${fmtDate(paidTo) || "hoy"}${totals.paid.extra ? ` · incluye ${money(totals.paid.extra)} de interés` : ""}`}
          />
        )}
      </div>

      {pending.length === 0 && !includePaid ? (
        <p style={{ marginTop: 16 }}>No hay pagos pendientes.</p>
      ) : null}

      {debts.length > 0 && (
        <>
          <h2 style={S.h2}>Balance de deudas</h2>
          <table style={S.table}>
            <thead>
              <tr>
                <Th>Deuda</Th>
                <Th num>Pendientes</Th>
                <Th num>Saldo</Th>
                <Th>Próximo pago</Th>
                <Th>Queda pagada</Th>
              </tr>
            </thead>
            <tbody>
              {debts.map((d) => (
                <tr key={d.key}>
                  <Td>
                    <b>{d.counterparty}</b>
                    {(debtLabel(d) || d.concept) && <div style={S.small}>{[debtLabel(d), d.concept].filter(Boolean).join(" · ")}</div>}
                  </Td>
                  <Td num>
                    {debtCount(d)}
                    {d.paid.count > 0 && <div style={S.small}>{d.paid.count} pagada(s)</div>}
                  </Td>
                  <Td num><b>{money(d.pending.total)}</b></Td>
                  <Td>
                    {fmtDate(d.nextDue) || "—"}
                    {debtNotes(d, money).map((n) => (
                      <div key={n.key} style={{ ...S.small, ...stateStyle(n.key) }}>{n.text}</div>
                    ))}
                  </Td>
                  <Td>
                    {debtPayoff(d)}
                    {behindTag(d) && <BehindTag sum={d}>{behindTag(d)}</BehindTag>}
                  </Td>
                </tr>
              ))}
              <tr style={S.total}>
                <Td>Total</Td>
                <Td num>{totals.pending.count}</Td>
                <Td num>{money(totals.pending.total)}</Td>
                <Td />
                <Td>
                  {payoffDate ? fmtDate(payoffDate) : ""}
                  {totals.behind.count > 0 && <BehindTag sum={totals}>{behindLabel(totals.behind.count, "pago")}</BehindTag>}
                </Td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {months.length > 0 && (
        <>
          <h2 style={S.h2}>Pagos por mes</h2>
          <table style={S.table}>
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th num>Pagos</Th>
                <Th num>Total del mes</Th>
                <Th num>Saldo después</Th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} style={ROW_TINT[m.month] ? { background: ROW_TINT[m.month] } : undefined}>
                  <Td style={stateStyle(m.month)}>{monthLabel(m.month)}</Td>
                  <Td num>{m.count}</Td>
                  <Td num><b>{money(m.total)}</b></Td>
                  <Td num>{money(m.remainingAfter)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {showDetail && pending.length > 0 && (
        <>
          <h2 style={S.h2}>Detalle de pagos pendientes</h2>
          <table style={S.table}>
            <thead>
              <tr>
                <Th>Vence</Th>
                <Th>Tipo</Th>
                <Th>A quién</Th>
                <Th>Detalle</Th>
                <Th num>Monto</Th>
              </tr>
            </thead>
            <tbody>
              {pending.map((c) => {
                const state = debtState(c, today);
                return (
                  <tr key={c.id}>
                    <Td style={stateStyle(state)}>
                      {fmtDate(c.dueDate)}
                      {STATE_NOTE[state] && <div style={S.small}>{STATE_NOTE[state]}</div>}
                    </Td>
                    <Td>{kindMeta(c.kind).label}</Td>
                    <Td>{c.counterparty}</Td>
                    <Td><span style={S.small}>{itemDetail(c)}</span></Td>
                    <Td num>{money(remainingOf(c))}</Td>
                  </tr>
                );
              })}
              <tr style={S.total}>
                <Td>Total</Td>
                <Td />
                <Td />
                <Td />
                <Td num>{money(totals.pending.total)}</Td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {includePaid && (
        <>
          <h2 style={S.h2}>
            Pagos realizados · {fmtDate(paidFrom) || "inicio"} a {fmtDate(paidTo) || "hoy"}
          </h2>
          {paid.length === 0 ? (
            <p>Sin pagos en el período.</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <Th>Pagado el</Th>
                  <Th>Vencía</Th>
                  <Th>Tipo</Th>
                  <Th>A quién</Th>
                  <Th>Detalle</Th>
                  {hasExtra && <Th num>Monto original</Th>}
                  {hasExtra && <Th num>Interés / extra</Th>}
                  <Th num>{hasExtra ? "Total pagado" : "Monto"}</Th>
                </tr>
              </thead>
              <tbody>
                {paid.map((c) => (
                  <tr key={c.id}>
                    <Td>{fmtDate(c.paidAt) || "—"}</Td>
                    <Td>{fmtDate(c.dueDate)}</Td>
                    <Td>{kindMeta(c.kind).label}</Td>
                    <Td>{c.counterparty}</Td>
                    <Td><span style={S.small}>{itemDetail(c)}</span></Td>
                    {hasExtra && <Td num>{money(c.amount)}</Td>}
                    {hasExtra && <Td num>{extraOf(c) ? money(extraOf(c)) : "—"}</Td>}
                    <Td num>{money(paidTotalOf(c))}</Td>
                  </tr>
                ))}
                <tr style={S.total}>
                  <Td>Total</Td>
                  <Td />
                  <Td />
                  <Td />
                  <Td />
                  {hasExtra && <Td num>{money(totals.paid.amount)}</Td>}
                  {hasExtra && <Td num>{money(totals.paid.extra)}</Td>}
                  <Td num>{money(totals.paid.total)}</Td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
});

// ── Excel ───────────────────────────────────────────────────────────────────

// Convención del proyecto: columna A vacía de ancho 6 y fila 1 vacía. Cada
// hoja abre con su título en B2, el subtítulo en B3 y la tabla desde la fila 5.
async function writeReportXlsx(report, { today, companyName, includePaid, paidFrom, paidTo, fileBase }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const MONEY = '"$"#,##0';
  const { totals } = report;
  const subtitle = `${companyName || "Todas las empresas"} · al ${fmtDate(today)}`;

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
  const stateKeys = ["overdue", "protested", "postponed"].filter((k) => k === "overdue" || totals[k].count > 0);
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
    "Pagos por mes",
    [{ label: "Mes", width: 22 }, { label: "Pagos", width: 10 }, { label: "Total del mes", money: true, width: 16 }, { label: "Saldo después", money: true, width: 16 }],
    report.months.map((m) => [monthLabel(m.month), m.count, m.total, m.remainingAfter]),
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
    report.pending.map((c) => [
      fmtDate(c.dueDate),
      STATE_NOTE[debtState(c, today)] || "",
      kindMeta(c.kind).label,
      c.counterparty,
      itemDetail(c),
      remainingOf(c),
    ]),
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
