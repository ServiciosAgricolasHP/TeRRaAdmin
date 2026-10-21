import { describe, it, expect } from "vitest";
import { getPayrollConfig, savePayrollConfig } from "../../src/services/payrollsService";
import { DEFAULT_BANK_FORMAT_ID } from "../../src/utils/bankFormats";
import { set, get } from "./helpers/seed";

// La configuración compartida de la nómina (`payrollConfig/main`): el formato
// del archivo del banco que usan las descargas.
describe("configuración de la nómina", () => {
  it("sin el doc vale el formato por defecto", async () => {
    expect(await getPayrollConfig()).toEqual({ bankFormat: DEFAULT_BANK_FORMAT_ID });
  });

  it("guarda el formato en el doc main y se vuelve a leer", async () => {
    await savePayrollConfig({ bankFormat: DEFAULT_BANK_FORMAT_ID });
    const doc = await get("payrollConfig", "main");
    expect(doc.bankFormat).toBe(DEFAULT_BANK_FORMAT_ID);
    expect(await getPayrollConfig()).toEqual({ bankFormat: DEFAULT_BANK_FORMAT_ID });
  });

  it("un formato que ya no existe se lee como el de por defecto", async () => {
    await set("payrollConfig", "main", { bankFormat: "formatoRetirado" });
    expect(await getPayrollConfig()).toEqual({ bankFormat: DEFAULT_BANK_FORMAT_ID });
  });
});
