import { PrintableWithholdings } from "./PrintableWithholdings";
import { PrintableWithholdingsGroup } from "./PrintableWithholdingsGroup";
import { WithholdingsView } from "./WithholdingsView";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../../utils/imageCapture";
import { useMemo, useRef, useState } from "react";
import { writeWithholdingGroupXlsx } from "./writeWithholdingGroupXlsx";
import { writeWithholdingsXlsx } from "./writeWithholdingsXlsx";

// Pestaña "Retenciones": las facturas en "Solo neto" agrupadas por contraparte,
// con las exportaciones del total (copiar, PNG, imprimir y Excel) y las de cada
// contraparte. Cada grupo tiene su propio imprimible fuera de pantalla.
export function WithholdingsTab({ companiesById, periodFilter, selectedCompany, selectedCompanyId, setDetailDoc, setPaymentStatus, toast, totals, withholdingsByCounterparty }) {
  "use no memo";
  // Printable del total, fuera de pantalla, para html-to-image e impresión.
  const withholdingsPrintRef = useRef(null);
  const [exportBusy, setExportBusy] = useState("");
  // Refs por contraparte (mapa clave del grupo → nodo DOM) y estado de carga
  // por grupo. Cada grupo se renderiza fuera de pantalla con su propio
  // printable, y los handlers usan estos refs para copiar, descargar o
  // imprimir solo ese grupo.
  const groupPrintRefs = useRef(new Map());
  const [groupBusy, setGroupBusy] = useState({}); // { [groupKey]: "copy"|"png"|... }
  const groupKey = (g) => g?.rut || "__sin_rut__";
  const setBusyFor = (key, action) =>
    setGroupBusy((prev) => {
      const next = { ...prev };
      if (action) next[key] = action; else delete next[key];
      return next;
    });
  // --- Export de Retenciones (infografía) ---
  // El printable se renderiza fuera de pantalla y los botones lo capturan con
  // html-to-image, igual que en los otros resúmenes (PrintableFortnightTable,
  // PrintableSummary, etc.).

  const exportFileBase = useMemo(() => {
    const company = companiesById.get(selectedCompanyId);
    const alias = (company?.alias || company?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    const period = periodFilter || "todos";
    return `Retenciones_${alias}_${period}`;
  }, [companiesById, selectedCompanyId, periodFilter]);

  const handleWithholdingsCopy = async () => {
    if (!withholdingsPrintRef.current) return;
    setExportBusy("copy");
    try {
      const blob = await captureFullWidthBlob(withholdingsPrintRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setExportBusy("");
    }
  };

  const handleWithholdingsDownload = async () => {
    if (!withholdingsPrintRef.current) return;
    setExportBusy("png");
    try {
      const dataUrl = await captureFullWidthDataUrl(withholdingsPrintRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${exportFileBase}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast.error("Error al generar PNG: " + (err.message || err));
    } finally {
      setExportBusy("");
    }
  };

  const handleWithholdingsPrint = () => {
    if (!withholdingsPrintRef.current) return;
    const html = withholdingsPrintRef.current.outerHTML;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Retenciones</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
        thead th { background: #92d050 !important; text-align: left; }
        @media print { @page { size: landscape; margin: 12mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  // XLSX con la convención del proyecto: col A vacía de ancho 6, fila 1 vacía,
  // datos desde B2. Dos hojas: "Resumen", con una fila por contraparte, y
  // "Detalle", con cada factura.
  const handleWithholdingsXlsx = async () => {
    setExportBusy("xlsx");
    try {
      await writeWithholdingsXlsx({ companiesById, exportFileBase, periodFilter, selectedCompanyId, totals, withholdingsByCounterparty });
    } catch (err) {
      toast.error("Error al generar XLSX: " + (err.message || err));
    } finally {
      setExportBusy("");
    }
  };

  // ===== Export por contraparte (individual) =====
  // Nombre de archivo seguro para una contraparte.
  const groupFileBase = (g) => {
    const alias = (selectedCompany?.alias || selectedCompany?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    const counterparty = (g.razon || "contraparte").replace(/[^\w-]+/g, "_").slice(0, 40);
    const period = periodFilter || "todos";
    return `Retencion_${alias}_${counterparty}_${period}`;
  };

  const handleGroupCopy = async (g) => {
    const key = groupKey(g);
    const el = groupPrintRefs.current.get(key);
    if (!el) return;
    setBusyFor(key, "copy");
    try {
      const blob = await captureFullWidthBlob(el, { backgroundColor: "#ffffff", pixelRatio: 2 });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success(`Copiado: ${g.razon || "contraparte"}`);
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusyFor(key, null);
    }
  };

  const handleGroupPng = async (g) => {
    const key = groupKey(g);
    const el = groupPrintRefs.current.get(key);
    if (!el) return;
    setBusyFor(key, "png");
    try {
      const dataUrl = await captureFullWidthDataUrl(el, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${groupFileBase(g)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast.error("Error al generar PNG: " + (err.message || err));
    } finally {
      setBusyFor(key, null);
    }
  };

  const handleGroupPrint = (g) => {
    const key = groupKey(g);
    const el = groupPrintRefs.current.get(key);
    if (!el) return;
    const html = el.outerHTML;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Retención ${g.razon || ""}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
        thead th { background: #92d050 !important; text-align: left; }
        @media print { @page { size: landscape; margin: 12mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  const handleGroupXlsx = async (g) => {
    const key = groupKey(g);
    setBusyFor(key, "xlsx");
    try {
      await writeWithholdingGroupXlsx({ g, groupFileBase, periodFilter, selectedCompany });
    } catch (err) {
      toast.error("Error al generar XLSX: " + (err.message || err));
    } finally {
      setBusyFor(key, null);
    }
  };

  const groupExport = (action, g) => {
    if (action === "copy") return handleGroupCopy(g);
    if (action === "png") return handleGroupPng(g);
    if (action === "print") return handleGroupPrint(g);
    if (action === "xlsx") return handleGroupXlsx(g);
  };
  return (
    <>
      {/* Toolbar de export para la infografía. Mismo patrón visual que el
          resto de los resúmenes del proyecto (Cobrar, Quincenas, Worker). */}
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          onClick={handleWithholdingsCopy}
          disabled={exportBusy === "copy" || withholdingsByCounterparty.length === 0}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          title="Copiar tabla como imagen"
        >
          {exportBusy === "copy" ? "Copiando..." : "📋 Copiar"}
        </button>
        <button
          onClick={handleWithholdingsDownload}
          disabled={exportBusy === "png" || withholdingsByCounterparty.length === 0}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          title="Descargar como PNG"
        >
          {exportBusy === "png" ? "..." : "📥 PNG"}
        </button>
        <button
          onClick={handleWithholdingsPrint}
          disabled={withholdingsByCounterparty.length === 0}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          title="Imprimir"
        >
          🖨 Imprimir
        </button>
        <button
          onClick={handleWithholdingsXlsx}
          disabled={exportBusy === "xlsx" || withholdingsByCounterparty.length === 0}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          title="Exportar XLSX (Resumen + Detalle)"
        >
          {exportBusy === "xlsx" ? "..." : "📊 XLSX"}
        </button>
      </div>

      {/* Printables fuera de pantalla para html-to-image: el resumen general
          y uno por contraparte, para exportarlos uno a uno. */}
      <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <PrintableWithholdings
          ref={withholdingsPrintRef}
          groups={withholdingsByCounterparty}
          company={selectedCompany}
          periodo={periodFilter}
          totals={totals}
        />
        {withholdingsByCounterparty.map((g) => {
          const k = groupKey(g);
          return (
            <PrintableWithholdingsGroup
              key={`pg_${k}`}
              ref={(el) => {
                if (el) groupPrintRefs.current.set(k, el);
                else groupPrintRefs.current.delete(k);
              }}
              group={g}
              company={selectedCompany}
              periodo={periodFilter}
            />
          );
        })}
      </div>

      <WithholdingsView
        groups={withholdingsByCounterparty}
        onSelectDoc={(d) => setDetailDoc(d)}
        onSetStatus={setPaymentStatus}
        onGroupExport={groupExport}
        groupBusy={groupBusy}
        groupKeyOf={groupKey}
      />
    </>
  );
}
