import { useEffect, useState } from "react";
import { getPayrollConfig, savePayrollConfig } from "../../services/payrollsService";
import { DEFAULT_BANK_FORMAT_ID, bankFormatOf } from "../../utils/bankFormats";

// La configuración de la nómina (`payrollConfig/main`), compartida entre todos
// los usuarios. Se lee al abrir la pantalla para mostrarla; las descargas del
// archivo del banco la vuelven a leer con `currentBankFormat`, así usan el
// formato vigente aunque otro admin lo haya cambiado con la pantalla abierta.
export function usePayrollConfig() {
  const [config, setConfig] = useState({ bankFormat: DEFAULT_BANK_FORMAT_ID });

  useEffect(() => {
    let alive = true;
    getPayrollConfig()
      .then((c) => alive && setConfig(c))
      .catch((err) => console.error(err));
    return () => {
      alive = false;
    };
  }, []);

  // Lanza si no se puede leer: un archivo del banco en un formato que no es el
  // vigente se sube igual y el banco lo rechaza, o paga mal.
  const currentBankFormat = async () => {
    const c = await getPayrollConfig();
    setConfig(c);
    return bankFormatOf(c.bankFormat);
  };

  const save = async (next) => {
    await savePayrollConfig(next);
    setConfig((c) => ({ ...c, ...next }));
  };

  return { config, bankFormat: bankFormatOf(config.bankFormat), currentBankFormat, save };
}
