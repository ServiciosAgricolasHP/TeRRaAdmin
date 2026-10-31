import { PrintableDocList } from "./PrintableDocList";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { formatPeriodPretty, kindTitleLabel } from "./docs";
import { useMemo, useRef } from "react";
import { writeDocListXlsx } from "./writeDocListXlsx";

// Barra del listado de Facturas o Compras: copiar, PNG, imprimir y Excel de lo
// que está filtrado y ordenado, agrupar por centro de costo y abrir la gestión
// de centros. El printable va fuera de pantalla para html-to-image.
export function DocListToolbar({ costCentersById, groupByCostCenter, kindTab, periodFilter, selectedCompany, setCostCentersModalOpen, setGroupByCostCenter, sortedFiltered, totals }) {
  // Printable del listado, fuera de pantalla, para html-to-image e impresión.
  const docListPrintRef = useRef(null);
  const { busy: docListBusy, run, copy, download, print } = useCaptureActions();
  // ===== Export del listado de Facturas / Compras (vista no-retenciones) =====
  // Mismo patrón que Retenciones: el printable se renderiza fuera de pantalla
  // con los mismos datos filtrados y ordenados que la tabla.
  const docListFileBase = useMemo(() => {
    const alias = (selectedCompany?.alias || selectedCompany?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    const kindLabel = kindTab === "venta" ? "Ventas-Facturas" : "Compras";
    const period = periodFilter || "todos";
    return `${kindLabel}_${alias}_${period}`;
  }, [selectedCompany, kindTab, periodFilter]);

  const handleDocListCopy = () => copy(docListPrintRef.current);
  const handleDocListPng = () => download(docListPrintRef.current, `${docListFileBase}.png`);
  const handleDocListPrint = () =>
    print(docListPrintRef.current, {
      title: `${kindTitleLabel(kindTab)} — ${selectedCompany?.alias || selectedCompany?.razonSocial || ""} — ${formatPeriodPretty(periodFilter)}`,
      css: PRINT_SHEET_CSS,
      margin: "10mm",
    });

  const handleDocListXlsx = () =>
    run(
      "xlsx",
      () => writeDocListXlsx({ costCentersById, docListFileBase, groupByCostCenter, kindTab, periodFilter, selectedCompany, sortedFiltered, totals }),
      { error: "No se pudo generar el Excel" },
    );
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
        disabled={docListBusy === "download" || sortedFiltered.length === 0}
        className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
        title="Descargar como PNG"
      >
        {docListBusy === "download" ? "..." : "📥 PNG"}
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
