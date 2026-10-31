// Pantalla de facturación: multi-empresa, vista por mes actual con selector de
// período, estados de pago y reemplazo por período con borrado de huérfanos.
//
// La emisión se hace en el portal del SII. Aquí solo se importa el RCV
// mensual y se gestiona el estado de pago de cada factura.

import React, { useState, useEffect, useMemo } from "react";
import { dteTypeLabel } from "../utils/siiCsvParser";
import { formatRutForDisplay } from "../utils/rutUtils";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { useValuesChanged } from "../hooks/useValuesChanged";
import {
  DEFAULT_PROJECTION_PERCENT,
} from "../utils/cashFlowProjection";
import { fmtCurrency, fmtNumber } from "../utils/format";
import {
  cancellingNcsByDoc,
  counterpartyOptions,
  docTotals,
  filterDocs,
  pageWindow,
  periodOptionsOf,
  receivablesOf,
  receivablesTotalsOf,
  sortDocs,
  typeOptionsOf,
  withholdingsByCounterpartyOf,
} from "../utils/billingDocs";
import { CompaniesModal } from "./billing/CompaniesModal";
import { CompanySelectAndPickModal } from "./billing/CompanySelectAndPickModal";
import { CostCentersModal } from "./billing/CostCentersModal";
import { DocDetailModal } from "./billing/DocDetailModal";
import {
  groupDocsByCostCenter,
  currentPeriod,
} from "./billing/docs";
import { ImportPreviewModal } from "./billing/ImportPreviewModal";
import { ReceivablesModal } from "./billing/ReceivablesModal";
import { SortHeader } from "./billing/SortHeader";
import { SummaryCard } from "./billing/SummaryCard";
import { AnnualSummaryTab } from "./billing/AnnualSummaryTab";
import { ProjectionTab } from "./billing/ProjectionTab";
import { WithholdingsTab } from "./billing/WithholdingsTab";
import { DocCard } from "./billing/DocCard";
import { DocTableRow } from "./billing/DocTableRow";
import { DocListToolbar } from "./billing/DocListToolbar";
import { useBillingData } from "./billing/useBillingData";
import { useRcvImport } from "./billing/useRcvImport";
import { useDocUpdates } from "./billing/useDocUpdates";
import ScreenLoader from "../components/ScreenLoader";

// Tamaño de página de la tabla principal. La vista plana pagina siempre, haya
// o no búsqueda, para que meses con cientos de docs no rendericen todo.
const PAGE_SIZE = 20;

