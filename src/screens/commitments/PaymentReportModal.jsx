import { useState, useMemo } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import { nextYearEnd, buildPaymentReport } from "../../utils/commitments";
import { reportDocument } from "./paymentReportModal/reportDocument";
import { ReportPreview } from "./paymentReportModal/ReportPreview";
import { writeReportPdf } from "./paymentReportModal/writeReportPdf";
import { writeReportXlsx } from "./paymentReportModal/writeReportXlsx";

// Informe de deudas de Cheques y pagos, como documento PDF: resumen, balance de
// cada deuda con la fecha en que queda pagada, lo que vence en los próximos 7
// días y el próximo mes, los vencimientos por mes (detallados hasta una fecha,
// por defecto fin del año siguiente) y, si se piden, el detalle de cada pago
// pendiente y los pagos hechos en un rango. El contenido lo arma una sola vez
// `reportDocument`, y lo dibujan igual la vista previa (HTML) y el PDF.

const btnCls =
  "min-h-8 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50";

const inputCls =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]";

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
