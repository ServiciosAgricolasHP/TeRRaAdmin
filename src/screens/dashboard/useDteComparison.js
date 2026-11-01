import { useState, useEffect, useMemo } from "react";
import { companiesService } from "../../services";
import { countedList } from "../../services/cache";
import { syncDteDocuments } from "../../services/dteDocumentsList";
import { DTE_MONTHS, dteMonthlyTotals, lastMonthKeys } from "../../utils/dashboard";
import { attempt } from "../../utils/attempt";

// Comparativa compras/ventas, de una empresa a la vez. Los documentos salen de
// la copia que comparte con Facturación (`syncDteDocuments`): cambiar de
// empresa no lee nada.
export function useDteComparison() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [docs, setDocs] = useState(null);
  const [reads, setReads] = useState(0);
  const [error, setError] = useState("");

  // Catálogo de empresas para el selector. Misma clave de caché que
  // Facturación: no cuesta lecturas si esa pantalla ya lo cargó.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { error: err } = await attempt(async () => {
        const { data, reads } = await countedList(companiesService, {
          order: ["razonSocial", "asc"],
          cache: true,
          ttl: 600_000,
        });
        if (cancelled) return;
        setCompanies(data);
        setCompanyId((prev) => prev || data[0]?.id || "");
        setReads((r) => r + reads);
      });
      if (err && !cancelled) console.error("[dashboard] empresas:", err);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { value, error: err } = await attempt(() => syncDteDocuments());
      if (cancelled) return;
      if (err) {
        console.error("[dashboard] comparativa de facturación:", err);
        setError("No se pudo cargar la facturación.");
        return;
      }
      setDocs(value.data);
      setReads((r) => r + value.reads);
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    if (!docs || !companyId) return null;
    return dteMonthlyTotals(docs.filter((d) => d.companyId === companyId), lastMonthKeys(DTE_MONTHS));
  }, [docs, companyId]);
  const busy = !docs && !error;

  return { busy, companies, companyId, error, reads, rows, setCompanyId };
}
