import { useEffect, useState } from "react";
import { indicatorsService } from "../../services";
import { attempt } from "../../utils/attempt";

const INDICATORS_DOC = "main";

// Indicadores del banner (sueldo base / día / hora extra). Carga única al
// montar; se editan manualmente vía modal y quedan en el doc `indicators/main`.
export function useIndicators() {
  const [indicators, setIndicators] = useState(null);
  useEffect(() => {
    (async () => {
      const { error: err } = await attempt(async () => {
        const doc = await indicatorsService.getById(INDICATORS_DOC);
        setIndicators(doc || {});
      });
      if (err) setIndicators({});
    })();
  }, []);
  const save = async (values) => {
    await indicatorsService.upsert(INDICATORS_DOC, values);
    setIndicators((prev) => ({ ...(prev || {}), ...values }));
  };
  return { indicators, save };
}
