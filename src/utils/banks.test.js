import { describe, it, expect } from "vitest";
import {
  BANKS,
  ACCOUNT_TYPES,
  CASH_BANK_CODE,
  DEFAULT_BANK_CODE,
  ACCOUNT_TYPE_RUT,
  bankName,
  accountTypeLabel,
  rutWithoutDv,
  defaultBankDetails,
  isCuentaRut,
  isCashBank,
} from "./banks";

describe("isCashBank", () => {
  // Es el único predicado que decide si a alguien se le transfiere o se le
  // entrega la plata en la mano.
  it("reconoce el código de efectivo", () => {
    expect(isCashBank("EFE")).toBe(true);
  });

  it("no distingue mayúsculas", () => {
    expect(isCashBank("efe")).toBe(true);
    expect(isCashBank("Efe")).toBe(true);
  });

  it("cualquier otro banco es transferencia", () => {
    expect(isCashBank("012")).toBe(false);
    expect(isCashBank("001")).toBe(false);
  });

  it("sin dato NO se asume efectivo", () => {
    // Un trabajador sin banco cargado cae del lado de transferencia, donde la
    // nómina lo marca como dato faltante. Asumir efectivo lo sacaría del
    // control de datos bancarios en silencio.
    expect(isCashBank("")).toBe(false);
    expect(isCashBank(null)).toBe(false);
    expect(isCashBank(undefined)).toBe(false);
  });

  it("el código de efectivo está en el catálogo de bancos", () => {
    expect(BANKS.some((b) => b.code === CASH_BANK_CODE)).toBe(true);
  });
});

describe("catálogo de bancos", () => {
  it("no hay códigos repetidos", () => {
    const codes = BANKS.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("bankName resuelve un código conocido", () => {
    expect(bankName(DEFAULT_BANK_CODE)).toBe(
      BANKS.find((b) => b.code === DEFAULT_BANK_CODE).name,
    );
  });

  it("bankName devuelve el código crudo si no lo conoce", () => {
    expect(bankName("999")).toBe("999");
  });

  it("bankName sin dato devuelve el guión, no vacío", () => {
    expect(bankName("")).toBe("—");
    expect(bankName(null)).toBe("—");
  });

  it("accountTypeLabel acepta el tipo como string o número", () => {
    const rut = ACCOUNT_TYPES.find((t) => t.value === ACCOUNT_TYPE_RUT);
    expect(accountTypeLabel(ACCOUNT_TYPE_RUT)).toBe(rut.label);
    expect(accountTypeLabel(String(ACCOUNT_TYPE_RUT))).toBe(rut.label);
  });

  it("accountTypeLabel con un tipo desconocido no inventa", () => {
    expect(accountTypeLabel(99)).toBe("—");
    expect(accountTypeLabel(undefined)).toBe("—");
  });
});

describe("rutWithoutDv", () => {
  it("saca el dígito verificador", () => {
    expect(rutWithoutDv("12345678-9")).toBe("12345678");
    expect(rutWithoutDv("12345678-K")).toBe("12345678");
  });

  it("un RUT sin guión queda igual", () => {
    expect(rutWithoutDv("12345678")).toBe("12345678");
  });

  it("sin dato devuelve vacío", () => {
    expect(rutWithoutDv("")).toBe("");
    expect(rutWithoutDv(null)).toBe("");
  });
});

describe("defaultBankDetails", () => {
  it("arma una Cuenta RUT del Banco Estado", () => {
    // El orden del array es contrato: [paymentRut, cuenta, tipo, banco].
    expect(defaultBankDetails("12345678-9")).toEqual([
      "12345678-9",
      "12345678",
      ACCOUNT_TYPE_RUT,
      DEFAULT_BANK_CODE,
    ]);
  });

  it("el número de cuenta es el RUT sin dígito verificador", () => {
    const [, cuenta] = defaultBankDetails("9876543-K");
    expect(cuenta).toBe("9876543");
  });

  it("lo que arma pasa el reconocedor de Cuenta RUT", () => {
    expect(isCuentaRut(defaultBankDetails("12345678-9"))).toBe(true);
  });
});

describe("isCuentaRut", () => {
  it("mira el tipo de cuenta, no el banco", () => {
    expect(isCuentaRut(["1-9", "1", ACCOUNT_TYPE_RUT, "001"])).toBe(true);
  });

  it("acepta el tipo como string", () => {
    expect(isCuentaRut(["1-9", "1", String(ACCOUNT_TYPE_RUT), "012"])).toBe(true);
  });

  it("una cuenta corriente no es Cuenta RUT", () => {
    expect(isCuentaRut(["1-9", "1", 1, "012"])).toBe(false);
  });

  it("sin datos bancarios no revienta", () => {
    expect(isCuentaRut(undefined)).toBe(false);
    expect(isCuentaRut([])).toBe(false);
  });
});
