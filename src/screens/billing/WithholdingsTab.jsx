import { PrintableWithholdings } from "./PrintableWithholdings";
import { PrintableWithholdingsGroup } from "./PrintableWithholdingsGroup";
import { WithholdingsView } from "./WithholdingsView";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { useMemo, useRef } from "react";
import { writeWithholdingGroupXlsx } from "./writeWithholdingGroupXlsx";
import { writeWithholdingsXlsx } from "./writeWithholdingsXlsx";

// Pestaña "Retenciones": las facturas en "Solo neto" agrupadas por contraparte,
// con las exportaciones del total (copiar, PNG, imprimir y Excel) y las de cada
// contraparte. Cada grupo tiene su propio imprimible fuera de pantalla.
export function WithholdingsTab({ companiesById, periodFilter, selectedCompany, selectedCompanyId, setDetailDoc, setPaymentStatus, totals, withholdingsByCounterparty }) {
  "use no memo";
  // Printable del total, fuera de pantalla, para html-to-image e impresión.
  const withholdingsPrintRef = useRef(null);
  const { busy: exportBusy, run, copy, download, print } = useCaptureActions();
  // Refs por contraparte (mapa clave del grupo → nodo DOM). Cada grupo se
  // renderiza fuera de pantalla con su propio printable, y sus exportaciones
  // usan estos refs para copiar, descargar o imprimir solo ese grupo.
  const groupPrintRefs = useRef(new Map());
  const groupKey = (g) => g?.rut || "__sin_rut__";
  // Las exportaciones de un grupo corren con la clave "acción:grupo"; la
  // vista recibe la acción en curso de cada grupo.
  const groupCapture = useCaptureActions();
  const busySplit = groupCapture.busy.indexOf(":");
  const groupBusy = groupCapture.busy
    ? { [groupCapture.busy.slice(busySplit + 1)]: groupCapture.busy.slice(0, busySplit) }
    : {};
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

  const handleWithholdingsCopy = () => copy(withholdingsPrintRef.current);
  const handleWithholdingsDownload = () => download(withholdingsPrintRef.current, `${exportFileBase}.png`);
  const handleWithholdingsPrint = () => print(withholdingsPrintRef.current, { title: "Retenciones", css: PRINT_SHEET_CSS });

  // XLSX con la convención del proyecto: col A vacía de ancho 6, fila 1 vacía,
  // datos desde B2. Dos hojas: "Resumen", con una fila por contraparte, y
  // "Detalle", con cada factura.
  const handleWithholdingsXlsx = () =>
    run(
      "xlsx",
      () => writeWithholdingsXlsx({ companiesById, exportFileBase, periodFilter, selectedCompany, selectedCompanyId, totals, withholdingsByCounterparty }),
      { error: "No se pudo generar el Excel" },
    );

  // ===== Export por contraparte (individual) =====
  // Nombre de archivo seguro para una contraparte.
  const groupFileBase = (g) => {
    const alias = (selectedCompany?.alias || selectedCompany?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    const counterparty = (g.razon || "contraparte").replace(/[^\w-]+/g, "_").slice(0, 40);
    const period = periodFilter || "todos";
    return `Retencion_${alias}_${counterparty}_${period}`;
  };

  const groupExport = (action, g) => {
    const gk = groupKey(g);
    const node = groupPrintRefs.current.get(gk);
    const key = `${action}:${gk}`;
    if (action === "copy") return groupCapture.copy(node, { key, success: `Copiado: ${g.razon || "contraparte"}` });
    if (action === "png") return groupCapture.download(node, `${groupFileBase(g)}.png`, { key });
    if (action === "print") return groupCapture.print(node, { key, title: `Retención ${g.razon || ""}`, css: PRINT_SHEET_CSS });
    if (action === "xlsx") {
      return groupCapture.run(key, () => writeWithholdingGroupXlsx({ g, groupFileBase, periodFilter, selectedCompany }), {
        error: "No se pudo generar el Excel",
      });
    }
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
          disabled={exportBusy === "download" || withholdingsByCounterparty.length === 0}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          title="Descargar como PNG"
        >
          {exportBusy === "download" ? "..." : "📥 PNG"}
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