export default function Billing() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();
  const {
    companies,
    companiesById,
    costCenters,
    costCentersById,
    docs,
    informalExpenses,
    loadAll,
    loading,
    selectedCompanyId,
    setDocs,
    setSelectedCompanyId,
  } = useBillingData();
  const [kindTab, setKindTab] = useState("venta");
  // Vista por defecto = mes actual. El selector de período permite ir a
  // cualquier mes pasado o pedir "Todos los períodos".
  const [periodFilter, setPeriodFilter] = useState(currentPeriod());
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState(""); // "" | "unpaid" | "paid" | "net_only" | "factored"
  const [search, setSearch] = useState("");
  // Orden de la tabla principal: click en un encabezado alterna asc/desc; por
  // defecto, fechaEmision desc.
  const [sortBy, setSortBy] = useState({ key: "fechaEmision", dir: "desc" });
  const [companiesModalOpen, setCompaniesModalOpen] = useState(false);
  const [receivablesModalOpen, setReceivablesModalOpen] = useState(false);
  // Modal de centros de costo: crear/editar/eliminar + vista global de TODOS
  // los documentos de un centro elegido, de todas las empresas y períodos
  // (ignora los filtros de la tabla principal), ordenados cronológicamente.
  // Independiente del toggle de agrupación de la tabla.
  const [costCentersModalOpen, setCostCentersModalOpen] = useState(false);
  // Modal de detalle: muestra todos los campos del DTE + notas editables.
  // Se abre al click en el botón ℹ de cada fila.
  const [detailDoc, setDetailDoc] = useState(null);
  // Año de la pestaña "Resumen", con selector propio, independiente del filtro
  // de mes (que ahí no aplica: el resumen cruza los 12 meses del año elegido).
  const [summaryYear, setSummaryYear] = useState(() => String(new Date().getFullYear()));
  // Pestaña "Proyección" (solo admin). `projectionStart` es el PRIMER mes
  // proyectado; la base son los 12 meses anteriores. Arranca en el mes actual:
  // proyecta la temporada que viene a partir de hoy.
  const [projectionStart, setProjectionStart] = useState(() => currentPeriod());
  // Se guarda como texto para que el input se pueda vaciar mientras se tipea
  // sin que el valor salte a 0 y la tabla parpadee en cero.
  const [projectionPercent, setProjectionPercent] = useState(String(DEFAULT_PROJECTION_PERCENT));
  // Toggle "Agrupar tabla por centro": agrupa la tabla y el export por centro
  // de costo (o por contraparte si el documento no tiene uno), con los
  // combustibles juntos arriba. Se guarda en localStorage (una sola clave para
  // todas las pestañas).
  const [groupByCostCenter, setGroupByCostCenter] = useState(() => {
    try { return localStorage.getItem("facturacion.groupByCostCenter") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("facturacion.groupByCostCenter", String(groupByCostCenter)); } catch { /* noop */ }
  }, [groupByCostCenter]);

  // La pestaña "Retenciones" muestra todos los DTE (ventas y compras) con
  // estado `net_only`, agrupados por contraparte. No es un `kind`, pero va como
  // un valor más de `kindTab` para que las pestañas usen un solo estado.
  const isWithholdingsView = kindTab === "retenciones";
  // Las pestañas de análisis cruzan varios meses por su cuenta, así que apagan
  // los filtros, las tarjetas y la tabla del listado. Todos esos lugares leen
  // este predicado: una pestaña de análisis nueva se agrega solo aquí.
  const isAnalysisTab = kindTab === "resumen" || kindTab === "proyeccion";

  const filtered = useMemo(() => filterDocs({ docs, kindTab, isWithholdingsView, selectedCompanyId, periodFilter, typeFilter, paymentFilter, search }), [docs, kindTab, isWithholdingsView, selectedCompanyId, periodFilter, typeFilter, paymentFilter, search]);

  const sortedFiltered = useMemo(() => sortDocs(filtered, sortBy, kindTab), [filtered, sortBy, kindTab]);
  const toggleSort = (key) => {
    setSortBy((cur) => cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "fechaEmision" ? "desc" : "asc" });
  };

  // Paginación de la tabla plana. No aplica al modo "por centro de costo" ni a
  // retenciones/resumen: son vistas de reporte con subtotales, y cortar filas
  // los distorsionaría. Cualquier cambio de filtro u orden vuelve a la página 1.
  const [page, setPage] = useState(1);
  if (useValuesChanged([kindTab, selectedCompanyId, periodFilter, typeFilter, paymentFilter, search, sortBy])) setPage(1);
  const pageCount = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE));
  // Acota la página al total: si la lista se achica (p. ej. al cambiar de
  // empresa) antes de que corra el reset, no muestra una página vacía.
  const currentPage = Math.min(page, pageCount);
  const pagedDocs = useMemo(
    () => sortedFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedFiltered, currentPage],
  );
  const pageNumbers = useMemo(() => pageWindow(pageCount, currentPage), [pageCount, currentPage]);

  const counterpartySuggestions = useMemo(() => counterpartyOptions({ docs, kindTab, isWithholdingsView, selectedCompanyId }), [docs, kindTab, isWithholdingsView, selectedCompanyId]);

  const withholdingsByCounterparty = useMemo(() => withholdingsByCounterpartyOf(filtered, isWithholdingsView), [filtered, isWithholdingsView]);

  const periodOptions = useMemo(() => periodOptionsOf({ docs, kindTab, isWithholdingsView, selectedCompanyId, current: currentPeriod() }), [docs, kindTab, isWithholdingsView, selectedCompanyId]);

  const typeOptions = useMemo(() => typeOptionsOf({ docs, kindTab, selectedCompanyId }), [docs, kindTab, selectedCompanyId]);

  const totals = useMemo(() => docTotals(filtered), [filtered]);

  const cancellingByDocId = useMemo(() => cancellingNcsByDoc(docs), [docs]);

  const receivablesList = useMemo(() => receivablesOf(docs, selectedCompanyId), [docs, selectedCompanyId]);

  const receivablesTotals = useMemo(() => receivablesTotalsOf(receivablesList), [receivablesList]);

  const {
    confirmImport,
    importCompanyId,
    importing,
    importPreview,
    onFilesPick,
    openImport,
    setImportCompanyId,
    setImportPreview,
    toggleFileExclusion,
  } = useRcvImport({
    companies,
    companiesById,
    loadAll,
    selectedCompanyId,
    toast,
  });

  const { saveDocCostCenter, saveDocNotes, saveDocPayments, setPaymentStatus } = useDocUpdates({ setDetailDoc, setDocs, toast });

  const selectedCompany = companiesById.get(selectedCompanyId);
  const noCompany = companies.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Importar el RCV del SII mes a mes · Marcar estado de pago · Auditar por empresa.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCompaniesModalOpen(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
          >
            🏢 Empresas ({companies.length})
          </button>
          <button
            onClick={openImport}
            disabled={noCompany}
            title={noCompany ? "Registra una empresa primero" : "Importar CSV del SII"}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            📥 Importar CSV del SII
          </button>
        </div>
      </div>

      {/* Selector de empresa + pestañas + botón de pendientes */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          disabled={noCompany}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              🏢 {c.alias || c.razonSocial}
            </option>
          ))}
          {noCompany && <option value="">Sin empresas</option>}
        </select>

        <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-sm">
          {[
            { v: "venta", label: "📤 Facturas" },
            { v: "compra", label: "📥 Compras" },
            { v: "retenciones", label: "📑 Retenciones" },
            { v: "resumen", label: "📊 Resumen" },
            // Proyectar es una decisión de plata a futuro, no operación del día:
            // solo admin.
            ...(isAdmin ? [{ v: "proyeccion", label: "📈 Proyección" }] : []),
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setKindTab(t.v)}
              className={`min-h-[32px] rounded px-3 py-1 ${
                kindTab === t.v
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                  : "text-[var(--color-muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!isAnalysisTab && (<>
        <button
          onClick={() => setReceivablesModalOpen(true)}
          disabled={noCompany}
          title="Ver todas las facturas con saldo pendiente (cualquier período): factura completa, abonos parciales o IVA pendiente."
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
        >
          ⏳ Ver pendientes
          {receivablesList.length > 0 && (
            <span className="ml-1.5 rounded-full bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]">
              {receivablesList.length}
            </span>
          )}
        </button>
        </>)}
      </div>

      {/* Sub-filtros */}
      {!isAnalysisTab && (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={search.trim() ? "" : periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          disabled={!!search.trim()}
          title={search.trim()
            ? "Ignorado mientras buscas — la búsqueda muestra todos los períodos de la empresa"
            : "Filtrar por período"}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs disabled:opacity-60"
        >
          <option value="">Todos los períodos</option>
          {periodOptions.map((p) => (
            <option key={p} value={p}>
              {p === currentPeriod() ? `${p} (actual)` : p}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
        >
          <option value="">Todos los tipos</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>{t} · {dteTypeLabel(t)}</option>
          ))}
        </select>
        {!isWithholdingsView && kindTab === "venta" && (
          <div className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-xs">
            {[
              { v: "", label: "Todos" },
              { v: "unpaid", label: "No pagado" },
              { v: "paid", label: "Pagado" },
              { v: "net_only", label: "Solo neto" },
              { v: "factored", label: "Solo IVA" },
            ].map((s) => (
              <button
                key={s.v}
                onClick={() => setPaymentFilter(s.v)}
                className={`min-h-[32px] rounded px-2 py-1 ${
                  paymentFilter === s.v
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                    : "text-[var(--color-muted)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            isWithholdingsView
              ? "Buscar por contraparte, RUT o folio..."
              : `Buscar por ${kindTab === "venta" ? "cliente" : "proveedor"}, RUT o folio...`
          }
          list="dte-contrapartes"
          className="flex-1 min-w-[200px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <datalist id="dte-contrapartes">
          {counterpartySuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      )}

      {!isAnalysisTab && (
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryCard label="Documentos" value={fmtNumber(totals.count)} />
        <SummaryCard label="Neto" value={fmtCurrency(totals.neto)} />
        <SummaryCard label="IVA" value={fmtCurrency(totals.iva)} />
        <SummaryCard label="Total" value={fmtCurrency(totals.total)} highlight />
        <SummaryCard
          label={`NC (${totals.ncCount})`}
          value={fmtCurrency(totals.ncTotal)}
          subtle
        />
      </div>
      )}

      {selectedCompany && !isWithholdingsView && !isAnalysisTab && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryCard label="No pagado del período" value={fmtCurrency(totals.unpaidTotal)} warning />
          <SummaryCard label="Solo neto (IVA retenido)" value={fmtCurrency(totals.netOnlyTotal)} />
          <SummaryCard label="Cedidas / Solo IVA" value={fmtCurrency(totals.factoredTotal)} />
        </div>
      )}
      {isWithholdingsView && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryCard label="Facturas con retención" value={fmtNumber(totals.count)} />
          <SummaryCard label="IVA retenido" value={fmtCurrency(totals.netOnlyIva)} highlight />
          <SummaryCard label="Total facturado (con IVA)" value={fmtCurrency(totals.netOnlyTotal)} />
        </div>
      )}

      {loading ? (
        <ScreenLoader />
      ) : noCompany ? (
        <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
          <div>No hay empresas registradas todavía.</div>
          <button
            onClick={() => setCompaniesModalOpen(true)}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
          >
            🏢 Registrar la primera empresa
          </button>
        </div>
      ) : kindTab === "resumen" ? (
        <AnnualSummaryTab
          docs={docs}
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
          setSummaryYear={setSummaryYear}
          summaryYear={summaryYear}
        />
      ) : kindTab === "proyeccion" && isAdmin ? (
        <ProjectionTab
          docs={docs}
          projectionPercent={projectionPercent}
          projectionStart={projectionStart}
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
          setProjectionPercent={setProjectionPercent}
          setProjectionStart={setProjectionStart}
          toast={toast}
        />
      ) : filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
          {docs.some((d) => (isWithholdingsView || d.kind === kindTab) && d.companyId === selectedCompanyId)
            ? "Sin coincidencias para los filtros aplicados."
            : isWithholdingsView
              ? "No hay facturas con estado \"Solo neto\" para esta empresa en este período."
              : `No hay ${kindTab === "venta" ? "facturas" : "compras"} importadas para esta empresa en este período. Usa "📥 Importar CSV del SII".`}
        </div>
      ) : isWithholdingsView ? (
        <WithholdingsTab
          companiesById={companiesById}
          periodFilter={periodFilter}
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
          setDetailDoc={setDetailDoc}
          setPaymentStatus={setPaymentStatus}
          totals={totals}
          withholdingsByCounterparty={withholdingsByCounterparty}
        />
      ) : (
        <>
          <DocListToolbar
            costCentersById={costCentersById}
            groupByCostCenter={groupByCostCenter}
            kindTab={kindTab}
            periodFilter={periodFilter}
            selectedCompany={selectedCompany}
            setCostCentersModalOpen={setCostCentersModalOpen}
            setGroupByCostCenter={setGroupByCostCenter}
            sortedFiltered={sortedFiltered}
            totals={totals}
          />

        {isMobile ? (
          <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
            {(() => {

              if (!groupByCostCenter) return pagedDocs.map((d) => (
                <DocCard
                  key={d.id}
                  d={d}
                  cancellingByDocId={cancellingByDocId}
                  costCenters={costCenters}
                  kindTab={kindTab}
                  saveDocCostCenter={saveDocCostCenter}
                  setDetailDoc={setDetailDoc}
                  setPaymentStatus={setPaymentStatus}
                />
              ));

              const groups = groupDocsByCostCenter(sortedFiltered, kindTab, costCentersById);
              return groups.map((g) => (
                <div key={`g_${g.key}`}>
                  <div
                    className={`px-3 py-1.5 text-xs font-semibold ${
                      g.isFuel
                        ? "bg-[var(--color-warning-soft)]"
                        : g.isManual
                          ? "bg-[var(--color-success-soft)]"
                          : "bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    {g.isFuel ? "⛽ COMBUSTIBLES" : (g.razon || "—")}
                    {!g.isFuel && g.rut && (
                      <span className="ml-2 font-normal text-[var(--color-muted)]">· {formatRutForDisplay(g.rut)}</span>
                    )}
                    <span className="ml-2 font-normal text-[var(--color-muted)]">· {g.docs.length} documento{g.docs.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {g.docs.map((d) => (
                      <DocCard
                        key={d.id}
                        d={d}
                        cancellingByDocId={cancellingByDocId}
                        costCenters={costCenters}
                        kindTab={kindTab}
                        saveDocCostCenter={saveDocCostCenter}
                        setDetailDoc={setDetailDoc}
                        setPaymentStatus={setPaymentStatus}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold">
                    <span>Subtotal</span>
                    <span className="tabular-nums">Neto {fmtCurrency(g.neto)} · IVA {fmtCurrency(g.iva)} · Total {fmtCurrency(g.total)}</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : (
        <div className="flex-1 overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <SortHeader sortKey="fechaEmision" sortBy={sortBy} onToggle={toggleSort} align="left">Fecha</SortHeader>
                <SortHeader sortKey="tipo" sortBy={sortBy} onToggle={toggleSort} align="left">Tipo</SortHeader>
                <SortHeader sortKey="folio" sortBy={sortBy} onToggle={toggleSort} align="right">Folio</SortHeader>
                <SortHeader sortKey="razon" sortBy={sortBy} onToggle={toggleSort} align="left">{kindTab === "venta" ? "Cliente" : "Proveedor"}</SortHeader>
                <SortHeader sortKey="rut" sortBy={sortBy} onToggle={toggleSort} align="left">RUT</SortHeader>
                <SortHeader sortKey="neto" sortBy={sortBy} onToggle={toggleSort} align="right">Neto</SortHeader>
                <SortHeader sortKey="iva" sortBy={sortBy} onToggle={toggleSort} align="right">IVA</SortHeader>
                <SortHeader sortKey="total" sortBy={sortBy} onToggle={toggleSort} align="right">Total</SortHeader>
                <SortHeader sortKey="pagado" sortBy={sortBy} onToggle={toggleSort} align="right">Abonos</SortHeader>
                <th className="px-2 py-2 text-left">C. Costo</th>
                {kindTab === "venta" && (
                  <SortHeader sortKey="estado" sortBy={sortBy} onToggle={toggleSort} align="center">Estado</SortHeader>
                )}
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(() => {

                if (!groupByCostCenter) return pagedDocs.map((d) => (
                  <DocTableRow
                    key={d.id}
                    d={d}
                    cancellingByDocId={cancellingByDocId}
                    costCenters={costCenters}
                    kindTab={kindTab}
                    saveDocCostCenter={saveDocCostCenter}
                    setDetailDoc={setDetailDoc}
                    setPaymentStatus={setPaymentStatus}
                  />
                ));

                const totalCols = kindTab === "venta" ? 12 : 11;
                const groups = groupDocsByCostCenter(sortedFiltered, kindTab, costCentersById);
                return groups.map((g) => (
                  <React.Fragment key={`g_${g.key}`}>
                    <tr
                      className={
                        g.isFuel
                          ? "bg-[var(--color-warning-soft)]"
                          : g.isManual
                            ? "bg-[var(--color-success-soft)]"
                            : "bg-[var(--color-accent-soft)]"
                      }
                    >
                      <td colSpan={totalCols} className="px-2 py-1.5 text-xs font-semibold">
                        {g.isFuel ? "⛽ COMBUSTIBLES" : (g.razon || "—")}
                        {!g.isFuel && g.rut && (
                          <span className="ml-2 font-normal text-[var(--color-muted)]">· {formatRutForDisplay(g.rut)}</span>
                        )}
                        <span className="ml-2 font-normal text-[var(--color-muted)]">· {g.docs.length} documento{g.docs.length === 1 ? "" : "s"}</span>
                      </td>
                    </tr>
                    {g.docs.map((d) => (
                      <DocTableRow
                        key={d.id}
                        d={d}
                        cancellingByDocId={cancellingByDocId}
                        costCenters={costCenters}
                        kindTab={kindTab}
                        saveDocCostCenter={saveDocCostCenter}
                        setDetailDoc={setDetailDoc}
                        setPaymentStatus={setPaymentStatus}
                      />
                    ))}
                    <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-semibold">
                      <td colSpan={5} className="px-2 py-1.5">Subtotal</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(g.neto)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(g.iva)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(g.total)}</td>
                      <td colSpan={kindTab === "venta" ? 4 : 3}></td>
                    </tr>
                  </React.Fragment>
                ));
              })()}
            </tbody>
          </table>
        </div>
        )}

        {/* Paginación — solo en la tabla plana. En modo "por centro de costo"
            se muestra todo (los subtotales por grupo no se pueden cortar). */}
        {!groupByCostCenter && sortedFiltered.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--color-muted)]">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedFiltered.length)} de {fmtNumber(sortedFiltered.length)}
            </span>
            {pageCount > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
                >
                  ‹ Anterior
                </button>
                {pageNumbers.map((n, i) =>
                  n === "…" ? (
                    <span key={`e_${i}`} className="px-1 text-[var(--color-muted)]">…</span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={`min-h-[32px] min-w-[32px] rounded-md border px-2 py-1 tabular-nums ${
                        n === currentPage
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] font-semibold text-[var(--color-accent-fg)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                      }`}
                    >
                      {n}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                  disabled={currentPage >= pageCount}
                  className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
                >
                  Siguiente ›
                </button>
              </div>
            )}
          </div>
        )}
        </>
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          existingIds={new Set(docs.map((d) => d.id))}
          company={companiesById.get(importCompanyId)}
          busy={importing}
          onToggleFile={toggleFileExclusion}
          onConfirm={confirmImport}
          onCancel={() => { setImportPreview(null); setImportCompanyId(""); }}
        />
      )}

      {importCompanyId && !importPreview && (
        <CompanySelectAndPickModal
          companies={companies}
          companyId={importCompanyId}
          onChange={setImportCompanyId}
          onFilesPick={onFilesPick}
          onCancel={() => setImportCompanyId("")}
        />
      )}

      {companiesModalOpen && (
        <CompaniesModal
          companies={companies}
          onClose={() => setCompaniesModalOpen(false)}
          onChanged={loadAll}
        />
      )}

      {receivablesModalOpen && (
        <ReceivablesModal
          items={receivablesList}
          totals={receivablesTotals}
          company={selectedCompany}
          onClose={() => setReceivablesModalOpen(false)}
          onSelectDoc={(d) => { setReceivablesModalOpen(false); setDetailDoc(d); }}
        />
      )}

      {costCentersModalOpen && (
        <CostCentersModal
          costCenters={costCenters}
          docs={docs}
          informalExpenses={informalExpenses}
          companiesById={companiesById}
          onClose={() => setCostCentersModalOpen(false)}
          onChanged={loadAll}
          onSelectDoc={(d) => setDetailDoc(d)}
        />
      )}

      {/* Se renderiza después de CostCentersModal a propósito: si ambos están
          abiertos (se abrió un documento desde la vista de un centro de
          costo), este queda apilado encima y al cerrarlo vuelve al modal de
          centros de costo en vez de cerrar todo hasta la pantalla base. */}
      {detailDoc && (
        <DocDetailModal
          dteDoc={detailDoc}
          candidateNcs={cancellingByDocId.get(detailDoc.id) || []}
          costCenters={costCenters}
          onClose={() => setDetailDoc(null)}
          onSaveNotes={(notes) => saveDocNotes(detailDoc, notes)}
          onSetStatus={(next) => setPaymentStatus(detailDoc, next)}
          onSavePayments={(payments) => saveDocPayments(detailDoc, payments)}
          onSetCostCenter={(next) => saveDocCostCenter(detailDoc, next)}
        />
      )}
    </div>
  );
}
