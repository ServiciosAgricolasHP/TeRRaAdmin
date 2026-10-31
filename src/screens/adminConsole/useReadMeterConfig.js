import { useEffect, useEffectEvent, useState } from "react";
import { readLogConfigService } from "../../services";
import { attempt } from "../../utils/attempt";

// El interruptor del registro de lecturas (`readLogConfig/main`): se lee al
// abrir la tarjeta, una lectura.
export function useReadMeterConfig() {
  // undefined: cargando; null: nunca se configuró.
  const [config, setConfig] = useState(undefined);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadOnMount = useEffectEvent(async () => {
    const { value, error: err } = await attempt(() => readLogConfigService.getById("main"));
    if (err) setError(err.message || String(err));
    else setConfig(value || null);
  });
  useEffect(() => {
    loadOnMount();
  }, []);

  const save = async (next) => {
    setSaving(true);
    setError("");
    const { error: err } = await attempt(() => readLogConfigService.upsert("main", next, { before: config ?? null }));
    if (err) setError(err.message || String(err));
    else setConfig({ ...(config || {}), ...next });
    setSaving(false);
  };

  return { config, error, saving, save };
}
