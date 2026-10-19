import { useRef, useEffect } from "react";
import { cyclesService, cycleSummariesService } from "../../../services";

// Al cerrar el resumen, o al desmontarlo, guarda lo que el debounce dejó
// pendiente y los totales de pagar y cobrar en el ciclo.
export function useSummaryFlush({ charge, cycleId, grandTotalCharge, grandTotalPay, hydratedRef, lastSavedRef, lastTotalsRef, open, titles }) {
  "use no memo";
  // Guarda los totales de pagar y cobrar en `cycle.summaryTotals`, de donde el
  // Dashboard saca el margen por ciclo sin leer `cycleSummaries` (una lectura
  // por ciclo). Solo escribe si cambiaron.
  //
  // `additive: true` actualiza la caché de `cycles` en vez de invalidarla, así
  // las demás pantallas no vuelven a leer la colección.
  const saveCycleTotals = () => {
    const pay = Math.round(grandTotalPay);
    const charge = Math.round(grandTotalCharge);
    if (pay <= 0 && charge <= 0) return; // modal cerrado antes de cargar
    const prev = lastTotalsRef.current;
    if (prev && prev.pagar === pay && prev.cobrar === charge) return;
    lastTotalsRef.current = { pagar: pay, cobrar: charge };
    cyclesService
      .update(cycleId, { summaryTotals: { pagar: pay, cobrar: charge, at: new Date().toISOString() } }, { additive: true })
      .catch((err) => {
        lastTotalsRef.current = prev;
        console.error("[resumen] totales del ciclo:", err);
      });
  };

  // Al cerrar o desmontar, guarda lo que quedó pendiente: cerrar cancela el
  // timer del guardado con debounce.
  const flushRef = useRef(null);
  useEffect(() => {
    flushRef.current = () => {
      if (!cycleId || !hydratedRef.current) return;
      const c = JSON.stringify(charge);
      const t = JSON.stringify(titles);
      const patch = {};
      if (c !== lastSavedRef.current.cobrar) { patch.cobrar = charge; lastSavedRef.current.cobrar = c; }
      if (t !== lastSavedRef.current.titles) { patch.titles = titles; lastSavedRef.current.titles = t; }
      if (Object.keys(patch).length) {
        cycleSummariesService.save(cycleId, patch).catch((err) => {
          lastSavedRef.current = { cobrar: null, titles: null };
          console.error("[resumen] guardar al cerrar:", err);
        });
      }
      saveCycleTotals();
    };
  });
  useEffect(() => {
    if (open) return;
    flushRef.current?.();
  }, [open]);
  useEffect(() => () => flushRef.current?.(), []);
}
