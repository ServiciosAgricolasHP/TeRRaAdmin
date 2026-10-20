import { useState, useMemo, useEffect } from "react";
import { companiesService, dteDocumentsService, costCentersService, informalExpensesService } from "../../services";

// Clave de localStorage con la última empresa elegida, que se recuerda entre
// sesiones.
const LS_SELECTED_COMPANY = "facturacion.selectedCompanyId";

// Lo que Facturación carga al abrir: empresas, documentos del RCV, centros de
// costo y gastos informales, cacheados 10 minutos. Recuerda la empresa elegida
// en el dispositivo y, si ya no existe, toma la primera.
export function useBillingData() {
  "use no memo";
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    try { return localStorage.getItem(LS_SELECTED_COMPANY) || ""; } catch { return ""; }
  });
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Catálogo manual de centros de costo ficticios (ver costCentersService),
  // global para todas las empresas. "Combustibles" no está aquí: sale
  // automáticamente del código de impuesto del SII.
  const [costCenters, setCostCenters] = useState([]);
  // Gastos informales (sin factura/boleta formal) por centro de costo — ver
  // informalExpensesService. Puramente informativo, nunca entra a dteDocuments
  // ni a los totales/exports fiscales reales.
  const [informalExpenses, setInformalExpenses] = useState([]);

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
  return {
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
  };
}
