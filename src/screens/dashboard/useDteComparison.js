import { useState, useEffect } from "react";
import { companiesService, dteDocumentsService } from "../../services";
import { countedList } from "../../services/cache";
import { DTE_MONTHS, dteMonthlyTotals, lastMonthKeys } from "../../utils/dashboard";

// Comparativa compras/ventas, de una empresa a la vez: `dteDocuments` es la
// colección más grande del sistema y la consulta se acota a la empresa
// elegida.
export function useDteComparison() {
  "use no memo";
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reads, setReads] = useState(0);
  const [error, setError] = useState("");

  // Catálogo de empresas para el selector. Misma clave de caché que
  // Facturación: no cuesta lecturas si esa pantalla ya lo cargó.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, reads } = await countedList(companiesService, {
          order: ["razonSocial", "asc"],
          cache: true,
          ttl: 600_000,
        });
        if (cancelled) return;
        setCompanies(data);
        setCompanyId((prev) => prev || data[0]?.id || "");
        setReads((r) => r + reads);
      } catch (err) {
        if (!cancelled) console.error("[dashboard] empresas:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Comparativa de la empresa elegida. Carga sola con la primera empresa y se
  // rehace al cambiar de empresa. Va por el servicio para quedar cacheada y
  // persistida: salir del Dashboard y volver dentro de 10 minutos no relee.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setRows(null);
    setError("");
    setBusy(true);
    (async () => {
      try {
        const { data, reads } = await countedList(dteDocumentsService, {
          wheres: [
            ["companyId", "==", companyId],
            ["periodo", "in", lastMonthKeys(DTE_MONTHS)],
          ],
          cache: true,
          persist: true,
          ttl: 600_000,
        });
        if (cancelled) return;
        setRows(dteMonthlyTotals(data, lastMonthKeys(DTE_MONTHS)));
        setReads((r) => r + reads);
      } catch (err) {
        if (cancelled) return;
        // La consulta cruza `companyId` con `periodo` y puede pedir un índice
        // compuesto. El mensaje de Firestore trae el link para crearlo: va a la
        // consola del navegador.
        console.error("[dashboard] comparativa de facturación:", err);
        setError(
          err.code === "failed-precondition"
            ? "Falta un índice en Firestore para esta consulta (el detalle está en la consola del navegador)."
            : "No se pudo cargar la facturación de esta empresa.",
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { busy, companies, companyId, error, reads, rows, setCompanyId };
}
