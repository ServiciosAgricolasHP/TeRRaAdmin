import { useState, useEffect } from "react";

// Secciones plegables de la grilla del ciclo (la barra entera, las métricas y
// los precios), guardadas en este dispositivo.
export function useCollapsedSections() {
  "use no memo";
  // Secciones colapsables (métricas y precios), persistidas por dispositivo,
  // para dejarle más alto a la grilla.
  const [metricsCollapsed, setMetricsCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.metricsCollapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.metricsCollapsed", String(metricsCollapsed)); } catch { /* noop */ }
  }, [metricsCollapsed]);
  const [pricesCollapsed, setPricesCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.pricesCollapsed") === "true"; } catch { return false; }
  });
  // Toggle maestro: colapsa TODO el bloque de controles (título+botones,
  // métricas, tabs de labor, barra de la labor activa, chips de días,
  // precios) en una sola línea, para maximizar el alto de la grilla. Los
  // toggles individuales (metricsCollapsed/pricesCollapsed) siguen aplicando
  // cuando este está expandido.
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
    try { return localStorage.getItem("cycleDetail.toolbarCollapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.toolbarCollapsed", String(toolbarCollapsed)); } catch { /* noop */ }
  }, [toolbarCollapsed]);
  useEffect(() => {
    try { localStorage.setItem("cycleDetail.pricesCollapsed", String(pricesCollapsed)); } catch { /* noop */ }
  }, [pricesCollapsed]);
  return {
    metricsCollapsed,
    pricesCollapsed,
    setMetricsCollapsed,
    setPricesCollapsed,
    setToolbarCollapsed,
    toolbarCollapsed,
  };
}
