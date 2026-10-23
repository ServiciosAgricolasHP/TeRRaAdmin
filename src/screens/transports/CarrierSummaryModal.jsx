import { useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { captureFullWidthBlob, captureFullWidthDataUrl, cloneForExport } from "../../utils/imageCapture";
import { useToast } from "../../contexts/ToastContext";
import { localIsoDate } from "../../utils/dates";
import { fmtCurrency } from "../../utils/format";
import { carrierSummaryGroups, carrierSummaryTotals } from "../../utils/carrierSummary";
import { useCarrierSummaryData } from "./carrierSummaryModal/useCarrierSummaryData";
import { PrintableCarrierSummary } from "./carrierSummaryModal/PrintableCarrierSummary";

const DEFAULT_TITLE = "RESUMEN DE TRANSPORTE";

// Título y subtítulo editados, por transportista y en este navegador.
const titlesKey = (carrierId) => `carrier_summary_titles_${carrierId}`;

function loadTitles(carrierId) {
  try {
    return JSON.parse(localStorage.getItem(titlesKey(carrierId))) || {};
  } catch {
    return {};
  }
}

function saveTitles(carrierId, titles) {
  try {
    localStorage.setItem(titlesKey(carrierId), JSON.stringify(titles));
  } catch {
    /* noop */
  }
}

const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return localIsoDate(d);
};

// "2026-10-23" → "23-10-2026".
const dmy = (iso) => String(iso || "").split("-").reverse().join("-");

function scopeLabelOf({ includePaid, from, to }) {
  const base = "Lo pendiente y las quincenas abiertas";
  if (!includePaid) return base;
  const paid = from && to ? `del ${dmy(from)} al ${dmy(to)}` : from ? `desde el ${dmy(from)}` : to ? `hasta el ${dmy(to)}` : "";
  return `Lo pendiente, las quincenas abiertas y ${paid ? `lo pagado ${paid}` : "todo lo pagado"}`;
}

// Corre una exportación marcando `kind` como ocupado mientras dura, y avisa si
// falla.
async function runExport(setBusy, toast, kind, task) {
  setBusy(kind);
  try {
    await task();
  } catch (err) {
    toast.error("Error: " + (err.message || err));
  } finally {
    setBusy("");
  }
}

const toggleClass = (on) =>
  `rounded-md border px-2 py-1 ${on ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"}`;
const inputClass = "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs outline-none focus:border-[var(--color-accent)]";
const footerButton = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60";

// Resumen de un transportista para mirar, copiar o imprimir: sus quincenas,
// sus resúmenes sin quincena y sus vueltas sin resumen, con lo pagado y lo
// pendiente (`utils/carrierSummary.js`). Por defecto trae lo pendiente y las
// quincenas abiertas; "Incluir pagados" suma lo pagado en un rango. Se monta
// solo mientras está abierto.
export function CarrierSummaryModal({ carrier, onClose }) {
  const toast = useToast();
  const [showFortnightTrips, setShowFortnightTrips] = useState(false);
  const [includePaid, setIncludePaid] = useState(false);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(() => localIsoDate());
  const [titles, setTitles] = useState(() => loadTitles(carrier.id));
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [busy, setBusy] = useState("");
  const printRef = useRef(null);

  const scope = includePaid ? { includePaid, from, to } : { includePaid: false, from: "", to: "" };
  const { data, loading } = useCarrierSummaryData(carrier.id, scope);
  const groups = useMemo(() => (data ? carrierSummaryGroups(data) : []), [data]);
  const totals = useMemo(() => carrierSummaryTotals(groups), [groups]);
  const refs = data ? { faenaById: data.faenaById, subfaenaById: data.subfaenaById, cycleById: data.cycleById } : {};

  const title = titles.main || DEFAULT_TITLE;
  const subtitle = titles.subtitle ?? (carrier.name || carrier.alias || "");
  const updateTitles = (patch) => {
    const next = { ...titles, ...patch };
    setTitles(next);
    saveTitles(carrier.id, next);
  };

  const fileBase = `resumen_transporte_${String(carrier.alias || "transportista").replace(/\s+/g, "_")}`;
  const canExport = !loading && groups.length > 0;

  const handleCopy = () => runExport(setBusy, toast, "copy", async () => {
    const blob = await captureFullWidthBlob(printRef.current);
    if (!blob) throw new Error("No se pudo generar la imagen");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast.success("Imagen copiada al portapapeles");
  });

  const handleDownload = () => runExport(setBusy, toast, "download", async () => {
    const link = document.createElement("a");
    link.download = `${fileBase}.png`;
    link.href = await captureFullWidthDataUrl(printRef.current);
    link.click();
  });

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = cloneForExport(printRef.current).outerHTML;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Resumen — ${carrier.alias || ""}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        @media print { @page { size: landscape; margin: 12mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`📊 Resumen — ${carrier.alias || carrier.name || ""}`}
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </button>
          <button onClick={handleCopy} disabled={!canExport || busy === "copy"} className={footerButton}>
            {busy === "copy" ? "Copiando..." : "📋 Copiar imagen"}
          </button>
          <button onClick={handleDownload} disabled={!canExport || busy === "download"} className={footerButton}>
            {busy === "download" ? "Descargando..." : "📥 Descargar PNG"}
          </button>
          <button onClick={handlePrint} disabled={!canExport} className={footerButton}>
            🖨 Imprimir
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setShowFortnightTrips((v) => !v)}
          className={toggleClass(showFortnightTrips)}
          title="Suma las vueltas de cada quincena. Los resúmenes sin quincena y las vueltas sin resumen van siempre con sus vueltas."
        >
          {showFortnightTrips ? "✓ " : ""}🚚 Detalle de quincenas
        </button>
        <button
          onClick={() => setIncludePaid((v) => !v)}
          className={toggleClass(includePaid)}
          title="Suma lo ya pagado dentro de un rango de fechas"
        >
          {includePaid ? "✓ " : ""}Incluir pagados
        </button>
        {includePaid && (
          <span className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">desde</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            <span className="text-[var(--color-muted)]">hasta</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </span>
        )}
        <button onClick={() => setShowTitleEditor((v) => !v)} className={toggleClass(false)}>
          {showTitleEditor ? "▾" : "▸"} Personalizar títulos
        </button>
        {loading && data && <span className="text-[var(--color-muted)]">Actualizando…</span>}
        {canExport && (
          <span className="ml-auto text-sm">
            <span className="text-[var(--color-muted)]">Pendiente: </span>
            <span className="font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(totals.pending)}</span>
          </span>
        )}
      </div>

      {showTitleEditor && (
        <div className="mb-3 grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 md:grid-cols-2">
          <label className="block">
            <span className="block text-[10px] text-[var(--color-muted)]">Título principal</span>
            <input
              value={title}
              onChange={(e) => updateTitles({ main: e.target.value })}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] text-[var(--color-muted)]">Subtítulo</span>
            <input
              value={subtitle}
              onChange={(e) => updateTitles({ subtitle: e.target.value })}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </div>
      )}

      {!data ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          {includePaid
            ? "No hay nada pendiente ni pagado en ese rango."
            : "No hay nada pendiente. Con \"Incluir pagados\" se ve lo ya pagado."}
        </div>
      ) : (
        <PrintableCarrierSummary
          ref={printRef}
          carrier={carrier}
          title={title}
          subtitle={subtitle}
          dateLine={`al ${dmy(localIsoDate())}`}
          scopeLabel={scopeLabelOf(scope)}
          groups={groups}
          totals={totals}
          showFortnightTrips={showFortnightTrips}
          refs={refs}
        />
      )}
    </Modal>
  );
}
