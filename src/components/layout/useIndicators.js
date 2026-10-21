import { useEffect, useState } from "react";
import { indicatorsService } from "../../services";

const INDICATORS_DOC = "main";

// Indicadores del banner (sueldo base / día / hora extra). Carga única al
// montar; se editan manualmente vía modal y quedan en el doc `indicators/main`.
export function useIndicators() {
  const [indicators, setIndicators] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const doc = await indicatorsService.getById(INDICATORS_DOC);
        setIndicators(doc || {});
      } catch {
        setIndicators({});
      }
    })();
  }, []);
  const save = async (values) => {
    await indicatorsService.upsert(INDICATORS_DOC, values);
    setIndicators((prev) => ({ ...(prev || {}), ...values }));
  };
  return { indicators, save };
}
