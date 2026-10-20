// Pantalla de facturación: multi-empresa, vista por mes actual con selector de
// período, estados de pago y reemplazo por período con borrado de huérfanos.
//
// La emisión se hace en el portal del SII. Aquí solo se importa el RCV
// mensual y se gestiona el estado de pago de cada factura.

import React, { useState, useRef, useEffect, useMemo } from "react";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../utils/imageCapture";
import { serverTimestamp } from "firebase/firestore";
import { auth } from "../firebase";
import { companiesService, dteDocumentsService, costCentersService, informalExpensesService } from "../services";
import { importDteRecords } from "../services/dteImportService";
import { normalizeRut, parseSiiRcvCsv, extractRutFromFilename, buildDteDocId, dteTypeLabel } from "../utils/siiCsvParser";
import { formatRutForDisplay } from "../utils/rutUtils";
import { unshout } from "../utils/textCase";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  CREDIT_NOTE_TYPES,
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
import { CostCenterSelect } from "./billing/CostCenterSelect";
import { CostCentersModal } from "./billing/CostCentersModal";
import { DocDetailModal } from "./billing/DocDetailModal";
import {
  PAYMENT_STATUSES,
  kindTitleLabel,
  formatPeriodPretty,
  CREDIT_NOTE_STATE,
  groupDocsByCostCenter,
  currentPeriod,
} from "./billing/docs";
import { ImportPreviewModal } from "./billing/ImportPreviewModal";
import { OtherTaxChip } from "./billing/OtherTaxChip";
import { PaymentStatusSelect } from "./billing/PaymentStatusSelect";
import { ReceivablesModal } from "./billing/ReceivablesModal";
import { PrintableDocList } from "./billing/PrintableDocList";
import { PrintableWithholdings } from "./billing/PrintableWithholdings";
import { PrintableWithholdingsGroup } from "./billing/PrintableWithholdingsGroup";
import { WithholdingsView } from "./billing/WithholdingsView";
import { SortHeader } from "./billing/SortHeader";
import { SummaryCard } from "./billing/SummaryCard";
import { writeWithholdingsXlsx } from "./billing/writeWithholdingsXlsx";
import { writeWithholdingGroupXlsx } from "./billing/writeWithholdingGroupXlsx";
import { writeDocListXlsx } from "./billing/writeDocListXlsx";
import { AnnualSummaryTab } from "./billing/AnnualSummaryTab";
import { ProjectionTab } from "./billing/ProjectionTab";

// Los tipos de DTE que restan (notas de crédito) viven en
// `utils/cashFlowProjection` junto con la proyección, que necesita el mismo
// criterio: si una NC no restara ahí, la base proyectada saldría inflada.

// Clave de localStorage con la última empresa elegida, que se recuerda entre
// sesiones.
const LS_SELECTED_COMPANY = "facturacion.selectedCompanyId";

// Tamaño de página de la tabla principal. La vista plana pagina siempre, haya
// o no búsqueda, para que meses con cientos de docs no rendericen todo.
const PAGE_SIZE = 20;

