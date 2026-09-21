import { describe, it, expect } from "vitest";
import {
  normalizeRut,
  isForeignRut,
  validateRut,
  formatRutForDisplay,
  cleanRutForStorage,
} from "./rutUtils";

// Los RUT de abajo tienen el dígito verificador calculado a mano con el
// módulo 11, no tomado de la salida de esta misma función: si el test usara
// lo que produce el código, no probaría nada.
//
//   12345678 → suma 138, 138 % 11 = 6, 11 - 6 = 5   → DV "5"
//   12345670 → suma 122, 122 % 11 = 1, 11 - 1 = 10  → DV "K"
//   12345675 → suma 132, 132 % 11 = 0, resto 11     → DV "0"
const VALIDOS = ["11111111-1", "12345678-5", "12345670-K", "12345675-0"];

describe("normalizeRut", () => {
  it("saca puntos y espacios y pasa a mayúscula", () => {
    expect(normalizeRut("12.345.670-k")).toBe("12345670-K");
    expect(normalizeRut(" 12 345 678-5 ")).toBe("12345678-5");
  });

  it("no toca el guion ni agrega uno", () => {
    expect(normalizeRut("123456785")).toBe("123456785");
  });

  it("devuelve vacío para valores sin contenido", () => {
    for (const v of [null, undefined, "", 0]) expect(normalizeRut(v)).toBe("");
  });

  it("cleanRutForStorage es el mismo contrato", () => {
    expect(cleanRutForStorage("12.345.678-5")).toBe(normalizeRut("12.345.678-5"));
  });
});

describe("validateRut", () => {
  it.each(VALIDOS)("acepta %s", (rut) => {
    expect(validateRut(rut)).toBe(true);
  });

  it("acepta el mismo RUT con puntos y en minúscula", () => {
    expect(validateRut("12.345.670-k")).toBe(true);
  });

  it("rechaza un dígito verificador equivocado", () => {
    expect(validateRut("12345678-9")).toBe(false);
    expect(validateRut("11111111-2")).toBe(false);
    // La K solo es válida cuando el módulo 11 da 10.
    expect(validateRut("12345678-K")).toBe(false);
    // Y el 0 solo cuando da 11.
    expect(validateRut("12345678-0")).toBe(false);
  });

  it("rechaza basura y vacíos", () => {
    for (const v of [null, undefined, "", "abc", "12345678", "-5", "12345678-"]) {
      expect(validateRut(v)).toBe(false);
    }
  });

  it("rechaza más de 8 dígitos en un RUT chileno", () => {
    expect(validateRut("123456789-5")).toBe(false);
  });

  describe("cédulas extranjeras (7 a 9 dígitos + B o H)", () => {
    it("acepta el rango completo sin mirar módulo 11", () => {
      expect(validateRut("1234567-B")).toBe(true);
      expect(validateRut("12345678-H")).toBe(true);
      expect(validateRut("123456789-B")).toBe(true);
    });

    it("acepta minúsculas porque normaliza antes", () => {
      expect(validateRut("12345678-b")).toBe(true);
    });

    it("rechaza fuera del rango de dígitos", () => {
      expect(validateRut("123456-B")).toBe(false);
      expect(validateRut("1234567890-B")).toBe(false);
    });

    it("rechaza otras letras", () => {
      expect(validateRut("12345678-X")).toBe(false);
    });
  });
});

describe("isForeignRut", () => {
  it("distingue extranjero de chileno", () => {
    expect(isForeignRut("12345678-B")).toBe(true);
    expect(isForeignRut("12345678-h")).toBe(true);
    expect(isForeignRut("12345678-5")).toBe(false);
    expect(isForeignRut("")).toBe(false);
  });
});

describe("formatRutForDisplay", () => {
  it("pone los puntos de miles", () => {
    expect(formatRutForDisplay("12345678-5")).toBe("12.345.678-5");
    expect(formatRutForDisplay("1234567-B")).toBe("1.234.567-B");
  });

  it("no rompe con RUT cortos", () => {
    expect(formatRutForDisplay("123-5")).toBe("123-5");
    expect(formatRutForDisplay("1234-3")).toBe("1.234-3");
  });

  it("devuelve la entrada normalizada cuando no tiene forma de RUT", () => {
    expect(formatRutForDisplay("TEMP-abc")).toBe("TEMP-ABC");
    expect(formatRutForDisplay("")).toBe("");
  });

  it("es idempotente", () => {
    const una = formatRutForDisplay("12345678-5");
    expect(formatRutForDisplay(una)).toBe(una);
  });
});
