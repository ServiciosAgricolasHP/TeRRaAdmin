import { useState } from "react";
import { normalizeRut, parseSiiRcvCsv, extractRutFromFilename, buildDteDocId } from "../../utils/siiCsvParser";
import { importDteRecords } from "../../services/dteImportService";
import { auth } from "../../firebase";
import { attempt } from "../../utils/attempt";

// Importar el RCV del SII: elegir la empresa y los archivos, leer cada uno
// (ventas o compras según su encabezado, con aviso si el RUT del nombre no es
// el de la empresa), excluir los que no van y confirmar. Nada se escribe hasta
// confirmar.
export function useRcvImport({ companies, companiesById, loadAll, selectedCompanyId, toast }) {
  // Modales
  const [importPreview, setImportPreview] = useState(null);
  const [importCompanyId, setImportCompanyId] = useState("");
  const [importing, setImporting] = useState(false);

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
      const { error: err } = await attempt(async () => {
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
      });
      if (err) {
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
    const { error: err } = await attempt(async () => {
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
    });
    if (err) toast.error("Error al guardar: " + (err.message || String(err)));
    setImporting(false);
  };
  return {
    confirmImport,
    importCompanyId,
    importing,
    importPreview,
    onFilesPick,
    openImport,
    setImportCompanyId,
    setImportPreview,
    toggleFileExclusion,
  };
}
