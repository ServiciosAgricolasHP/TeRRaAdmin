import { PrintableDocList } from "./PrintableDocList";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../../utils/imageCapture";
import { formatPeriodPretty, kindTitleLabel } from "./docs";
import { useMemo, useRef, useState } from "react";
import { writeDocListXlsx } from "./writeDocListXlsx";

// Barra del listado de Facturas o Compras: copiar, PNG, imprimir y Excel de lo
// que está filtrado y ordenado, agrupar por centro de costo y abrir la gestión
// de centros. El printable va fuera de pantalla para html-to-image.
export function DocListToolbar({ costCentersById, groupByCostCenter, kindTab, periodFilter, selectedCompany, setCostCentersModalOpen, setGroupByCostCenter, sortedFiltered, toast, totals }) {
  "use no memo";
  // Printable del listado, fuera de pantalla, para html-to-image e impresión.
  const docListPrintRef = useRef(null);
  const [docListBusy, setDocListBusy] = useState("");
  // ===== Export del listado de Facturas / Compras (vista no-retenciones) =====
  // Mismo patrón que Retenciones: el printable se renderiza fuera de pantalla
  // con los mismos datos filtrados y ordenados que la tabla.
  const docListFileBase = useMemo(() => {
    const alias = (selectedCompany?.alias || selectedCompany?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    const kindLabel = kindTab === "venta" ? "Ventas-Facturas" : "Compras";
    const period = periodFilter || "todos";
    return `${kindLabel}_${alias}_${period}`;
  }, [selectedCompany, kindTab, periodFilter]);

  const handleDocListCopy = async () => {
    if (!docListPrintRef.current) return;
    setDocListBusy("copy");
    try {
      const blob = await captureFullWidthBlob(docListPrintRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setDocListBusy("");
    }
  };

  const handleDocListPng = async () => {
    if (!docListPrintRef.current) return;
    setDocListBusy("png");
    try {
      const dataUrl = await captureFullWidthDataUrl(docListPrintRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${docListFileBase}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast.error("Error al generar PNG: " + (err.message || err));
    } finally {
      setDocListBusy("");
    }
  };

  const handleDocListPrint = () => {
    if (!docListPrintRef.current) return;
    const html = docListPrintRef.current.outerHTML;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) { toast.warning("Permite las ventanas emergentes para imprimir."); return; }
    const titleLabel = `${kindTitleLabel(kindTab)} — ${selectedCompany?.alias || selectedCompany?.razonSocial || ""} — ${formatPeriodPretty(periodFilter)}`;
    win.document.write(`<!DOCTYPE html><html><head><title>${titleLabel}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 5px 7px; font-size: 11px; }
        thead th { background: #92d050 !important; text-align: left; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  const handleDocListXlsx = async () => {
    setDocListBusy("xlsx");
    try {
      await writeDocListXlsx({ costCentersById, docListFileBase, groupByCostCenter, kindTab, periodFilter, selectedCompany, sortedFiltered, totals });
    } catch (err) {
      toast.error("Error al generar XLSX: " + (err.message || err));
    } finally {
      setDocListBusy("");
    }
  };
  return (
    <>
    {/* Toolbar de export para Facturas / Compras (mismo patrón que
        Retenciones). Captura el listado tal cual está filtrado y ordenado. */}
    <div className="mb-2 flex flex-wrap gap-1">
      <button
        onClick={handleDocListCopy}
        disabled={docListBusy === "copy" || sortedFiltered.length === 0}
        className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
        title="Copiar tabla como imagen"
      >
        {docListBusy === "copy" ? "Copiando..." : "📋 Copiar"}
      </button>
      <button
        onClick={handleDocListPng}
        disabled={docListBusy === "png" || sortedFiltered.length === 0}
        className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
        title="Descargar como PNG"
      >
        {docListBusy === "png" ? "..." : "📥 PNG"}
      </button>
      <button
        onClick={handleDocListPrint}
        disabled={sortedFiltered.length === 0}
        className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
        title="Imprimir"
      >
        🖨 Imprimir
      </button>
      <button
        onClick={handleDocListXlsx}
        disabled={docListBusy === "xlsx" || sortedFiltered.length === 0}
        className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
        title="Exportar XLSX"
      >
        {docListBusy === "xlsx" ? "..." : "📊 XLSX"}
      </button>
      <button
        onClick={() => setGroupByCostCenter((v) => !v)}
        className={`min-h-[32px] rounded-md border px-2 py-1 text-xs ${
          groupByCostCenter
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
        }`}
        title={groupByCostCenter
          ? "Esta tabla y su exportación están agrupadas por centro de costo (combustibles juntos, resto por proveedor). Click para volver a la vista plana."
          : "Agrupar ESTA tabla y su exportación por centro de costo: combustibles como un grupo aparte y el resto por proveedor."}
      >
        {groupByCostCenter ? "🗂 Agrupar tabla por centro · ON" : "🗂 Agrupar tabla por centro"}
      </button>
      <button
        onClick={() => setCostCentersModalOpen(true)}
        className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        title="Abrir el panel de centros de costo: crear/editar/eliminar categorías y ver todos sus documentos, de todas las empresas y períodos"
      >
        🏷 Gestionar centros de costo
      </button>
    </div>

    {/* Printable fuera de pantalla para html-to-image e impresión. */}
    <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
      <PrintableDocList
        ref={docListPrintRef}
        kind={kindTab}
        docs={sortedFiltered}
        company={selectedCompany}
        periodo={periodFilter}
        totals={totals}
        groupByCostCenter={groupByCostCenter}
        costCentersById={costCentersById}
        showEstado={kindTab === "venta"}
      />
    </div>
    </>
  );
}
