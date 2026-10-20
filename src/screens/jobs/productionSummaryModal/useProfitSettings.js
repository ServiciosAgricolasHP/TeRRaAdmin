import { useEffect, useMemo, useState } from "react";
import { loadJSON, saveJSON } from "./helpers";
import { columnPct, columnProfit, columnTotalGeneral } from "../../../utils/combinedSummary";

// Ajustes de ganancia de la tabla general. Cosecha, trato y por etapas: monto
// × %, editable por columna; `generalPct` es el control maestro y al
// cambiarlo vacía pctOverrides para que todas las columnas lo sigan. Pago al
// día: sin %; se ingresa lo que paga el cliente (paidToUs) y la ganancia es
// esa cifra menos el monto, o la cifra entera si ya se pagó a los
// trabajadores (workersPaid). Todo se guarda en localStorage por colKey
// (cycleId__laborId). Las reglas viven en `utils/combinedSummary.js`.
export function useProfitSettings() {
  "use no memo";
  const [generalPct, setGeneralPct] = useState(() => loadJSON("generalPct", 40));
  useEffect(() => { saveJSON("generalPct", generalPct); }, [generalPct]);
  const [pctOverrides, setPctOverrides] = useState(() => loadJSON("pctOverrides", {})); // colKey -> % (solo no-jornada)
  useEffect(() => { saveJSON("pctOverrides", pctOverrides); }, [pctOverrides]);
  const [paidToUs, setPaidToUs] = useState(() => loadJSON("paidToUs", {})); // colKey -> $ pagado a nosotros (solo jornada)
  useEffect(() => { saveJSON("paidToUs", paidToUs); }, [paidToUs]);
  const [workersPaid, setWorkersPaid] = useState(() => loadJSON("workersPaid", {})); // colKey -> bool (solo jornada)
  useEffect(() => { saveJSON("workersPaid", workersPaid); }, [workersPaid]);
  // Con IVA se agregan las filas IVA (19% del TOTAL GENERAL) y BRUTO, con
  // valor solo en la columna de total; las columnas por labor quedan en blanco.
  const [vatEnabled, setVatEnabled] = useState(() => loadJSON("ivaEnabled", false));
  useEffect(() => { saveJSON("ivaEnabled", vatEnabled); }, [vatEnabled]);

  const settings = useMemo(
    () => ({ generalPct, pctOverrides, paidToUs, workersPaid }),
    [generalPct, pctOverrides, paidToUs, workersPaid],
  );
  const handleGeneralPctChange = (v) => {
    setGeneralPct(v);
    setPctOverrides({});
  };

  return {
    generalPct,
    handleGeneralPctChange,
    paidToUs,
    setPaidToUs,
    setPctOverrides,
    setVatEnabled,
    setWorkersPaid,
    settings,
    vatEnabled,
    workersPaid,
    effectivePct: (colKey) => columnPct(colKey, settings),
    profitFor: (col, totalAmount) => columnProfit(col, totalAmount, settings),
    totalGeneralFor: (col, totalAmount) => columnTotalGeneral(col, totalAmount, settings),
  };
}
