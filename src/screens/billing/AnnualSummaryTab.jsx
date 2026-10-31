import { useMemo, useRef } from "react";
import { annualSummary, summaryYearsOf } from "../../utils/billingDocs";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { writeAnnualSummaryXlsx } from "./writeAnnualSummaryXlsx";
import { SummaryCard } from "./SummaryCard";
import { fmtCurrency, fmtNumber } from "../../utils/format";
import { PrintableAnnualSummary } from "./PrintableAnnualSummary";
import { MONTH_NAMES_ES } from "./docs";

// Pestaña "Resumen": los 12 meses del año elegido para la empresa, con el
// balance de IVA (débito − crédito) y sus exportaciones. El año lo guarda la
// pantalla, así se conserva al cambiar de pestaña.
export function AnnualSummaryTab({ docs, selectedCompany, selectedCompanyId, setSummaryYear, summaryYear }) {
  const summaryPrintRef = useRef(null);

  const { busy: summaryBusy, run, copy, download, print } = useCaptureActions();

  const summaryYears = useMemo(() => summaryYearsOf(docs, selectedCompanyId, new Date().getFullYear()), [docs, selectedCompanyId]);

  const summaryData = useMemo(() => annualSummary(docs, selectedCompanyId, summaryYear), [docs, selectedCompanyId, summaryYear]);

  // ===== Export del Resumen anual =====
  const summaryFileBase = useMemo(() => {
    const alias = (selectedCompany?.alias || selectedCompany?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    return `Resumen_${alias}_${summaryYear}`;
  }, [selectedCompany, summaryYear]);

  const handleSummaryCopy = () => copy(summaryPrintRef.current);
  const handleSummaryPng = () => download(summaryPrintRef.current, `${summaryFileBase}.png`);
  const handleSummaryPrint = () =>
    print(summaryPrintRef.current, {
      title: `Resumen ${summaryYear} — ${selectedCompany?.alias || selectedCompany?.razonSocial || ""}`,
      css: PRINT_SHEET_CSS,
      margin: "10mm",
    });

  const handleSummaryXlsx = () =>
    run("xlsx", () => writeAnnualSummaryXlsx({ selectedCompany, summaryData, summaryFileBase, summaryYear }), { error: "No se pudo generar el Excel" });

  const { months, total } = summaryData;
  const annualVat = total.vatDebit - total.vatCredit;
  const exportDisabled = total.salesCount === 0 && total.purchasesCount === 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--color-muted)]">Año</label>
        <select
          value={summaryYear}
          onChange={(e) => setSummaryYear(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
        >
          {summaryYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-1">
          <button onClick={handleSummaryCopy} disabled={summaryBusy === "copy" || exportDisabled} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Copiar como imagen">
            {summaryBusy === "copy" ? "Copiando..." : "📋 Copiar"}
          </button>
          <button onClick={handleSummaryPng} disabled={summaryBusy === "download" || exportDisabled} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Descargar PNG">
            {summaryBusy === "download" ? "..." : "📥 PNG"}
          </button>
          <button onClick={handleSummaryPrint} disabled={exportDisabled} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Imprimir">
            🖨 Imprimir
          </button>
          <button onClick={handleSummaryXlsx} disabled={summaryBusy === "xlsx" || exportDisabled} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Exportar XLSX">
            {summaryBusy === "xlsx" ? "..." : "📊 XLSX"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryCard label="IVA Débito (ventas)" value={fmtCurrency(total.vatDebit)} />
        <SummaryCard label="IVA Crédito (compras)" value={fmtCurrency(total.vatCredit)} />
        <SummaryCard label={annualVat >= 0 ? "IVA a pagar (año)" : "IVA a favor (remanente)"} value={fmtCurrency(Math.abs(annualVat))} highlight />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryCard label="Ventas netas (año)" value={fmtCurrency(total.salesNet)} />
        <SummaryCard label="Compras netas (año)" value={fmtCurrency(total.purchasesNet)} />
        <SummaryCard label="Documentos" value={fmtNumber(total.salesCount + total.purchasesCount)} subtle />
      </div>

      <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <PrintableAnnualSummary ref={summaryPrintRef} data={summaryData} year={summaryYear} company={selectedCompany} />
      </div>

      <div className="overflow-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-2 py-2 text-left">Mes</th>
              <th className="px-2 py-2 text-right">Ventas Neto</th>
              <th className="px-2 py-2 text-right">IVA Débito</th>
              <th className="px-2 py-2 text-right">Compras Neto</th>
              <th className="px-2 py-2 text-right">IVA Crédito</th>
              <th className="px-2 py-2 text-right">IVA a pagar</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, idx) => {
              const monthVat = m.vatDebit - m.vatCredit;
              const empty = m.salesCount === 0 && m.purchasesCount === 0;
              return (
                <tr key={idx} className={`border-t border-[var(--color-border)] ${empty ? "text-[var(--color-muted)]" : ""}`}>
                  <td className="px-2 py-1.5">{MONTH_NAMES_ES[idx]}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(m.salesNet)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(m.vatDebit)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(m.purchasesNet)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(m.vatCredit)}</td>
                  <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${monthVat < 0 ? "text-[var(--color-success)]" : ""}`}>{fmtCurrency(monthVat)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)] font-semibold">
              <td className="px-2 py-2">TOTAL {summaryYear}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtCurrency(total.salesNet)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtCurrency(total.vatDebit)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtCurrency(total.purchasesNet)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtCurrency(total.vatCredit)}</td>
              <td className={`px-2 py-2 text-right tabular-nums ${annualVat < 0 ? "text-[var(--color-success)]" : ""}`}>{fmtCurrency(annualVat)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
