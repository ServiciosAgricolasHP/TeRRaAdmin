import { useRef, useState, useMemo } from "react";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../../utils/imageCapture";
import { costCentersService } from "../../services";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { toTitleName } from "../../utils/textCase";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { fmtCurrency } from "../../utils/format";
import { todayIso } from "./docs";
import { InformalExpenseFormModal } from "./InformalExpenseFormModal";
import { PrintableCostCenterDocs } from "./PrintableCostCenterDocs";
import { SortHeader } from "./SortHeader";
import {
  FUEL_VIEW_ID,
  centerDocTotals,
  centerDocsOf,
  centerInformalOf,
  companiesByName,
  filterCenterDocs,
  filterCenterInformal,
  informalTotalOf,
  sortCenterRows,
} from "../../utils/costCenterDocs";

// Modal de Centros de costo: catálogo (crear/editar/eliminar, arriba, como
// chips) + vista global del centro elegido (abajo): TODOS sus documentos, de
// TODAS las empresas y períodos (ignora los filtros de la tabla principal),
// con búsqueda y filtros propios, columnas ordenables y export
// (copiar/PNG/imprimir/XLSX). Incluye "Combustibles" como chip fijo no
// editable aunque esté fuera del catálogo manual: es el centro automático.
export function CostCentersModal({ costCenters, docs, informalExpenses, companiesById, onClose, onChanged, onSelectDoc }) {
  "use no memo";
  const toast = useToast();
  const printRef = useRef(null);

  // --- CRUD del catálogo ---
  const [editing, setEditing] = useState(null); // { id?, label, emoji }
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // centro de costo a borrar, o null

  const startNew = () => setEditing({ id: null, label: "", emoji: "" });
  const startEdit = (c) => setEditing({ id: c.id, label: c.label, emoji: c.emoji || "" });

  const save = async () => {
    if (!editing.label.trim()) {
      toast.warning("Ponle un nombre al centro de costo.");
      return;
    }
    setBusy(true);
    try {
      const payload = { label: toTitleName(editing.label), emoji: (editing.emoji || "").trim() || null };
      if (editing.id) {
        await costCentersService.update(editing.id, payload);
      } else {
        await costCentersService.create(payload);
      }
      setEditing(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = (c) => setConfirmDelete(c);
  const doRemove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await costCentersService.remove(confirmDelete.id);
      if (selectedId === confirmDelete.id) setSelectedId("");
      await onChanged();
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  // --- Vista global del centro elegido ---
  const [selectedId, setSelectedId] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState(""); // "" | "venta" | "compra"
  const [companyFilterId, setCompanyFilterId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState({ key: "fechaEmision", dir: "asc" });
  const [exportBusy, setExportBusy] = useState("");
  // Modal de gasto informal: null = cerrado, "new" = crear, {expense} = editar.
  const [expenseModal, setExpenseModal] = useState(null);

  const companiesList = useMemo(() => companiesByName(companiesById), [companiesById]);

  const selectedCenter = costCenters.find((c) => c.id === selectedId);
  const selectedLabel = selectedId === FUEL_VIEW_ID
    ? "⛽ Combustibles"
    : selectedCenter
      ? (selectedCenter.emoji ? `${selectedCenter.emoji} ${selectedCenter.label}` : selectedCenter.label)
      : "";

  const baseDocs = useMemo(() => centerDocsOf(docs, selectedId), [docs, selectedId]);

  const hasFilters = !!(search.trim() || kindFilter || companyFilterId || dateFrom || dateTo);
  const clearFilters = () => {
    setSearch(""); setKindFilter(""); setCompanyFilterId(""); setDateFrom(""); setDateTo("");
  };

  const filtered = useMemo(() => filterCenterDocs({ baseDocs, kindFilter, companyFilterId, dateFrom, dateTo, search }), [baseDocs, kindFilter, companyFilterId, dateFrom, dateTo, search]);

  const baseInformal = useMemo(() => centerInformalOf(informalExpenses, selectedId, kindFilter), [informalExpenses, selectedId, kindFilter]);

  const filteredInformal = useMemo(() => filterCenterInformal({ baseInformal, companyFilterId, dateFrom, dateTo, search }), [baseInformal, companyFilterId, dateFrom, dateTo, search]);

  const totals = useMemo(() => centerDocTotals(filtered), [filtered]);

  const informalTotal = useMemo(() => informalTotalOf(filteredInformal), [filteredInformal]);

  const sorted = useMemo(() => sortCenterRows(filtered, filteredInformal, sortBy, companiesById), [filtered, filteredInformal, sortBy, companiesById]);
  const toggleSort = (key) => {
    setSortBy((cur) => cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  // --- Export: copiar/PNG/imprimir/XLSX del listado ya filtrado/ordenado ---
  const fileBase = useMemo(() => {
    const label = (selectedLabel || "centro_de_costo").replace(/[^\w-]+/g, "_");
    return `CentroCosto_${label}_${todayIso()}`;
  }, [selectedLabel]);

  const handleCopy = async () => {
    if (!printRef.current) return;
    setExportBusy("copy");
    try {
      const blob = await captureFullWidthBlob(printRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setExportBusy("");
    }
  };

  const handlePng = async () => {
    if (!printRef.current) return;
    setExportBusy("png");
    try {
      const dataUrl = await captureFullWidthDataUrl(printRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${fileBase}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast.error("Error PNG: " + (err.message || err));
    } finally {
      setExportBusy("");
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = printRef.current.outerHTML;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) { toast.warning("Permite las ventanas emergentes para imprimir."); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Centro de costo — ${selectedLabel}</title>
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

  const handleXlsx = async () => {
    setExportBusy("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Centro de costo");
      ws.getColumn(1).width = 6;  // col A vacía de medio ancho (convención)
      ws.getColumn(2).width = 12; // Fecha
      ws.getColumn(3).width = 22; // Empresa
      ws.getColumn(4).width = 10; // Mov.
      ws.getColumn(5).width = 22; // Documento
      ws.getColumn(6).width = 10; // Folio
      ws.getColumn(7).width = 30; // Contraparte
      ws.getColumn(8).width = 16; // RUT
      ws.getColumn(9).width = 14; // Neto
      ws.getColumn(10).width = 14; // IVA
      ws.getColumn(11).width = 14; // Total

      ws.getCell("B2").value = `CENTRO DE COSTO — ${selectedLabel}`;
      ws.getCell("B2").font = { bold: true, size: 14 };
      ws.mergeCells("B2:K2");
      const summaryLine = `${filtered.length} documento${filtered.length === 1 ? "" : "s"} · Neto ${fmtCurrency(totals.neto)} · IVA ${fmtCurrency(totals.iva)} · Total ${fmtCurrency(totals.total)}`
        + (filteredInformal.length > 0
          ? ` · + ${filteredInformal.length} gasto${filteredInformal.length === 1 ? "" : "s"} informal${filteredInformal.length === 1 ? "" : "es"} ${fmtCurrency(informalTotal)} · Total combinado ${fmtCurrency(totals.total + informalTotal)}`
          : "");
      ws.getCell("B3").value = summaryLine;
      ws.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
      ws.mergeCells("B3:K3");

      const HR = 5;
      const headers = ["Fecha", "Empresa", "Mov.", "Documento", "Folio", "Contraparte", "RUT", "Neto", "IVA", "Total"];
      headers.forEach((h, i) => {
        const c = ws.getCell(HR, 2 + i);
        c.value = h;
        c.font = { bold: true };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
        c.alignment = { horizontal: i <= 6 ? "left" : "right", vertical: "middle" };
        c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      });

      let r = HR + 1;
      for (const d of sorted) {
        if (d.__informal) {
          const company = companiesById.get(d.companyId);
          const cells = [d.date || "", company?.alias || company?.razonSocial || "", "Informal", "", "", d.detail || "", "", "", "", Number(d.amount) || 0];
          cells.forEach((v, j) => {
            const c = ws.getCell(r, 2 + j);
            c.value = v;
            c.alignment = { horizontal: j <= 6 ? "left" : "right" };
            c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
            if (j === 9) c.numFmt = '"$"#,##0';
            if (j === 2) c.font = { color: { argb: "FFB8860B" } };
          });
          r++;
          continue;
        }
        const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
        const sign = isNC ? -1 : 1;
        const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
        const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
        const company = companiesById.get(d.companyId);
        const cells = [
          d.fechaEmision || "",
          company?.alias || company?.razonSocial || "",
          d.kind === "venta" ? "Venta" : "Compra",
          d.tipoLabel || dteTypeLabel(d.tipo),
          d.folio,
          razon || "",
          formatRutForDisplay(rut) || "",
          sign * (Number(d.neto) || 0),
          sign * (Number(d.iva) || 0),
          sign * (Number(d.total) || 0),
        ];
        cells.forEach((v, j) => {
          const c = ws.getCell(r, 2 + j);
          c.value = v;
          c.alignment = { horizontal: j <= 6 ? "left" : "right" };
          c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
          if (j >= 7 && j <= 9) c.numFmt = '"$"#,##0';
          if (isNC && j >= 7 && j <= 9) c.font = { color: { argb: "FFCC0000" } };
        });
        r++;
      }

      ws.getCell(r, 2).value = `TOTAL (${filtered.length})`;
      ws.mergeCells(r, 2, r, 8);
      for (let col = 2; col <= 11; col++) {
        ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        ws.getCell(r, col).font = { bold: true };
      }
      [totals.neto, totals.iva, totals.total].forEach((v, j) => {
        const c = ws.getCell(r, 9 + j);
        c.value = v;
        c.numFmt = '"$"#,##0';
        c.alignment = { horizontal: "right" };
      });
      r++;

      if (filteredInformal.length > 0) {
        ws.getCell(r, 2).value = `GASTOS INFORMALES (${filteredInformal.length})`;
        ws.mergeCells(r, 2, r, 8);
        for (let col = 2; col <= 11; col++) {
          ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE9C8" } };
          ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
          ws.getCell(r, col).font = { bold: true };
        }
        ws.getCell(r, 11).value = informalTotal;
        ws.getCell(r, 11).numFmt = '"$"#,##0';
        ws.getCell(r, 11).alignment = { horizontal: "right" };
        r++;

        ws.getCell(r, 2).value = "TOTAL COMBINADO";
        ws.mergeCells(r, 2, r, 8);
        for (let col = 2; col <= 11; col++) {
          ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
          ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
          ws.getCell(r, col).font = { bold: true };
        }
        ws.getCell(r, 11).value = totals.total + informalTotal;
        ws.getCell(r, 11).numFmt = '"$"#,##0';
        ws.getCell(r, 11).alignment = { horizontal: "right" };
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${fileBase}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error("Error XLSX: " + (err.message || err));
    } finally {
      setExportBusy("");
    }
  };

  const selectClass = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs";

  return (
    <Modal open onClose={onClose} size="full" title="Centros de costo">
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Nombre</label>
            <input
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder="Arriendo, Mantención, etc."
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Emoji (opcional)</label>
            <input
              value={editing.emoji}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
              placeholder="🏠"
              maxLength={4}
              className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              {busy ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-muted)]">
            Categorías para agrupar documentos que no calzan con la agrupación por proveedor (ej. "Arriendo",
            "Mantención"). "Combustibles" es aparte — se detecta automático por código SII, no hace falta crearlo.
          </p>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Ver documentos de</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                <option value="">Elige un centro de costo…</option>
                <option value={FUEL_VIEW_ID}>⛽ Combustibles (automático)</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ${c.label}` : c.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowCatalog((v) => !v)}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium ${
                showCatalog
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
              }`}
            >
              🗂 Gestión de centros{showCatalog ? " ▲" : " ▼"}
            </button>
          </div>

          {showCatalog && (
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Crear y editar centros de costo
                </span>
                <button
                  onClick={startNew}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-accent-fg)]"
                >
                  + Nuevo centro de costo
                </button>
              </div>
              {costCenters.length === 0 ? (
                <div className="py-3 text-center text-xs text-[var(--color-muted)]">No hay centros de costo manuales todavía.</div>
              ) : (
                <div className="space-y-1">
                  {costCenters.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5"
                    >
                      <div className="min-w-0 flex-1 truncate text-sm font-medium">
                        {c.emoji ? `${c.emoji} ` : ""}{c.label}
                      </div>
                      <button
                        onClick={() => startEdit(c)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => remove(c)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!selectedId ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]">
              Elige un centro de costo arriba para ver todos sus documentos.
            </div>
          ) : (
            <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
              {/* Filtros propios de la vista — no tocan los filtros de la tabla principal. */}
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Buscar</label>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Contraparte, RUT o folio"
                    className={`${selectClass} w-44`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Mov.</label>
                  <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={selectClass}>
                    <option value="">Todos</option>
                    <option value="venta">Venta</option>
                    <option value="compra">Compra</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Empresa</label>
                  <select value={companyFilterId} onChange={(e) => setCompanyFilterId(e.target.value)} className={selectClass}>
                    <option value="">Todas</option>
                    {companiesList.map((co) => (
                      <option key={co.id} value={co.id}>{co.alias || co.razonSocial}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Desde</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectClass} />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Hasta</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectClass} />
                </div>
                {hasFilters && (
                  <button onClick={clearFilters} className="pb-1.5 text-xs text-[var(--color-muted)] underline hover:text-[var(--color-text)]">
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-[var(--color-muted)]">
                    {filtered.length} documento{filtered.length === 1 ? "" : "s"} · Neto {fmtCurrency(totals.neto)} · IVA {fmtCurrency(totals.iva)} ·{" "}
                    <span className="font-semibold text-[var(--color-text)]">Total {fmtCurrency(totals.total)}</span>
                    {filteredInformal.length > 0 && (
                      <>
                        {" "}· <span className="text-[var(--color-warning)]">
                          + {filteredInformal.length} gasto{filteredInformal.length === 1 ? "" : "s"} informal{filteredInformal.length === 1 ? "" : "es"} · {fmtCurrency(informalTotal)}
                        </span>
                        {" "}· <span className="font-semibold text-[var(--color-text)]">Total combinado {fmtCurrency(totals.total + informalTotal)}</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setExpenseModal("new")}
                    className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2 py-1 text-xs font-medium text-[var(--color-warning)] hover:opacity-80"
                  >
                    + Gasto informal
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={handleCopy} disabled={!!exportBusy || sorted.length === 0} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Copiar como imagen">
                    {exportBusy === "copy" ? "..." : "📋 Copiar"}
                  </button>
                  <button onClick={handlePng} disabled={!!exportBusy || sorted.length === 0} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Descargar PNG">
                    {exportBusy === "png" ? "..." : "📥 PNG"}
                  </button>
                  <button onClick={handlePrint} disabled={!!exportBusy || sorted.length === 0} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Imprimir">
                    🖨 Imprimir
                  </button>
                  <button onClick={handleXlsx} disabled={!!exportBusy || sorted.length === 0} className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60" title="Exportar XLSX">
                    {exportBusy === "xlsx" ? "..." : "📊 XLSX"}
                  </button>
                </div>
              </div>

              {sorted.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
                  {baseDocs.length === 0 && baseInformal.length === 0
                    ? `No hay nada registrado en "${selectedLabel}" todavía.`
                    : "Nada calza con estos filtros."}
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-auto rounded-md border border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                      <tr>
                        <SortHeader sortKey="fechaEmision" sortBy={sortBy} onToggle={toggleSort}>Fecha</SortHeader>
                        <SortHeader sortKey="empresa" sortBy={sortBy} onToggle={toggleSort}>Empresa</SortHeader>
                        <th className="px-2 py-2 text-left">Mov.</th>
                        <th className="px-2 py-2 text-left">Tipo</th>
                        <SortHeader sortKey="folio" sortBy={sortBy} onToggle={toggleSort} align="right">Folio</SortHeader>
                        <SortHeader sortKey="razon" sortBy={sortBy} onToggle={toggleSort}>Contraparte</SortHeader>
                        <th className="px-2 py-2 text-left">RUT</th>
                        <SortHeader sortKey="neto" sortBy={sortBy} onToggle={toggleSort} align="right">Neto</SortHeader>
                        <SortHeader sortKey="iva" sortBy={sortBy} onToggle={toggleSort} align="right">IVA</SortHeader>
                        <SortHeader sortKey="total" sortBy={sortBy} onToggle={toggleSort} align="right">Total</SortHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((d) => {
                        if (d.__informal) {
                          const company = companiesById.get(d.companyId);
                          return (
                            <tr
                              key={`inf_${d.id}`}
                              onClick={() => setExpenseModal(d)}
                              className="cursor-pointer border-t border-[var(--color-border)] bg-[var(--color-warning-soft)]/40 hover:bg-[var(--color-warning-soft)]"
                            >
                              <td className="px-2 py-1.5 font-mono text-xs">{d.date || "—"}</td>
                              <td className="px-2 py-1.5 truncate max-w-[160px]">{company?.alias || company?.razonSocial || "—"}</td>
                              <td className="px-2 py-1.5 text-xs">
                                <span className="rounded px-1.5 py-0.5 bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
                                  ⚠ Informal
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-xs text-[var(--color-muted)]">—</td>
                              <td className="px-2 py-1.5 text-right text-[var(--color-muted)]">—</td>
                              <td className="px-2 py-1.5 truncate max-w-[220px]">{d.detail || "—"}</td>
                              <td className="px-2 py-1.5 text-[var(--color-muted)]">—</td>
                              <td className="px-2 py-1.5 text-right text-[var(--color-muted)]">—</td>
                              <td className="px-2 py-1.5 text-right text-[var(--color-muted)]">—</td>
                              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtCurrency(d.amount)}</td>
                            </tr>
                          );
                        }
                        const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
                        const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
                        const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
                        const company = companiesById.get(d.companyId);
                        return (
                          <tr
                            key={d.id}
                            onClick={() => onSelectDoc(d)}
                            className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                          >
                            <td className="px-2 py-1.5 font-mono text-xs">{d.fechaEmision || "—"}</td>
                            <td className="px-2 py-1.5 truncate max-w-[160px]">{company?.alias || company?.razonSocial || "—"}</td>
                            <td className="px-2 py-1.5 text-xs">
                              <span className={`rounded px-1.5 py-0.5 ${d.kind === "venta" ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "bg-[var(--color-surface-2)]"}`}>
                                {d.kind === "venta" ? "Venta" : "Compra"}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-xs">
                              <span className={isNC ? "rounded px-1.5 py-0.5 bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : ""}>
                                {d.tipoLabel || dteTypeLabel(d.tipo)}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.folio}</td>
                            <td className="px-2 py-1.5 truncate max-w-[220px]">{razon || "—"}</td>
                            <td className="px-2 py-1.5 font-mono text-xs">{formatRutForDisplay(rut)}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>{isNC ? "−" : ""}{fmtCurrency(d.neto)}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>{isNC ? "−" : ""}{fmtCurrency(d.iva)}</td>
                            <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>{isNC ? "−" : ""}{fmtCurrency(d.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[10px] text-[var(--color-muted)]">
                Click en una fila para abrir su detalle. Las filas ⚠ Informal son gastos sin factura/boleta formal — no afectan la data fiscal real.
              </p>

              {/* Printable fuera de pantalla para html-to-image e impresión. */}
              <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
                <PrintableCostCenterDocs
                  ref={printRef}
                  label={selectedLabel}
                  docs={sorted}
                  totals={totals}
                  informalTotal={informalTotal}
                  informalCount={filteredInformal.length}
                  companiesById={companiesById}
                />
              </div>
            </div>
          )}

          {expenseModal && (
            <InformalExpenseFormModal
              expense={expenseModal === "new" ? null : expenseModal}
              costCenterId={selectedId}
              companiesList={companiesList}
              onClose={() => setExpenseModal(null)}
              onSaved={onChanged}
              onDeleted={onChanged}
            />
          )}

          <ConfirmDialog
            open={!!confirmDelete}
            title="Eliminar centro de costo"
            message={confirmDelete ? `¿Eliminar el centro de costo "${confirmDelete.label}"? Los documentos que ya tenían este centro asignado quedarán sin etiqueta.` : ""}
            confirmLabel="Eliminar"
            danger
            busy={busy}
            onConfirm={doRemove}
            onCancel={() => !busy && setConfirmDelete(null)}
          />

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