export default function Billing() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    try { return localStorage.getItem(LS_SELECTED_COMPANY) || ""; } catch { return ""; }
  });
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
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
  // Modales
  const [importPreview, setImportPreview] = useState(null);
  const [importCompanyId, setImportCompanyId] = useState("");
  const [importing, setImporting] = useState(false);
  const [companiesModalOpen, setCompaniesModalOpen] = useState(false);
  const [receivablesModalOpen, setReceivablesModalOpen] = useState(false);
  // Catálogo manual de centros de costo ficticios (ver costCentersService),
  // global para todas las empresas. "Combustibles" no está aquí: sale
  // automáticamente del código de impuesto del SII.
  const [costCenters, setCostCenters] = useState([]);
  // Gastos informales (sin factura/boleta formal) por centro de costo — ver
  // informalExpensesService. Puramente informativo, nunca entra a dteDocuments
  // ni a los totales/exports fiscales reales.
  const [informalExpenses, setInformalExpenses] = useState([]);
  // Modal de centros de costo: crear/editar/eliminar + vista global de TODOS
  // los documentos de un centro elegido, de todas las empresas y períodos
  // (ignora los filtros de la tabla principal), ordenados cronológicamente.
  // Independiente del toggle de agrupación de la tabla.
  const [costCentersModalOpen, setCostCentersModalOpen] = useState(false);
  // Modal de detalle: muestra todos los campos del DTE + notas editables.
  // Se abre al click en el botón ℹ de cada fila.
  const [detailDoc, setDetailDoc] = useState(null);
  // Refs de los printables fuera de pantalla (retenciones, listado, resumen)
  // para html-to-image e impresión.
  const withholdingsPrintRef = useRef(null);
  const docListPrintRef = useRef(null);
  const [exportBusy, setExportBusy] = useState("");
  const [docListBusy, setDocListBusy] = useState("");
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

  const companiesById = useMemo(
    () => new Map(companies.map((c) => [c.id, c])),
    [companies],
  );
  const costCentersById = useMemo(
    () => new Map(costCenters.map((c) => [c.id, c])),
    [costCenters],
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const [comps, list, centers, expenses] = await Promise.all([
        companiesService.list({ order: ["razonSocial", "asc"], cache: true, ttl: 600_000 }),
        dteDocumentsService.list({ order: ["fechaEmision", "desc"], cache: true, ttl: 600_000 }),
        costCentersService.list({ order: ["label", "asc"], cache: true, ttl: 600_000 }),
        informalExpensesService.list({ order: ["date", "desc"], cache: true, ttl: 600_000 }),
      ]);
      setCompanies(comps);
      setDocs(list);
      setCostCenters(centers);
      setInformalExpenses(expenses);
      // Si la empresa guardada ya no existe o no hay ninguna elegida, toma la
      // primera; si no, respeta la última elección.
      if (comps.length > 0 && !comps.some((c) => c.id === selectedCompanyId)) {
        setSelectedCompanyId(comps[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Guarda la empresa elegida para la próxima visita a la pantalla.
  useEffect(() => {
    try { localStorage.setItem(LS_SELECTED_COMPANY, selectedCompanyId || ""); } catch { /* noop */ }
  }, [selectedCompanyId]);

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
  useEffect(() => {
    setPage(1);
  }, [kindTab, selectedCompanyId, periodFilter, typeFilter, paymentFilter, search, sortBy]);
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

  // --- IMPORTACIÓN ---

  const openImport = () => {
    if (companies.length === 0) {
      toast.warning("Tienes que registrar al menos una empresa antes de importar. Usa el botón 🏢 Empresas.");
      return;
    }
    setImportCompanyId(selectedCompanyId || companies[0].id);
  };

  // Varios archivos: parsea cada uno por separado. Cada uno trae su propio
  // kind (ventas/compras) detectado del encabezado, sus stats, sus errores y un
  // RUT sacado del nombre del archivo para avisar si no coincide con la
  // empresa elegida.
  const onFilesPick = async (files) => {
    if (!files || files.length === 0) return;
    if (!importCompanyId) {
      toast.warning("Selecciona una empresa antes de elegir los archivos.");
      return;
    }
    const company = companiesById.get(importCompanyId);
    const companyRutNormalized = company?.rut ? normalizeRut(company.rut) : "";
    const parsedFiles = [];
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const parsed = parseSiiRcvCsv(buffer, { companyRut: company?.rut || "" });
        const detectedRut = extractRutFromFilename(file.name);
        const detectedRutNormalized = detectedRut ? normalizeRut(detectedRut) : "";
        const rutMismatch = !!(detectedRutNormalized && companyRutNormalized && detectedRutNormalized !== companyRutNormalized);
        const recordsWithId = parsed.records.map((r) => ({
          ...r,
          id: buildDteDocId({
            companyId: importCompanyId,
            kind: r.kind,
            tipo: r.tipo,
            folio: r.folio,
            rutEmisor: r.rutEmisor,
            rutReceptor: r.rutReceptor,
          }),
          companyId: importCompanyId,
          companyAlias: company?.alias || company?.razonSocial || "",
          sourceFile: file.name,
        }));
        parsedFiles.push({
          name: file.name,
          kind: parsed.kind,
          records: recordsWithId,
          errors: parsed.errors,
          stats: parsed.stats,
          detectedRut: detectedRutNormalized,
          rutMismatch,
          excluded: false, // el usuario puede excluir archivos sospechosos
        });
      } catch (err) {
        parsedFiles.push({
          name: file.name,
          kind: null,
          records: [],
          errors: [{ line: 0, message: err.message || String(err) }],
          stats: { count: 0, byTipo: {}, totalAmount: 0 },
          detectedRut: extractRutFromFilename(file.name),
          rutMismatch: false,
          excluded: true,
          parseFailed: true,
        });
      }
    }
    setImportPreview({ files: parsedFiles });
  };

  // Incluye o excluye un archivo del import desde el modal.
  const toggleFileExclusion = (fileName) => {
    setImportPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map((f) =>
          f.name === fileName ? { ...f, excluded: !f.excluded } : f,
        ),
      };
    });
  };

  // Confirmar import: junta los records de TODOS los archivos no excluidos y
  // los pasa a `importDteRecords`, que por cada (kind, periodo) de la empresa
  // hace un "replace": borra los huérfanos (estaban antes y ya no vienen) y
  // escribe los nuevos o actualizados, en batches de hasta 450 escrituras.
  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const allRecords = importPreview.files
        .filter((f) => !f.excluded && !f.parseFailed)
        .flatMap((f) => f.records);
      if (allRecords.length === 0) {
        toast.warning("No hay registros para importar (todos los archivos están excluidos o fallaron).");
        setImporting(false);
        return;
      }
      const { totalNew, totalOverwrite, totalDeleted } = await importDteRecords({
        companyId: importCompanyId,
        records: allRecords,
        uid: auth.currentUser?.uid || null,
      });
      const filesProcessed = importPreview.files.filter((f) => !f.excluded && !f.parseFailed).length;
      toast.success(
        `${filesProcessed} archivo${filesProcessed === 1 ? "" : "s"} procesado${filesProcessed === 1 ? "" : "s"}.\n` +
        `Nuevos: ${totalNew} · Sobreescritos: ${totalOverwrite} · Huérfanos eliminados: ${totalDeleted}\n` +
        `Total: ${allRecords.length}`,
        { title: "Importación lista" },
      );
      setImportPreview(null);
      setImportCompanyId("");
      await loadAll();
    } catch (err) {
      toast.error("Error al guardar: " + (err.message || String(err)));
    } finally {
      setImporting(false);
    }
  };

  // --- Marcar estado de pago de una factura ---
  // Fija el estado directamente; la UI lo ofrece como un `<select>` por fila.
  const setPaymentStatus = async (dteDoc, newStatus) => {
    if (!PAYMENT_STATUSES[newStatus]) return;
    if ((dteDoc.paymentStatus || "unpaid") === newStatus) return;
    try {
      await dteDocumentsService.update(dteDoc.id, {
        paymentStatus: newStatus,
        paymentStatusSetAt: serverTimestamp(),
        paymentStatusSetBy: auth.currentUser?.uid || null,
      });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, paymentStatus: newStatus } : d)));
    } catch (err) {
      toast.error("Error al cambiar estado: " + (err.message || err));
    }
  };

  // Guarda notas o detalle libre de un DTE: la glosa que el SII no incluye en
  // el CSV o apuntes de seguimiento interno.
  const saveDocNotes = async (dteDoc, rawNotes) => {
    const notes = unshout(rawNotes);
    try {
      await dteDocumentsService.update(dteDoc.id, { notes });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, notes } : d)));
      setDetailDoc((cur) => (cur?.id === dteDoc.id ? { ...cur, notes } : cur));
    } catch (err) {
      toast.error("Error al guardar notas: " + (err.message || err));
    }
  };

  // Asigna (o quita) el centro de costo ficticio manual de un documento.
  // Los combustibles se agrupan solos; este campo es para las demás
  // categorías, que el usuario define a mano.
  const saveDocCostCenter = async (dteDoc, costCenterId) => {
    const next = costCenterId || null;
    try {
      await dteDocumentsService.update(dteDoc.id, { costCenterId: next });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, costCenterId: next } : d)));
      setDetailDoc((cur) => (cur?.id === dteDoc.id ? { ...cur, costCenterId: next } : cur));
    } catch (err) {
      toast.error("Error al asignar centro de costo: " + (err.message || err));
    }
  };

  // Guarda el array completo de pagos junto con `amountPaid` denormalizado
  // (su suma), que el orden por saldo y los pendientes leen sin recorrer el
  // array.
  const saveDocPayments = async (dteDoc, payments) => {
    const amountPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    try {
      await dteDocumentsService.update(dteDoc.id, { payments, amountPaid });
      setDocs((prev) => prev.map((d) => (d.id === dteDoc.id ? { ...d, payments, amountPaid } : d)));
      setDetailDoc((cur) => (cur?.id === dteDoc.id ? { ...cur, payments, amountPaid } : cur));
    } catch (err) {
      toast.error("Error al guardar pagos: " + (err.message || err));
    }
  };

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

  const selectedCompany = companiesById.get(selectedCompanyId);
  const noCompany = companies.length === 0;

  // ===== Export por contraparte (individual) =====
  // Nombre de archivo seguro para una contraparte.
  const groupFileBase = (g) => {
    const alias = (selectedCompany?.alias || selectedCompany?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    const contra = (g.razon || "contraparte").replace(/[^\w-]+/g, "_").slice(0, 40);
    const period = periodFilter || "todos";
    return `Retencion_${alias}_${contra}_${period}`;
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
        <div className="flex h-40 items-center justify-center text-[var(--color-muted)]">
          Cargando...
        </div>
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
          toast={toast}
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
      ) : (
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

        {isMobile ? (
          <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
            {(() => {
              const renderDocCard = (d) => {
                const razon = kindTab === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
                const rut = kindTab === "venta" ? d.rutReceptor : d.rutEmisor;
                const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
                const isFuel = d.otroImpuestoCategory === "combustible";
                const st = d.paymentStatus || "unpaid";
                const hasNotes = !!(d.notes && d.notes.trim());
                const pays = Array.isArray(d.payments) ? d.payments : [];
                const paid = Number(d.amountPaid) || pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                const bal = (Number(d.total) || 0) - paid;
                const fullyPaid = bal <= 0.01;
                return (
                  <div key={d.id} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
                          <span className="font-mono">{d.fechaEmision}</span>
                          <span className={isNC ? "rounded px-1.5 py-0.5 bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : ""}>
                            {d.tipoLabel || dteTypeLabel(d.tipo)}
                          </span>
                          <OtherTaxChip code={d.otroImpuestoCodigo} tasa={d.retencionTasa} />
                          <span className="font-mono">· Folio {d.folio}</span>
                        </div>
                        <div className="mt-0.5 truncate text-sm font-medium">{razon || "—"}</div>
                        <div className="font-mono text-[10px] text-[var(--color-muted)]">{formatRutForDisplay(rut)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-sm font-semibold tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
                          {isNC ? "−" : ""}{fmtCurrency(d.total)}
                        </div>
                        <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
                          N {isNC ? "−" : ""}{fmtCurrency(d.neto)} · IVA {isNC ? "−" : ""}{fmtCurrency(d.iva)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {!isNC && paid > 0 && (
                        <span className={`text-[10px] ${fullyPaid ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
                          {fullyPaid ? `✓ Pagado (${pays.length})` : `Abono ${fmtCurrency(paid)} · Saldo ${fmtCurrency(bal)}`}
                        </span>
                      )}
                      {isFuel ? (
                        <span
                          title="Agrupado automáticamente como Combustible (código SII de otro impuesto)"
                          className="rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-warning)]"
                        >
                          ⛽ auto
                        </span>
                      ) : (
                        <CostCenterSelect
                          value={d.costCenterId || ""}
                          costCenters={costCenters}
                          onChange={(next) => saveDocCostCenter(d, next)}
                        />
                      )}
                      {kindTab === "venta" && (
                        isNC ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CREDIT_NOTE_STATE.chip}`}>
                            {CREDIT_NOTE_STATE.label}
                          </span>
                        ) : (
                          <>
                            <PaymentStatusSelect value={st} onChange={(next) => setPaymentStatus(d, next)} />
                            {cancellingByDocId.has(d.id) && st !== "cancelled" && (
                              <button
                                onClick={() => setDetailDoc(d)}
                                title={`Posible NC anula esta factura (${cancellingByDocId.get(d.id).length} candidata${cancellingByDocId.get(d.id).length === 1 ? "" : "s"}). Click para revisar.`}
                                className="rounded-full bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-danger)] hover:opacity-80"
                              >
                                ⚠ NC?
                              </button>
                            )}
                          </>
                        )
                      )}
                      <button
                        onClick={() => setDetailDoc(d)}
                        title={hasNotes ? "Ver detalle (tiene notas)" : "Ver detalle / agregar notas"}
                        className="ml-auto min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
                      >
                        {hasNotes ? "📝 Detalle" : "ℹ Detalle"}
                      </button>
                    </div>
                  </div>
                );
              };

              if (!groupByCostCenter) return pagedDocs.map(renderDocCard);

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
                    {g.docs.map(renderDocCard)}
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
                const renderDocRow = (d) => {
                const razon = kindTab === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
                const rut = kindTab === "venta" ? d.rutReceptor : d.rutEmisor;
                const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
                const isFuel = d.otroImpuestoCategory === "combustible";
                const st = d.paymentStatus || "unpaid";
                const hasNotes = !!(d.notes && d.notes.trim());
                return (
                  <tr key={d.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-2 py-1.5 font-mono text-xs">{d.fechaEmision}</td>
                    <td className="px-2 py-1.5 text-xs">
                      <span className={isNC ? "rounded px-1.5 py-0.5 bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : ""}>
                        {d.tipoLabel || dteTypeLabel(d.tipo)}
                      </span>
                      <OtherTaxChip code={d.otroImpuestoCodigo} tasa={d.retencionTasa} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.folio}</td>
                    <td className="px-2 py-1.5 truncate max-w-[260px]">{razon || "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{formatRutForDisplay(rut)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
                      {isNC ? "−" : ""}{fmtCurrency(d.neto)}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
                      {isNC ? "−" : ""}{fmtCurrency(d.iva)}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
                      {isNC ? "−" : ""}{fmtCurrency(d.total)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {(() => {
                        if (isNC) return <span className="text-[var(--color-muted)]">—</span>;
                        const pays = Array.isArray(d.payments) ? d.payments : [];
                        const paid = Number(d.amountPaid) || pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                        if (paid <= 0) return <span className="text-[var(--color-muted)]">—</span>;
                        const bal = (Number(d.total) || 0) - paid;
                        const full = bal <= 0.01;
                        return (
                          <div className="flex flex-col items-end leading-tight">
                            <span>{fmtCurrency(paid)}</span>
                            <span className={`text-[10px] ${full ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
                              {full ? `✓ ${pays.length} abono${pays.length === 1 ? "" : "s"}` : `Saldo ${fmtCurrency(bal)}`}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1.5">
                      {isFuel ? (
                        <span
                          title="Agrupado automáticamente como Combustible (código SII de otro impuesto)"
                          className="rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-warning)]"
                        >
                          ⛽ auto
                        </span>
                      ) : (
                        <CostCenterSelect
                          value={d.costCenterId || ""}
                          costCenters={costCenters}
                          onChange={(next) => saveDocCostCenter(d, next)}
                        />
                      )}
                    </td>
                    {kindTab === "venta" && (
                      <td className="px-2 py-1.5 text-center">
                        {isNC ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CREDIT_NOTE_STATE.chip}`}>
                            {CREDIT_NOTE_STATE.label}
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <PaymentStatusSelect
                              value={st}
                              onChange={(next) => setPaymentStatus(d, next)}
                            />
                            {cancellingByDocId.has(d.id) && st !== "cancelled" && (
                              <button
                                onClick={() => setDetailDoc(d)}
                                title={`Posible NC anula esta factura (${cancellingByDocId.get(d.id).length} candidata${cancellingByDocId.get(d.id).length === 1 ? "" : "s"}). Click para revisar.`}
                                className="rounded-full bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-danger)] hover:opacity-80"
                              >
                                ⚠ NC?
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => setDetailDoc(d)}
                        title={hasNotes ? "Ver detalle (tiene notas)" : "Ver detalle / agregar notas"}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
                      >
                        {hasNotes ? "📝" : "ℹ"}
                      </button>
                    </td>
                  </tr>
                );
                };

                if (!groupByCostCenter) return pagedDocs.map(renderDocRow);

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
                    {g.docs.map(renderDocRow)}
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
