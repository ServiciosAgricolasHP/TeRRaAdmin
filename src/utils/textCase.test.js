import { describe, it, expect } from "vitest";
import { unshout, toTitleName } from "./textCase";

describe("unshout", () => {
  it("pasa a oración un texto entero en mayúsculas", () => {
    expect(unshout("PAGO ATRASADO POR LLUVIA")).toBe("Pago atrasado por lluvia");
    expect(unshout("SE CORTÓ LA LUZ. LLEGÓ TARDE EL CAMIÓN")).toBe("Se cortó la luz. Llegó tarde el camión");
    expect(unshout("¿FALTA ALGO? NO")).toBe("¿Falta algo? No");
  });

  it("respeta un texto que ya tiene minúsculas", () => {
    expect(unshout("Pago de la OC 1234")).toBe("Pago de la OC 1234");
    expect(unshout("revisar con Juan")).toBe("revisar con Juan");
  });

  it("no toca textos sin letras suficientes", () => {
    expect(unshout("")).toBe("");
    expect(unshout("A")).toBe("A");
    expect(unshout("123-4")).toBe("123-4");
    expect(unshout(null)).toBe(null);
    expect(unshout(undefined)).toBe(undefined);
  });

  it("conserva espacios al inicio y la ñ y las tildes", () => {
    expect(unshout("  AÑO NUEVO")).toBe("  Año nuevo");
  });
});

describe("toTitleName", () => {
  it("pone mayúscula inicial a cada palabra y junta espacios", () => {
    expect(toTitleName("  QUINCENA   16-31   OCTUBRE ")).toBe("Quincena 16-31 Octubre");
    expect(toTitleName("cosecha arándanos")).toBe("Cosecha Arándanos");
  });

  it("deja los conectores en minúscula salvo al inicio", () => {
    expect(toTitleName("PODA Y AMARRE DE PARRONES")).toBe("Poda y Amarre de Parrones");
    expect(toTitleName("de la torre")).toBe("De la Torre");
  });

  it("los artículos van en minúscula solo después de de/del", () => {
    expect(toTitleName("FUNDO LOS ROBLES DE PAINE")).toBe("Fundo Los Robles de Paine");
    expect(toTitleName("quincena de la cosecha")).toBe("Quincena de la Cosecha");
    expect(toTitleName("camino del los andes")).toBe("Camino del los Andes");
  });

  it("capitaliza después de guion, apóstrofe, barra y paréntesis", () => {
    expect(toTitleName("san josé-norte (sector b)")).toBe("San José-Norte (Sector B)");
  });

  it("vacío y null quedan igual", () => {
    expect(toTitleName("")).toBe("");
    expect(toTitleName("   ")).toBe("");
    expect(toTitleName(null)).toBe(null);
  });
});
