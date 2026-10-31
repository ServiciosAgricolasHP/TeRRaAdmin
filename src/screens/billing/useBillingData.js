import { useState, useMemo, useEffect, useEffectEvent } from "react";
import { companiesService, dteDocumentsService, costCentersService, informalExpensesService } from "../../services";
import { attempt } from "../../utils/attempt";
import { readStored, writeStored } from "../../utils/browserStorage";

// Clave de localStorage con la última empresa elegida, que se recuerda entre
// sesiones.
const LS_SELECTED_COMPANY = "facturacion.selectedCompanyId";

// Lo que Facturación carga al abrir: empresas, documentos del RCV, centros de
// costo y gastos informales, cacheados 10 minutos. Recuerda la empresa elegida
// en el dispositivo y, si ya no existe, toma la primera.
export function useBillingData() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => readStored(LS_SELECTED_COMPANY, ""));
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
    const { error: err } = await attempt(async () => {
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
    });
    setLoading(false);
    if (err) throw err;
  };

  // Carga al montar; `useEffectEvent` lee la versión actual de la función sin
  // volver a correr el efecto cuando cambia.
  const loadOnMount = useEffectEvent(() => loadAll());
  useEffect(() => { loadOnMount(); }, []);

  // Guarda la empresa elegida para la próxima visita a la pantalla.
  useEffect(() => {
    writeStored(LS_SELECTED_COMPANY, selectedCompanyId || "");
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
