import { useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { useIsMobile } from "../../hooks/useIsMobile";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { fmtCurrency } from "../../utils/format";
import { receivablesView, withoutResolved } from "../../utils/receivables";
import { todayIso } from "./docs";
import { PrintableReceivables } from "./PrintableReceivables";
import { ReceivableSectionCards } from "./ReceivableSectionCards";
import { ReceivableSectionTable } from "./ReceivableSectionTable";
import { RECEIVABLE_CHIPS } from "./receivablesLabels";
import { SummaryCard } from "./SummaryCard";
import { useReceivableActions } from "./useReceivableActions";
import { writeReceivablesXlsx } from "./writeReceivablesXlsx";

const TOOL = "min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60";

// La pestaña ⏳ Pendientes de Facturación: lo que falta por cobrar de las
// ventas de la empresa del selector de arriba, o de todas, con las facturas
// por cobrar por cliente y el IVA pendiente por cliente y por mes
// (`receivablesView`). El estado de cada factura se cambia en su fila, como en
// el listado, y un mes o un cliente se marca pagado de una vez
// (`useReceivableActions`). Lo que se cambia sigue a la vista, con su estado
// nuevo, hasta salir de la pestaña.
export function ReceivablesTab({ docs, companyId, companiesById, setDocs, setDetailDoc, setPaymentStatus, toast }) {
  const isMobile = useIsMobile();
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const actions = useReceivableActions({ setDocs, setPaymentStatus, toast });
  const view = useMemo(
    () => receivablesView(docs, { companyId, category, search, pinned: actions.pinned }),
    [docs, companyId, category, search, actions.pinned],
  );

  const company = companyId ? companiesById.get(companyId) : null;
  const scopeLabel = company ? company.alias || company.razonSocial : "Todas las empresas";
  const showCompany = !companyId && companiesById.size > 1;
  const companyLabel = (id) => {
    const c = companiesById.get(id);
    return c ? c.alias || c.razonSocial : "—";
  };
  const ctx = { actions, onOpen: setDetailDoc, showCompany, companyLabel };
  const Section = isMobile ? ReceivableSectionCards : ReceivableSectionTable;

  const printRef = useRef(null);
  const { busy, run, copy, download, print } = useCaptureActions();
  const fileBase = `Pendientes_${scopeLabel.replace(/[^\w-]+/g, "_")}_${todayIso()}`;
  const exportView = withoutResolved(view);
  const exportProps = { view: exportView, scopeLabel, showCompany, companyLabel };

  const { totals } = view;
  const empty = view.invoices.length === 0 && view.vat.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-xs">
          {RECEIVABLE_CHIPS.map((c) => (
            <button
              key={c.v || "all"}
              type="button"
              onClick={() => setCategory(c.v)}
              className={`min-h-[32px] rounded px-2 py-1 ${
                category === c.v ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "text-[var(--color-muted)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={showCompany ? "Buscar por cliente, RUT, folio o empresa..." : "Buscar por cliente, RUT o folio..."}
          className="min-w-[200px] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label={`Pendiente (${totals.count.total})`} value={fmtCurrency(totals.total)} warning />
        <SummaryCard label={`Factura completa (${totals.count.full})`} value={fmtCurrency(totals.full)} />
        <SummaryCard label={`Abono parcial (${totals.count.partial})`} value={fmtCurrency(totals.partial)} />
        <SummaryCard label={`IVA pendiente (${totals.count.iva})`} value={fmtCurrency(totals.iva)} />
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        <button type="button" onClick={() => copy(printRef.current)} disabled={!!busy || empty} className={TOOL} title="Copiar tabla como imagen">
          {busy === "copy" ? "Copiando..." : "📋 Copiar"}
        </button>
        <button type="button" onClick={() => download(printRef.current, `${fileBase}.png`)} disabled={!!busy || empty} className={TOOL} title="Descargar como PNG">
          {busy === "download" ? "..." : "📥 PNG"}
        </button>
        <button type="button" onClick={() => print(printRef.current, { title: `Pendientes — ${scopeLabel}`, css: PRINT_SHEET_CSS, margin: "10mm" })} disabled={!!busy || empty} className={TOOL} title="Imprimir">
          🖨 Imprimir
        </button>
        <button
          type="button"
          onClick={() => run("xlsx", () => writeReceivablesXlsx({ ...exportProps, fileBase }), { error: "No se pudo generar el Excel" })}
          disabled={!!busy || empty}
          className={TOOL}
          title="Exportar XLSX"
        >
          {busy === "xlsx" ? "..." : "📊 XLSX"}
        </button>
      </div>

      {/* En el escritorio la lista toma el alto que queda y se desplaza sola;
          en el teléfono se desplaza la página. */}
      <div className="md:min-h-0 md:flex-1 md:overflow-auto">
        {empty ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
            {category || search ? "Sin coincidencias para los filtros aplicados." : "🎉 No hay facturas con saldo pendiente. Todo al día."}
          </div>
        ) : (
          <div className="space-y-4">
            {view.invoices.length > 0 && (
              <section>
                <h2 className="mb-1 text-sm font-semibold">
                  Facturas por cobrar
                  <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">las completas y las con abonos, por cliente</span>
                </h2>
                <Section groups={view.invoices} isVat={false} ctx={ctx} />
              </section>
            )}
            {view.vat.length > 0 && (
              <section>
                <h2 className="mb-1 text-sm font-semibold">
                  IVA pendiente
                  <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">el que retuvo el cliente (solo neto), por cliente y por mes</span>
                </h2>
                <Section groups={view.vat} isVat ctx={ctx} />
              </section>
            )}
          </div>
        )}
      </div>

      <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <PrintableReceivables ref={printRef} {...exportProps} />
      </div>

      <ConfirmDialog
        open={!!actions.confirmBulk}
        title="Marcar pagado"
        message={actions.confirmBulk?.message || ""}
        confirmLabel="Marcar pagado"
        busy={actions.bulkBusy}
        onConfirm={actions.confirmBulkAction}
        onCancel={actions.cancelBulk}
      />
    </div>
  );
}
