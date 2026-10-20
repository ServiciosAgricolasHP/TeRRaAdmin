import { useState, useEffect } from "react";
import { payrollsService } from "../../../services/payrollsService";

// Los nombres con que cada ciclo aparece en el detalle, el XLSX, los
// comprobantes y el detalle impreso.
export function useCycleTitles({ payroll }) {
  "use no memo";
  // Encabezados editables por ciclo, guardados en el doc de la nómina
  // (`payroll.cycleLabelOverrides`) y aplicados al XLSX, los comprobantes y el
  // detalle impreso. Si la nómina no tiene el campo, arranca desde la copia de
  // localStorage.
  const titleStorageKey = `cash_receipt_titles_${payroll.id || payroll.name}`;
  const [cycleTitleOverrides, setCycleTitleOverrides] = useState(() => {
    const fromPayroll = payroll?.cycleLabelOverrides;
    if (fromPayroll && Object.keys(fromPayroll).length > 0) return { ...fromPayroll };
    try { return JSON.parse(localStorage.getItem(titleStorageKey) || "{}"); } catch { return {}; }
  });

  const setCycleTitle = (cid, val) => {
    setCycleTitleOverrides((prev) => {
      const next = { ...prev };
      const trimmed = String(val || "").trim();
      // Vacío = restaurar default; no guardamos override.
      if (!trimmed) delete next[cid];
      else next[cid] = val;
      return next;
    });
  };

  // Guarda en Firestore 500 ms después del último cambio; localStorage queda
  // como espejo.
  useEffect(() => {
    if (!payroll?.id) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(titleStorageKey, JSON.stringify(cycleTitleOverrides)); } catch {
        /* noop */
      }
      payrollsService
        .update(payroll.id, { cycleLabelOverrides: cycleTitleOverrides })
        .catch((err) => console.warn("No se pudo guardar overrides:", err));
    }, 500);
    return () => clearTimeout(t);
  }, [cycleTitleOverrides, payroll?.id, titleStorageKey]);

  // Helper para mostrar el label con override aplicado.
  const displayCycleLabel = (cycle) =>
    cycleTitleOverrides[cycle.id] || cycle.label || cycle.id;
  return { cycleTitleOverrides, displayCycleLabel, setCycleTitle };
}
